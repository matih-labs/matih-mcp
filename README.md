# @matihlabs/mcp

Connect AI clients (Claude Desktop, ChatGPT, Cursor, …) to the **Matih** data
platform over the [Model Context Protocol](https://modelcontextprotocol.io). Write
SQL, profile tables, run analyses + charts, manage dashboards, and upload files —
all through MCP tools, with OAuth/PKCE auth and PII-safe egress.

> **New here?** See **[QUICKSTART.md](./QUICKSTART.md)** for a step-by-step customer
> guide — create a token, connect Claude Desktop / Cursor, and copy-paste `curl`
> smoke tests — plus a troubleshooting table.

## Use as a stdio MCP server (Claude Desktop / Cursor)

Add to your client's MCP config. The token is delivered via the environment — never
as a CLI flag (which leaks into the OS process list):

```json
{
  "mcpServers": {
    "matih": {
      "command": "npx",
      "args": ["-y", "@matihlabs/mcp", "https://<slug>.app.matih.ai/api/v1/mcp"],
      "env": { "MATIH_MCP_TOKEN": "<your Matih bearer token>" }
    }
  }
}
```

The bridge turns the remote Matih HTTP MCP endpoint into a local stdio MCP server,
forwarding every `tools/call`, `resources/read`, and `prompts/get` to Matih.

> **Endpoint:** replace `<slug>` with your workspace slug — your Matih app lives at
> `https://<slug>.app.matih.ai` (the bare `app.matih.ai` host does not resolve).
> Get a `mat_agt_…` token from **Settings → Developer Tokens**. See
> [QUICKSTART.md](./QUICKSTART.md) for the full walkthrough.

## Use as a library

```ts
import { McpClient, MatihTools, StaticTokenProvider } from "@matihlabs/mcp";

const client = new McpClient({
  endpoint: "https://<slug>.app.matih.ai/api/v1/mcp",
  tokenProvider: new StaticTokenProvider(process.env.MATIH_MCP_TOKEN!),
});
await client.initialize();

const matih = new MatihTools(client);
const result = await matih.runSql({ connection_id: "<id>", sql: "select 1" });
```

### OAuth (PKCE) instead of a static token

```ts
import { McpClient, OAuthTokenProvider } from "@matihlabs/mcp";

const tokenProvider = new OAuthTokenProvider({
  resourceMetadataUrl: "https://<slug>.app.matih.ai/.well-known/oauth-protected-resource/api/v1/mcp",
  clientId: "<registered client id>",
  acquire: async ({ metadata, clientId, resource }) => {
    // open metadata.authorization_endpoint (PKCE S256, resource=<resource>),
    // capture the code at your redirect_uri, return { code, verifier, redirectUri }.
  },
});
```

The provider runs RFC 9728 → RFC 8414 discovery, PKCE S256, RFC 8707 resource-bound
tokens, caches, and refreshes; a `401 invalid_token` triggers one re-auth.

## Tools

`run_sql`, `run_analysis`, `profile_table`, `create_chart`, `create_dashboard`,
`get_dashboard`, `publish_dashboard`, `whoami`, `get_scope`, `get_query_result`,
`upload_file`, `upload_status`, `create_upload_url`, `finalize_upload` (+ catalog /
lineage resources and the `explain_metric` prompt).

## Notes

- **Egress consent.** Matih gates third-party-LLM data egress per tenant. If your
  tenant hasn't accepted the data-processing agreement, calls return a clear
  `EGRESS_CONSENT_REQUIRED` error with a link to accept it.
- **Node ≥ 20** (uses native `fetch` + `node:crypto`; zero runtime dependencies).

License: Apache-2.0 · https://matih.ai
