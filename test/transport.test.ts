import { describe, expect, it, vi } from "vitest";

import { StaticTokenProvider, type TokenProvider } from "../src/auth.js";
import { AuthRequiredError, EgressConsentRequiredError, RpcError } from "../src/errors.js";
import { PROTOCOL_VERSION_HEADER, SESSION_ID_HEADER } from "../src/protocol.js";
import { StreamableHttpTransport } from "../src/transport.js";

const ENDPOINT = "https://app.matih.test/api/v1/mcp";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function transportWith(fetchImpl: typeof fetch, provider?: TokenProvider) {
  return new StreamableHttpTransport({
    endpoint: ENDPOINT,
    tokenProvider: provider ?? new StaticTokenProvider("tok-1"),
    fetchImpl,
  });
}

describe("StreamableHttpTransport", () => {
  it("sends Bearer + version header and returns the JSON-RPC result", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ jsonrpc: "2.0", id: "matih-1", result: { ok: true } }));
    const t = transportWith(fetchImpl as unknown as typeof fetch);

    const result = await t.request("tools/list");

    expect(result).toEqual({ ok: true });
    const [, init] = fetchImpl.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["authorization"]).toBe("Bearer tok-1");
    expect(headers[PROTOCOL_VERSION_HEADER]).toBe("2025-11-25");
  });

  it("omits the version header ON initialize and captures the session id + negotiated version", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { jsonrpc: "2.0", id: "matih-1", result: { protocolVersion: "2025-06-18" } },
        { headers: { "content-type": "application/json", [SESSION_ID_HEADER]: "sess-xyz" } },
      ),
    );
    const t = transportWith(fetchImpl as unknown as typeof fetch);

    await t.request("initialize", { protocolVersion: "2025-11-25" }, { isInitialize: true });

    const [, init] = fetchImpl.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers[PROTOCOL_VERSION_HEADER]).toBeUndefined();
    expect(t.sessionId).toBe("sess-xyz");
    expect(t.negotiatedVersion).toBe("2025-06-18");
  });

  it("echoes the session id on subsequent requests", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { jsonrpc: "2.0", id: "matih-1", result: { protocolVersion: "2025-11-25" } },
          { headers: { "content-type": "application/json", [SESSION_ID_HEADER]: "sess-1" } },
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: "2.0", id: "matih-2", result: {} }));
    const t = transportWith(fetchImpl as unknown as typeof fetch);

    await t.request("initialize", {}, { isInitialize: true });
    await t.request("tools/list");

    const [, init] = fetchImpl.mock.calls[1]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers[SESSION_ID_HEADER]).toBe("sess-1");
  });

  it("throws RpcError when the response carries a JSON-RPC error", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ jsonrpc: "2.0", id: "matih-1", error: { code: -32602, message: "bad params" } }),
    );
    const t = transportWith(fetchImpl as unknown as typeof fetch);
    await expect(t.request("tools/call")).rejects.toBeInstanceOf(RpcError);
  });

  it("retries ONCE after 401 when the provider can refresh", async () => {
    const provider: TokenProvider = {
      getToken: vi.fn(async () => "stale"),
      onUnauthorized: vi.fn(async () => "fresh"),
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("{}", {
          status: 401,
          headers: { "www-authenticate": 'Bearer error="invalid_token", resource_metadata="https://x/.well-known/y"' },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: "2.0", id: "matih-1", result: { ok: 1 } }));
    const t = transportWith(fetchImpl as unknown as typeof fetch, provider);

    const result = await t.request("tools/list");
    expect(result).toEqual({ ok: 1 });
    expect(provider.onUnauthorized).toHaveBeenCalledOnce();
    const [, retryInit] = fetchImpl.mock.calls[1]!;
    expect((retryInit as RequestInit).headers as Record<string, string>).toMatchObject({
      authorization: "Bearer fresh",
    });
  });

  it("surfaces AuthRequiredError when a static token is rejected (no refresh path)", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("{}", {
        status: 401,
        headers: { "www-authenticate": 'Bearer error="invalid_token", error_description="exp", resource_metadata="https://x/m"' },
      }),
    );
    const t = transportWith(fetchImpl as unknown as typeof fetch);
    await expect(t.request("tools/list")).rejects.toMatchObject({
      name: "AuthRequiredError",
      kind: "invalid_token",
      resourceMetadataUrl: "https://x/m",
    });
  });

  it("maps a 403 EGRESS_CONSENT_REQUIRED to EgressConsentRequiredError", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ error_code: "EGRESS_CONSENT_REQUIRED", detail: "accept the DPA", consent_url: "https://app/consent" }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    );
    const t = transportWith(fetchImpl as unknown as typeof fetch);
    await expect(t.request("tools/call")).rejects.toMatchObject({
      name: "EgressConsentRequiredError",
      consentUrl: "https://app/consent",
    });
    await expect(t.request("tools/call")).rejects.toBeInstanceOf(EgressConsentRequiredError);
  });

  it("notify accepts a 202 with no body", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    const t = transportWith(fetchImpl as unknown as typeof fetch);
    await expect(t.notify("notifications/initialized")).resolves.toBeUndefined();
  });
});
