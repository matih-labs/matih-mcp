# @matihlabs/mcp — protocol & tool lifecycle

How the Matih MCP surface evolves without breaking connected AI clients. Pairs
with the server-side contract gate (`backend/.../McpManifestContractTest` +
`mcp-manifest-frozen.json`) and the SDK conformance test
(`tools/matih-mcp/test/conformance.test.ts`).

## Protocol version negotiation

The server advertises `SUPPORTED_PROTOCOL_VERSIONS = [2025-11-25, 2025-06-18,
2025-03-26]` (newest first) and negotiates on `initialize`: it echoes the client's
requested version if supported, else returns its latest. After the handshake every
request carries the negotiated version in the `MCP-Protocol-Version` header; an
unsupported header is `400`. The SDK pins `LATEST_PROTOCOL_VERSION` and the
conformance test asserts it equals the frozen manifest's `protocolVersion`.

### Adding a new protocol version

1. Add it to the **front** of `SUPPORTED_PROTOCOL_VERSIONS` (server `McpProtocol` +
   SDK `protocol.ts`) — newest first; keep the prior two for backcompat.
2. Bump `LATEST_PROTOCOL_VERSION` on both sides in the same change; the conformance
   test fails until the SDK matches the frozen manifest.
3. Drop a version only after a deprecation window (below) — removing a supported
   version is a breaking change for any client still requesting it.

### Scheduled: 2025-11-25 → next spec revision (target 2026-07-28)

The MCP spec revises on a rolling cadence. When the next revision lands:

- [ ] Review the changelog for transport / framing / auth changes (esp. Streamable
      HTTP, `resource` indicators, elicitation).
- [ ] Add the new version string to `SUPPORTED_PROTOCOL_VERSIONS` (front) on server
      + SDK; bump `LATEST_PROTOCOL_VERSION`; update `mcp-manifest-frozen.json`'s
      `protocolVersion`.
- [ ] Re-run the conformance test + the stdio child-process harness against a real
      Claude Desktop / Cursor build.
- [ ] Keep `2025-03-26` only while a shipped client still negotiates it; otherwise
      begin its deprecation window.

## Tool lifecycle (additive-only contract)

The MCP capability surface is governed by an **additive-only** gate (server
`McpManifestContractTest`, SDK conformance): the live manifest must remain a
superset of the frozen snapshot. Mirrors the I-40 contract-freeze posture.

| Change | Verdict | Action |
|--------|---------|--------|
| New tool | additive — OK | add the tool + a `MatihTools` wrapper + update `mcp-manifest-frozen.json` + `baselineTools()` + SDK conformance |
| New optional field on a tool | additive — OK | add to `inputSchema.properties` (NOT `required`) |
| New prompt / resource | additive — OK | register it; frozen snapshot grows |
| New required field on an existing tool | **breaking** | deprecate-and-replace (below) — never tighten in place |
| Field rename / type change / removal | **breaking** | deprecate-and-replace |
| Tool removal | **breaking** | deprecate window, then remove |

### Deprecating a tool or field

1. **Mark** — note the deprecation + removal date in the tool's `description`
   (it's the only human-facing channel the client renders) and in this file's
   table below. Keep behaviour unchanged during the window.
2. **Replace additively** — ship the successor tool/field alongside the old one;
   the old one keeps working. For a "renamed" required field, add the new field as
   required and leave the old one accepted (optional) until removal — never the
   remove-old-and-add-new shape, which the additive gate rejects.
3. **Window** — minimum one minor SDK release AND ≥ 30 days, whichever is longer,
   so pinned clients (`npx @matihlabs/mcp`) and cached configs roll forward.
4. **Remove** — drop the old tool/field from the manifest + frozen snapshot +
   `baselineTools()` + the SDK wrapper in a single change; bump the SDK minor.

### Active deprecations

_None._

## SDK ↔ server compatibility

- The SDK is **forward-compatible** with additive server changes: unknown tools
  surface via `tools/list` and `callTool(name, …)` works without a typed wrapper;
  unknown content-block types pass through with full fidelity (the bridge never
  mutates tool payloads).
- The SDK is **pinned** to the protocol version + tool surface only through the
  conformance test, which reads the server's frozen manifest. Bump the SDK minor
  whenever the manifest's `protocolVersion` or tool set changes.
- Breaking server changes require an SDK major bump; communicate via the npm
  changelog + the tool `description` channel.
