import { describe, expect, it, vi } from "vitest";

import { fetchAuthorizationServerMetadata, fetchProtectedResourceMetadata } from "../src/discovery.js";

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
function notFound(): Response {
  return new Response("nope", { status: 404 });
}

describe("discovery", () => {
  it("fetchProtectedResourceMetadata returns the PRM", async () => {
    const fetchImpl = vi.fn(async () =>
      ok({ resource: "https://app/api/v1/mcp", authorization_servers: ["https://auth.matih.test"] }),
    );
    const prm = await fetchProtectedResourceMetadata("https://app/.well-known/oauth-protected-resource/api/v1/mcp", fetchImpl as unknown as typeof fetch);
    expect(prm.resource).toBe("https://app/api/v1/mcp");
    expect(prm.authorization_servers).toEqual(["https://auth.matih.test"]);
  });

  it("throws when PRM lacks a resource", async () => {
    const fetchImpl = vi.fn(async () => ok({ authorization_servers: ["https://auth"] }));
    await expect(
      fetchProtectedResourceMetadata("https://app/.well-known/x", fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/missing 'resource'/);
  });

  it("falls through candidate AS-metadata paths until one resolves", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(notFound()) // /.well-known/oauth-authorization-server
      .mockResolvedValueOnce(
        ok({
          issuer: "https://auth.matih.test",
          authorization_endpoint: "https://auth.matih.test/authorize",
          token_endpoint: "https://auth.matih.test/token",
        }),
      );
    const meta = await fetchAuthorizationServerMetadata("https://auth.matih.test/", fetchImpl as unknown as typeof fetch);
    expect(meta.authorization_endpoint).toBe("https://auth.matih.test/authorize");
    expect(meta.token_endpoint).toBe("https://auth.matih.test/token");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws when no AS-metadata candidate resolves", async () => {
    const fetchImpl = vi.fn(async () => notFound());
    await expect(
      fetchAuthorizationServerMetadata("https://auth.matih.test", fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/could not resolve authorization-server metadata/);
  });
});
