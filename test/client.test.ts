import { describe, expect, it, vi } from "vitest";

import { StaticTokenProvider } from "../src/auth.js";
import { McpClient } from "../src/client.js";
import { SESSION_ID_HEADER } from "../src/protocol.js";
import { MatihTools } from "../src/tools.js";

function json(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
}

function clientWith(fetchImpl: typeof fetch): McpClient {
  return new McpClient({
    endpoint: "https://app.matih.test/api/v1/mcp",
    tokenProvider: new StaticTokenProvider("tok"),
    fetchImpl,
  });
}

describe("McpClient", () => {
  it("initialize runs the handshake and sends notifications/initialized", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        json(
          { jsonrpc: "2.0", id: "matih-1", result: { protocolVersion: "2025-11-25", capabilities: {}, serverInfo: { name: "matih" } } },
          { [SESSION_ID_HEADER]: "s1" },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 202 }));

    const client = clientWith(fetchImpl as unknown as typeof fetch);
    const info = await client.initialize();

    expect(info.serverInfo?.name).toBe("matih");
    expect(client.sessionId).toBe("s1");
    // second call was the initialized notification (no id)
    const secondBody = JSON.parse((fetchImpl.mock.calls[1]![1] as RequestInit).body as string);
    expect(secondBody.method).toBe("notifications/initialized");
    expect(secondBody.id).toBeUndefined();
  });

  it("initialize is idempotent (no duplicate handshake)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ jsonrpc: "2.0", id: "matih-1", result: { protocolVersion: "2025-11-25", capabilities: {} } }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const client = clientWith(fetchImpl as unknown as typeof fetch);
    await client.initialize();
    await client.initialize();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("listTools unwraps the {tools:[…]} envelope", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ jsonrpc: "2.0", id: "matih-1", result: { tools: [{ name: "run_sql", description: "d", inputSchema: {} }] } }),
    );
    const client = clientWith(fetchImpl as unknown as typeof fetch);
    const tools = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe("run_sql");
  });

  it("MatihTools.runSql calls tools/call with the run_sql name + args", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ jsonrpc: "2.0", id: "matih-1", result: { content: [{ type: "text", text: "ok" }] } }),
    );
    const client = clientWith(fetchImpl as unknown as typeof fetch);
    await new MatihTools(client).runSql({ connection_id: "c1", sql: "select 1", limit: 10 });

    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.method).toBe("tools/call");
    expect(body.params).toEqual({ name: "run_sql", arguments: { connection_id: "c1", sql: "select 1", limit: 10 } });
  });
});
