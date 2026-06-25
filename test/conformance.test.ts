// MCP conformance: the SDK must stay in lockstep with the server's frozen contract.
// Reads backend/src/test/resources/mcp/mcp-manifest-frozen.json (the same snapshot the
// server's McpManifestContractTest gates on) and asserts (a) the protocol version matches and
// (b) the typed MatihTools adapter covers EXACTLY the frozen tool surface.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import type { McpClient } from "../src/client.js";
import { LATEST_PROTOCOL_VERSION } from "../src/protocol.js";
import { MatihTools } from "../src/tools.js";

const here = dirname(fileURLToPath(import.meta.url));
const frozenPath = resolve(here, "../../../backend/src/test/resources/mcp/mcp-manifest-frozen.json");
const frozen = JSON.parse(readFileSync(frozenPath, "utf8")) as {
  protocolVersion: string;
  tools: Record<string, unknown>;
};

describe("MCP conformance vs frozen manifest", () => {
  it("the SDK's latest protocol version matches the server's frozen protocolVersion", () => {
    expect(LATEST_PROTOCOL_VERSION).toBe(frozen.protocolVersion);
  });

  it("MatihTools covers exactly the frozen tool surface (no missing / no extra)", () => {
    // Drive every MatihTools method with a spy client; collect the tool names it calls.
    const called = new Set<string>();
    const spyClient = {
      callTool: vi.fn((name: string) => {
        called.add(name);
        return Promise.resolve({ content: [] });
      }),
    } as unknown as McpClient;

    const tools = new MatihTools(spyClient);
    // Invoke each wrapper with minimal args (arg validity is the server's concern).
    void tools.runSql({ connection_id: "c", sql: "select 1" });
    void tools.profileTable({ table_fqn: "a.b.c" });
    void tools.runAnalysis({ connection_id: "c", sql: "select 1" });
    void tools.createChart({ data: [] });
    void tools.createDashboard({ project_id: "p", spec: {} });
    void tools.getDashboard("d");
    void tools.publishDashboard({ dashboard_id: "d" });
    void tools.whoami();
    void tools.getScope();
    void tools.getQueryResult({ execution_id: "e" });
    void tools.uploadFile({ content_base64: "x", table_name: "t" });
    void tools.uploadStatus("u");
    void tools.createUploadUrl({ file_name: "f", file_size: 1, table_name: "t" });
    void tools.finalizeUpload("u");

    const frozenTools = new Set(Object.keys(frozen.tools));
    expect([...called].sort()).toEqual([...frozenTools].sort());
  });
});
