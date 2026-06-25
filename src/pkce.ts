// RFC 7636 PKCE (Proof Key for Code Exchange) — S256 only.
//
// The Matih MCP OAuth flow is a public client (no client secret), so PKCE S256 is
// mandatory: a one-time high-entropy `code_verifier` is generated, its SHA-256
// (base64url, no padding) is sent as `code_challenge` on the authorize request, and the
// raw verifier is presented on the token exchange. An intercepted authorization code is
// useless without the verifier.

import { createHash, randomBytes } from "node:crypto";

export interface PkcePair {
  /** The secret kept by the client and presented at the token endpoint. */
  verifier: string;
  /** base64url(SHA-256(verifier)) — sent on the authorize request. */
  challenge: string;
  /** Always "S256" for this client (plain is forbidden). */
  method: "S256";
}

/** base64url with no padding (RFC 4648 §5), per the PKCE spec. */
export function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Generate a PKCE S256 pair. The verifier is a 32-byte (256-bit) random value rendered
 * as 43 base64url chars — within the RFC's 43–128 char range with ample entropy.
 */
export function generatePkce(): PkcePair {
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = base64UrlEncode(createHash("sha256").update(verifier).digest());
  return { verifier, challenge, method: "S256" };
}

/** A URL-safe random `state` value for CSRF protection on the authorize redirect. */
export function generateState(): string {
  return base64UrlEncode(randomBytes(24));
}
