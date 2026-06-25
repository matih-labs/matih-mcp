// OAuth discovery: RFC 9728 (protected-resource-metadata) → RFC 8414 / OIDC
// (authorization-server-metadata). The Matih MCP server points a 401 at its PRM URL via the
// WWW-Authenticate `resource_metadata` param; the PRM names the authorization server (Logto),
// whose metadata yields the authorize + token endpoints.

import { TransportError } from "./errors.js";

export interface ProtectedResourceMetadata {
  /** RFC 8707 audience — passed as `resource` on token requests. */
  resource: string;
  /** Authorization server issuer URL(s); the first is used. */
  authorization_servers?: string[];
  bearer_methods_supported?: string[];
  scopes_supported?: string[];
  resource_documentation?: string;
}

export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  code_challenge_methods_supported?: string[];
  scopes_supported?: string[];
}

async function fetchJson<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  let resp: Response;
  try {
    resp = await fetchImpl(url, { headers: { accept: "application/json" } });
  } catch (cause) {
    throw new TransportError(`discovery fetch failed: ${url}`, undefined, { cause });
  }
  if (!resp.ok) {
    throw new TransportError(`discovery ${resp.status} for ${url}`, resp.status);
  }
  return (await resp.json()) as T;
}

export async function fetchProtectedResourceMetadata(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProtectedResourceMetadata> {
  const prm = await fetchJson<ProtectedResourceMetadata>(url, fetchImpl);
  if (!prm.resource) {
    throw new TransportError(`protected-resource-metadata missing 'resource': ${url}`);
  }
  return prm;
}

/**
 * Fetch authorization-server metadata for an issuer. Tries the RFC 8414 well-known path first,
 * then the OIDC discovery path (Logto serves the latter). The first that resolves wins.
 */
export async function fetchAuthorizationServerMetadata(
  issuer: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthorizationServerMetadata> {
  const base = issuer.replace(/\/+$/, "");
  const candidates = [
    `${base}/.well-known/oauth-authorization-server`,
    `${base}/.well-known/openid-configuration`,
    `${base}/oidc/.well-known/openid-configuration`,
  ];
  let lastErr: unknown;
  for (const url of candidates) {
    try {
      const meta = await fetchJson<AuthorizationServerMetadata>(url, fetchImpl);
      if (meta.authorization_endpoint && meta.token_endpoint) {
        return meta;
      }
    } catch (err) {
      lastErr = err;
    }
  }
  throw new TransportError(
    `could not resolve authorization-server metadata for issuer ${issuer}`,
    undefined,
    { cause: lastErr },
  );
}
