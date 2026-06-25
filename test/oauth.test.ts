import { describe, expect, it, vi } from "vitest";

import { buildAuthorizeUrl, exchangeCode, refreshToken } from "../src/oauth.js";

describe("buildAuthorizeUrl", () => {
  it("includes PKCE S256, resource, state, and the public-client params", () => {
    const { url, verifier, state } = buildAuthorizeUrl({
      metadata: { authorization_endpoint: "https://auth.matih.test/authorize" },
      clientId: "matih-cli",
      redirectUri: "http://127.0.0.1:9999/callback",
      resource: "https://app.matih.test/api/v1/mcp",
      scope: "openid",
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://auth.matih.test/authorize");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("matih-cli");
    expect(u.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:9999/callback");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBeTruthy();
    expect(u.searchParams.get("resource")).toBe("https://app.matih.test/api/v1/mcp");
    expect(u.searchParams.get("scope")).toBe("openid");
    expect(u.searchParams.get("state")).toBe(state);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });
});

describe("token exchange", () => {
  it("exchangeCode posts the code + verifier + resource and returns a TokenSet", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: "at", token_type: "Bearer", expires_in: 3600, refresh_token: "rt" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const ts = await exchangeCode({
      tokenEndpoint: "https://auth.matih.test/token",
      clientId: "matih-cli",
      code: "abc",
      redirectUri: "http://127.0.0.1:9999/callback",
      verifier: "v".repeat(43),
      resource: "https://app.matih.test/api/v1/mcp",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      nowMs: 1_000_000,
    });
    expect(ts.accessToken).toBe("at");
    expect(ts.refreshToken).toBe("rt");
    expect(ts.expiresAt).toBe(1_000_000 + 3600 * 1000);

    const [, init] = fetchImpl.mock.calls[0]!;
    const body = new URLSearchParams((init as RequestInit).body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code_verifier")).toBe("v".repeat(43));
    expect(body.get("resource")).toBe("https://app.matih.test/api/v1/mcp");
  });

  it("refreshToken uses grant_type=refresh_token and stays audience-bound", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: "at2", token_type: "Bearer" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const ts = await refreshToken({
      tokenEndpoint: "https://auth.matih.test/token",
      clientId: "matih-cli",
      refreshToken: "rt",
      resource: "https://app.matih.test/api/v1/mcp",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(ts.accessToken).toBe("at2");
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = new URLSearchParams((init as RequestInit).body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("resource")).toBe("https://app.matih.test/api/v1/mcp");
  });

  it("throws on a token-endpoint error response", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: "invalid_grant", error_description: "nope" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(
      exchangeCode({
        tokenEndpoint: "https://auth.matih.test/token",
        clientId: "matih-cli",
        code: "abc",
        redirectUri: "http://127.0.0.1:9999/callback",
        verifier: "v".repeat(43),
        resource: "https://app.matih.test/api/v1/mcp",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/invalid_grant/);
  });
});
