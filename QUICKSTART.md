# Matih MCP — customer quickstart

Connect an AI client (Claude Desktop, Cursor, …) — or your own terminal — to the
**Matih** data platform over the [Model Context Protocol](https://modelcontextprotocol.io),
using [`@matihlabs/mcp`](https://www.npmjs.com/package/@matihlabs/mcp).

Throughout this guide, replace **`acme`** with your workspace slug (your app lives
at `https://<slug>.app.matih.ai`) and paste your own `mat_agt_…` token.

---

## Prerequisites

- A Matih account at `https://<slug>.app.matih.ai`
- **Node ≥ 20** (`node -v`) — the bridge has zero runtime dependencies (native `fetch` + `node:crypto`)
- At least one **data connection** in the workspace (to run SQL against)
- A one-time **admin** step: enable MCP egress consent (Step 2)

---

## Step 1 — Create a developer token

In the app: **Settings → Developer Tokens → Create token**. Scope it to the
connections + tools you want the AI client to use. Copy the `mat_agt_…` value —
it is shown only once.

## Step 2 — Admin enables MCP egress consent (one-time, per workspace)

**Settings → MCP egress consent → toggle on** (admin only). Matih gates
third-party-LLM data egress per tenant; until this is accepted, every tool call
returns `403 EGRESS_CONSENT_REQUIRED`.

---

## Step 3 — Connect Claude Desktop

Edit your client config:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "matih": {
      "command": "npx",
      "args": ["-y", "@matihlabs/mcp@0.1.0", "https://acme.app.matih.ai/api/v1/mcp"],
      "env": { "MATIH_MCP_TOKEN": "mat_agt_REPLACE_WITH_YOUR_TOKEN" }
    }
  }
}
```

Fully quit and reopen Claude Desktop — a **matih** tools menu appears. The token
goes in `env` ONLY, never as a CLI argument (the bridge warns + ignores `--token`
because arguments leak into the OS process list).

**Cursor** uses the same block in `~/.cursor/mcp.json` (or Settings → MCP).

---

## Step 4 — Smoke-test from the terminal (no AI client needed)

The fastest way to confirm your token + endpoint work. Set the two variables, then
paste the block:

```bash
export MATIH_MCP_TOKEN="mat_agt_REPLACE_WITH_YOUR_TOKEN"
export HOST="https://acme.app.matih.ai"        # ← your workspace slug
URL="$HOST/api/v1/mcp"
H_AUTH="Authorization: Bearer $MATIH_MCP_TOKEN"
H_ACCEPT="Accept: application/json, text/event-stream"
H_VER="MCP-Protocol-Version: 2025-11-25"

# 1) initialize — capture the session id from the response header
SID=$(curl -sS -D - -o /dev/null -X POST "$URL" \
  -H "$H_AUTH" -H "Content-Type: application/json" -H "$H_ACCEPT" -H "$H_VER" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0"}}}' \
  | awk -F': ' 'tolower($1)=="mcp-session-id"{print $2}' | tr -d '\r')
echo "session: $SID"

# 2) complete the handshake
curl -sS -o /dev/null -w "initialized: %{http_code}\n" -X POST "$URL" \
  -H "$H_AUTH" -H "Content-Type: application/json" -H "$H_ACCEPT" -H "$H_VER" \
  -H "Mcp-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'

# 3) who am I? (free, non-billable)
curl -sS -X POST "$URL" -H "$H_AUTH" -H "Content-Type: application/json" -H "$H_ACCEPT" -H "$H_VER" \
  -H "Mcp-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"whoami","arguments":{}}}'
echo

# 4) what can this token do? (scoped connections + tools)
curl -sS -X POST "$URL" -H "$H_AUTH" -H "Content-Type: application/json" -H "$H_ACCEPT" -H "$H_VER" \
  -H "Mcp-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_scope","arguments":{}}}'
echo

# 5) list all available tools
curl -sS -X POST "$URL" -H "$H_AUTH" -H "Content-Type: application/json" -H "$H_ACCEPT" -H "$H_VER" \
  -H "Mcp-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/list","params":{}}'
echo
```

Then run SQL against a connection id from `get_scope` (replace `<connection_id>`):

```bash
curl -sS -X POST "$URL" -H "$H_AUTH" -H "Content-Type: application/json" -H "$H_ACCEPT" -H "$H_VER" \
  -H "Mcp-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{
        "name":"run_sql",
        "arguments":{"connection_id":"<connection_id>","sql":"SELECT 1 AS hello"}}}'
echo

# profile a table (reads the stored profile snapshot)
curl -sS -X POST "$URL" -H "$H_AUTH" -H "Content-Type: application/json" -H "$H_ACCEPT" -H "$H_VER" \
  -H "Mcp-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{
        "name":"profile_table",
        "arguments":{"table_fqn":"service.db.schema.table"}}}'
echo
```

> The endpoint speaks MCP Streamable HTTP. `Accept: application/json, text/event-stream`
> and the `MCP-Protocol-Version` header are required; the `Mcp-Session-Id` returned
> by `initialize` must be echoed on every subsequent request.

---

## Step 5 — Run the bridge directly (advanced / debugging)

The same stdio bridge an AI client launches — handy to confirm it starts:

```bash
MATIH_MCP_TOKEN="mat_agt_…" npx -y @matihlabs/mcp@0.1.0 https://acme.app.matih.ai/api/v1/mcp
# stderr: "[matih-mcp] bridging stdio ↔ https://acme.app.matih.ai/api/v1/mcp"
# it then reads JSON-RPC on stdin; Ctrl-C to exit.

npx -y @matihlabs/mcp@0.1.0 --help     # usage
```

The endpoint may also be supplied via `MATIH_MCP_ENDPOINT`; an `Origin` header via
`MATIH_MCP_ORIGIN` (only if the server enforces an allowlist).

---

## Example prompts to try in Claude Desktop

- "Use matih to show me what data connections and tools I have access to." → `get_scope`
- "Run `SELECT count(*) FROM orders` on connection `<id>` via matih." → `run_sql`
- "Profile the `sales.public.orders` table and summarize the column stats." → `profile_table`
- "Analyze monthly revenue from connection `<id>` and chart it." → `run_analysis` + `create_chart`

## Available tools (14)

`run_sql`, `run_analysis`, `profile_table`, `whoami`, `get_scope`,
`get_query_result`, `create_chart`, `create_dashboard`, `get_dashboard`,
`publish_dashboard`, `upload_file`, `upload_status`, `create_upload_url`,
`finalize_upload` — plus catalog/lineage **resources** and the `explain_metric`
**prompt**.

---

## Troubleshooting

| Symptom | Meaning / fix |
|---|---|
| `401 invalid_token` | Bad/expired token, or wrong prefix. Re-create in Settings → Developer Tokens. |
| `403 EGRESS_CONSENT_REQUIRED` | Admin hasn't enabled MCP egress consent (Step 2). |
| `SANDBOX_TOOL_NOT_ALLOWED` | That tool/connection isn't in the token's scope. Widen the token's scope, or use `get_scope` to see what's allowed. |
| "no remaining credits" / "cannot run queries (plan: …)" on `run_sql` | The workspace's billing plan is blocked or out of credits — top up / restore the plan. |
| Claude Desktop shows no matih tools | Invalid JSON in the config, Node < 20, or token missing. Run Step 5 directly to see the bridge's stderr. |
| `npx` slow on first run | It's fetching the package; the pinned `@0.1.0` caches after the first run. |

---

License: Apache-2.0 · https://matih.ai
