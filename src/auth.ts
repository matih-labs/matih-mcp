// Token providers — how the transport obtains (and refreshes) a bearer token.

import {
  fetchAuthorizationServerMetadata,
  fetchProtectedResourceMetadata,
  type AuthorizationServerMetadata,
} from "./discovery.js";
import { AuthRequiredError } from "./errors.js";
import { exchangeCode, refreshToken, type TokenSet } from "./oauth.js";

export interface TokenProvider {
  /** Current bearer token (acquire/refresh as needed). */
  getToken(): Promise<string>;
  /**
   * Called when the server rejects the current token (401 invalid_token). Implementations
   * should invalidate any cache and return a fresh token, or null if they cannot.
   */
  onUnauthorized?(resourceMetadataUrl?: string): Promise<string | null>;
}

/** A fixed token (e.g. MATIH_MCP_TOKEN). The bridge uses this — env-only delivery. */
export class StaticTokenProvider implements TokenProvider {
  constructor(private readonly token: string) {
    if (!token || !token.trim()) {
      throw new AuthRequiredError("missing", undefined, "no static token supplied");
    }
  }
  getToken(): Promise<string> {
    return Promise.resolve(this.token);
  }
  // No onUnauthorized: a rejected static token is an operator problem (rotate the env value).
}

/**
 * Acquire an authorization code interactively (or otherwise). Returns the code plus the PKCE
 * verifier and redirect_uri used, so the provider can complete the exchange. Injected so the
 * OAuth provider is testable without a browser; the CLI supplies a loopback-browser impl.
 */
export type AuthCodeAcquirer = (input: {
  metadata: AuthorizationServerMetadata;
  clientId: string;
  resource: string;
  scope?: string;
}) => Promise<{ code: string; verifier: string; redirectUri: string }>;

export interface OAuthTokenProviderOptions {
  /** The RFC 9728 resource_metadata URL (from the 401 challenge or configured up front). */
  resourceMetadataUrl: string;
  clientId: string;
  acquire: AuthCodeAcquirer;
  scope?: string;
  fetchImpl?: typeof fetch;
  /** Refresh this many ms before the token's stated expiry (default 30s). */
  earlyRefreshMs?: number;
  now?: () => number;
}

/** Full OAuth lifecycle: discover → PKCE authorize → exchange → cache → refresh. */
export class OAuthTokenProvider implements TokenProvider {
  #token: TokenSet | undefined;
  #resource: string | undefined;
  #asMeta: AuthorizationServerMetadata | undefined;
  readonly #opts: Required<Pick<OAuthTokenProviderOptions, "fetchImpl" | "earlyRefreshMs" | "now">> &
    OAuthTokenProviderOptions;

  constructor(opts: OAuthTokenProviderOptions) {
    this.#opts = {
      ...opts,
      fetchImpl: opts.fetchImpl ?? fetch,
      earlyRefreshMs: opts.earlyRefreshMs ?? 30_000,
      now: opts.now ?? (() => Date.now()),
    };
  }

  async getToken(): Promise<string> {
    const now = this.#opts.now();
    const t = this.#token;
    if (t && (t.expiresAt === undefined || t.expiresAt - this.#opts.earlyRefreshMs > now)) {
      return t.accessToken;
    }
    if (t?.refreshToken && this.#resource && this.#asMeta) {
      try {
        this.#token = await refreshToken({
          tokenEndpoint: this.#asMeta.token_endpoint,
          clientId: this.#opts.clientId,
          refreshToken: t.refreshToken,
          resource: this.#resource,
          fetchImpl: this.#opts.fetchImpl,
          nowMs: now,
        });
        return this.#token.accessToken;
      } catch {
        // fall through to a fresh authorization
      }
    }
    return this.#authorize();
  }

  async onUnauthorized(): Promise<string | null> {
    // Drop the cache and force a fresh authorization (the server says the token is no good).
    this.#token = undefined;
    try {
      return await this.#authorize();
    } catch {
      return null;
    }
  }

  async #authorize(): Promise<string> {
    const { fetchImpl } = this.#opts;
    const prm = await fetchProtectedResourceMetadata(this.#opts.resourceMetadataUrl, fetchImpl);
    const issuer = prm.authorization_servers?.[0];
    if (!issuer) {
      throw new AuthRequiredError("invalid_token", this.#opts.resourceMetadataUrl, "no authorization_servers in PRM");
    }
    this.#resource = prm.resource;
    this.#asMeta = await fetchAuthorizationServerMetadata(issuer, fetchImpl);
    const { code, verifier, redirectUri } = await this.#opts.acquire({
      metadata: this.#asMeta,
      clientId: this.#opts.clientId,
      resource: prm.resource,
      scope: this.#opts.scope ?? prm.scopes_supported?.join(" "),
    });
    this.#token = await exchangeCode({
      tokenEndpoint: this.#asMeta.token_endpoint,
      clientId: this.#opts.clientId,
      code,
      redirectUri,
      verifier,
      resource: prm.resource,
      fetchImpl,
      nowMs: this.#opts.now(),
    });
    return this.#token.accessToken;
  }
}
