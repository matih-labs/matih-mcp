// Error model + WWW-Authenticate parsing for the Matih MCP client.

import type { JsonRpcErrorObject } from "./jsonrpc.js";

/** Base class for every error this SDK raises. */
export class MatihMcpError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Transport-layer failure (network, non-JSON body, unexpected HTTP status). */
export class TransportError extends MatihMcpError {
  constructor(
    message: string,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/** A JSON-RPC error object returned by the server for a request. */
export class RpcError extends MatihMcpError {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }

  static from(err: JsonRpcErrorObject): RpcError {
    return new RpcError(err.code, err.message, err.data);
  }
}

/**
 * The server demands a (different) bearer token. Carries the parsed RFC 9728 challenge so the
 * caller / TokenProvider can run discovery. `kind` distinguishes "no token at all" from
 * "token present but rejected" (the latter should trigger a fresh acquisition, not a loop).
 */
export class AuthRequiredError extends MatihMcpError {
  constructor(
    readonly kind: "missing" | "invalid_token",
    readonly resourceMetadataUrl: string | undefined,
    readonly reason: string | undefined,
  ) {
    super(
      kind === "missing"
        ? "MCP access requires a bearer token"
        : `MCP bearer token rejected${reason ? `: ${reason}` : ""}`,
    );
  }
}

/**
 * The tenant has not accepted third-party-LLM data egress (the Phase 2.2 consent gate, HTTP
 * 403 `EGRESS_CONSENT_REQUIRED`). Distinct from AuthRequiredError — re-authing will NOT help;
 * a human must accept the DPA in the Matih app.
 */
export class EgressConsentRequiredError extends MatihMcpError {
  constructor(
    readonly detail: string,
    readonly consentUrl?: string,
  ) {
    super(detail);
  }
}

/**
 * Parse an RFC 7235 `WWW-Authenticate: Bearer …` challenge into its auth-params. The Matih
 * server emits `Bearer resource_metadata="…"` (missing token) or
 * `Bearer error="invalid_token", error_description="…", resource_metadata="…"` (rejected).
 */
export function parseWwwAuthenticate(header: string | null | undefined): {
  scheme?: string;
  error?: string;
  errorDescription?: string;
  resourceMetadata?: string;
} {
  if (!header) {
    return {};
  }
  const trimmed = header.trim();
  const spaceIdx = trimmed.indexOf(" ");
  const scheme = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase();
  const rest = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1);
  const params: Record<string, string> = {};
  // Match key="value" or key=value pairs.
  const re = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|([^\s,]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest)) !== null) {
    const key = m[1];
    if (key === undefined) {
      continue;
    }
    params[key.toLowerCase()] = m[2] ?? m[3] ?? "";
  }
  return {
    scheme,
    error: params["error"],
    errorDescription: params["error_description"],
    resourceMetadata: params["resource_metadata"],
  };
}
