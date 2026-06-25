// OAuth 2.1 authorization-code + PKCE for a PUBLIC client (no secret), with RFC 8707
// resource indicators so the issued access token is audience-bound to the MCP resource.

import type { AuthorizationServerMetadata } from "./discovery.js";
import { TransportError } from "./errors.js";
import { generatePkce, generateState, type PkcePair } from "./pkce.js";

export interface TokenSet {
  accessToken: string;
  tokenType: string;
  /** Epoch milliseconds when the access token expires (best-effort from expires_in). */
  expiresAt?: number;
  refreshToken?: string;
  scope?: string;
}

export interface AuthorizeRequest {
  url: string;
  verifier: string;
  state: string;
}

export interface BuildAuthorizeUrlParams {
  metadata: Pick<AuthorizationServerMetadata, "authorization_endpoint">;
  clientId: string;
  redirectUri: string;
  /** RFC 8707 audience (the PRM `resource`). */
  resource: string;
  scope?: string;
  pkce?: PkcePair;
  state?: string;
}

/** Build the authorization-endpoint URL (PKCE S256, RFC 8707 resource). */
export function buildAuthorizeUrl(params: BuildAuthorizeUrlParams): AuthorizeRequest {
  const pkce = params.pkce ?? generatePkce();
  const state = params.state ?? generateState();
  const u = new URL(params.metadata.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", params.clientId);
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("code_challenge", pkce.challenge);
  u.searchParams.set("code_challenge_method", pkce.method);
  u.searchParams.set("state", state);
  u.searchParams.set("resource", params.resource);
  if (params.scope) {
    u.searchParams.set("scope", params.scope);
  }
  return { url: u.toString(), verifier: pkce.verifier, state };
}

interface RawTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

function toTokenSet(raw: RawTokenResponse, nowMs: number): TokenSet {
  if (!raw.access_token) {
    throw new TransportError(
      `token endpoint returned no access_token${raw.error ? ` (${raw.error}: ${raw.error_description ?? ""})` : ""}`,
    );
  }
  return {
    accessToken: raw.access_token,
    tokenType: raw.token_type ?? "Bearer",
    expiresAt: typeof raw.expires_in === "number" ? nowMs + raw.expires_in * 1000 : undefined,
    refreshToken: raw.refresh_token,
    scope: raw.scope,
  };
}

async function postToken(
  tokenEndpoint: string,
  body: URLSearchParams,
  fetchImpl: typeof fetch,
  nowMs: number,
): Promise<TokenSet> {
  let resp: Response;
  try {
    resp = await fetchImpl(tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: body.toString(),
    });
  } catch (cause) {
    throw new TransportError(`token request failed: ${tokenEndpoint}`, undefined, { cause });
  }
  const raw = (await resp.json().catch(() => ({}))) as RawTokenResponse;
  if (!resp.ok) {
    throw new TransportError(
      `token endpoint ${resp.status}${raw.error ? ` ${raw.error}: ${raw.error_description ?? ""}` : ""}`,
      resp.status,
    );
  }
  return toTokenSet(raw, nowMs);
}

export interface ExchangeCodeParams {
  tokenEndpoint: string;
  clientId: string;
  code: string;
  redirectUri: string;
  verifier: string;
  resource: string;
  fetchImpl?: typeof fetch;
  nowMs?: number;
}

/** Exchange an authorization code (+ PKCE verifier) for tokens. */
export function exchangeCode(params: ExchangeCodeParams): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: params.clientId,
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.verifier,
    resource: params.resource,
  });
  return postToken(params.tokenEndpoint, body, params.fetchImpl ?? fetch, params.nowMs ?? nowFallback());
}

export interface RefreshParams {
  tokenEndpoint: string;
  clientId: string;
  refreshToken: string;
  resource: string;
  fetchImpl?: typeof fetch;
  nowMs?: number;
}

/** Refresh an access token (audience-bound via `resource`). */
export function refreshToken(params: RefreshParams): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: params.clientId,
    refresh_token: params.refreshToken,
    resource: params.resource,
  });
  return postToken(params.tokenEndpoint, body, params.fetchImpl ?? fetch, params.nowMs ?? nowFallback());
}

function nowFallback(): number {
  return Date.now();
}
