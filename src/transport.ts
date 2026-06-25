// Streamable-HTTP transport for the single Matih MCP endpoint (POST /api/v1/mcp).
//
// One JSON-RPC message per POST (no batching). A request (has id) returns one JSON object; a
// notification (no id) returns 202. Auth is Bearer; a 401 carries an RFC 9728 challenge and is
// retried once after the TokenProvider refreshes; a 403 EGRESS_CONSENT_REQUIRED surfaces as a
// distinct, non-retryable error.

import type { TokenProvider } from "./auth.js";
import {
  AuthRequiredError,
  EgressConsentRequiredError,
  RpcError,
  TransportError,
  parseWwwAuthenticate,
} from "./errors.js";
import { RequestIdFactory, isJsonRpcResponse, type JsonRpcResponse } from "./jsonrpc.js";
import {
  LATEST_PROTOCOL_VERSION,
  PROTOCOL_VERSION_HEADER,
  SESSION_ID_HEADER,
  type ProtocolVersion,
} from "./protocol.js";

export interface TransportOptions {
  /** Full URL of the MCP endpoint, e.g. https://app.matih.ai/api/v1/mcp. */
  endpoint: string;
  tokenProvider: TokenProvider;
  fetchImpl?: typeof fetch;
  /** Optional Origin header (browser/DNS-rebinding allowlist). */
  origin?: string;
  /** Protocol version sent on initialize (default LATEST). */
  protocolVersion?: ProtocolVersion;
}

export class StreamableHttpTransport {
  readonly #opts: TransportOptions;
  readonly #fetch: typeof fetch;
  readonly #ids = new RequestIdFactory();
  #sessionId: string | undefined;
  #negotiatedVersion: string;

  constructor(opts: TransportOptions) {
    this.#opts = opts;
    this.#fetch = opts.fetchImpl ?? fetch;
    this.#negotiatedVersion = opts.protocolVersion ?? LATEST_PROTOCOL_VERSION;
  }

  get sessionId(): string | undefined {
    return this.#sessionId;
  }
  get negotiatedVersion(): string {
    return this.#negotiatedVersion;
  }

  /** Send a JSON-RPC request and return its `result` (or throw an RpcError / typed error). */
  async request(method: string, params?: unknown, opts?: { isInitialize?: boolean }): Promise<unknown> {
    const isInitialize = opts?.isInitialize ?? false;
    const id = this.#ids.next();
    const payload = { jsonrpc: "2.0" as const, id, method, ...(params === undefined ? {} : { params }) };

    let resp = await this.#post(payload, isInitialize, await this.#opts.tokenProvider.getToken());

    if (resp.status === 401) {
      const refreshed = await this.#handleUnauthorized(resp);
      if (refreshed !== null) {
        resp = await this.#post(payload, isInitialize, refreshed);
      }
    }
    if (resp.status === 403) {
      await this.#throwForbidden(resp);
    }
    if (resp.status === 401) {
      // Still 401 after the single retry — surface the challenge.
      const wa = parseWwwAuthenticate(resp.headers.get("www-authenticate"));
      throw new AuthRequiredError(
        wa.error === "invalid_token" ? "invalid_token" : "missing",
        wa.resourceMetadata,
        wa.errorDescription,
      );
    }
    if (!resp.ok) {
      throw new TransportError(`MCP HTTP ${resp.status} for ${method}`, resp.status);
    }

    // Capture the server-assigned session id on initialize.
    const sid = resp.headers.get(SESSION_ID_HEADER);
    if (sid) {
      this.#sessionId = sid;
    }

    const body = (await resp.json().catch((cause) => {
      throw new TransportError("MCP response was not valid JSON", resp.status, { cause });
    })) as JsonRpcResponse;
    if (!isJsonRpcResponse(body)) {
      throw new TransportError("MCP response was not a JSON-RPC message", resp.status);
    }
    if (body.error) {
      throw RpcError.from(body.error);
    }
    if (isInitialize) {
      const negotiated = (body.result as { protocolVersion?: string } | undefined)?.protocolVersion;
      if (negotiated) {
        this.#negotiatedVersion = negotiated;
      }
    }
    return body.result;
  }

  /** Send a JSON-RPC notification (no id); the server replies 202. */
  async notify(method: string, params?: unknown): Promise<void> {
    const payload = { jsonrpc: "2.0" as const, method, ...(params === undefined ? {} : { params }) };
    const resp = await this.#post(payload, false, await this.#opts.tokenProvider.getToken());
    if (resp.status !== 202 && !resp.ok) {
      if (resp.status === 403) {
        await this.#throwForbidden(resp);
      }
      throw new TransportError(`MCP notification HTTP ${resp.status} for ${method}`, resp.status);
    }
  }

  async #post(payload: unknown, isInitialize: boolean, token: string): Promise<Response> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${token}`,
    };
    // The version header is required on every request AFTER initialize.
    if (!isInitialize) {
      headers[PROTOCOL_VERSION_HEADER] = this.#negotiatedVersion;
    }
    if (this.#sessionId) {
      headers[SESSION_ID_HEADER] = this.#sessionId;
    }
    if (this.#opts.origin) {
      headers["origin"] = this.#opts.origin;
    }
    try {
      return await this.#fetch(this.#opts.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
    } catch (cause) {
      throw new TransportError(`MCP request transport error`, undefined, { cause });
    }
  }

  async #handleUnauthorized(resp: Response): Promise<string | null> {
    const wa = parseWwwAuthenticate(resp.headers.get("www-authenticate"));
    const provider = this.#opts.tokenProvider;
    if (typeof provider.onUnauthorized === "function") {
      return provider.onUnauthorized(wa.resourceMetadata);
    }
    return null;
  }

  async #throwForbidden(resp: Response): Promise<never> {
    const problem = (await resp.json().catch(() => ({}))) as {
      error_code?: string;
      detail?: string;
      consent_url?: string;
      title?: string;
    };
    if (problem.error_code === "EGRESS_CONSENT_REQUIRED") {
      throw new EgressConsentRequiredError(
        problem.detail ??
          "This tenant has not accepted third-party-LLM data egress. Accept the data-processing agreement in Matih to use MCP.",
        problem.consent_url,
      );
    }
    throw new TransportError(problem.detail ?? problem.title ?? `MCP HTTP 403`, 403);
  }
}
