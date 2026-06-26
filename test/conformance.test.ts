// MCP conformance: the SDK must stay in lockstep with the server's frozen contract.
// Reads the frozen manifest snapshot (the same one the server's McpManifestContractTest
// gates on) and asserts (a) the protocol version matches and (b) the typed MatihTools
// adapter covers EXACTLY the frozen tool surface.
//
// The manifest is VENDORED into this package at test/fixtures/mcp-manifest-frozen.json so
// the conformance test is SELF-CONTAINED — it runs identically in the monorepo AND in the
// published standalone repo (matih-labs/matih-mcp), where backend/src/... does not exist.
// (Pre-fix it read ../../../backend/src/test/resources/... directly, which ENOENT'd in the
// standalone repo's CI and blocked the npm publish — 2026-06-26.)
//
// Drift protection: when this test runs INSIDE the monorepo (the authoritative backend
// manifest is present), it asserts the vendored copy is byte-identical to the backend's
// frozen manifest, so the two can never silently diverge. In the standalone repo that
// authoritative path is absent and the drift assertion is skipped.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import type { McpClient } from "../src/client.js";
import { LATEST_PROTOCOL_VERSION } from "../src/protocol.js";
import { MatihTools } from "../src/tools.js";

const here = dirname(fileURLToPath(import.meta.url));

// Self-contained vendored snapshot (present in BOTH monorepo + standalone repo).
const vendoredPath = resolve(here, "fixtures/mcp-manifest-frozen.json");
const vendoredRaw = readFileSync(vendoredPath, "utf8");
const frozen = JSON.parse(vendoredRaw) as {
  protocolVersion: string;
  tools: Record<string, unknown>;
};

// Authoritative backend manifest — only present in the monorepo checkout.
const backendPath = resolve(here, "../../../backend/src/test/resources/mcp/mcp-manifest-frozen.json");

describe("MCP conformance vs frozen manifest", () => {
  it("vendored manifest matches the backend authoritative snapshot (monorepo drift guard)", () => {
    if (!existsSync(backendPath)) {
      // Standalone published repo — backend tree absent; nothing to drift-check.
      return;
    }
    const backendRaw = readFileSync(backendPath, "utf8");
    expect(JSON.parse(vendoredRaw)).toEqual(JSON.parse(backendRaw));
  });

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
