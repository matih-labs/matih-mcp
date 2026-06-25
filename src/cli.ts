#!/usr/bin/env node
// matih-mcp — stdio MCP server that bridges to a remote Matih HTTP MCP endpoint.
//
// Launched by an AI client (e.g. Claude Desktop) as a stdio server:
//   {
//     "command": "npx",
//     "args": ["-y", "@matihlabs/mcp", "https://app.matih.ai/api/v1/mcp"],
//     "env": { "MATIH_MCP_TOKEN": "<bearer token>" }
//   }
//
// The token is delivered via the MATIH_MCP_TOKEN env var ONLY. A token passed as a CLI
// argument is INSECURE (visible in the OS process list / shell history) — the bridge warns
// and ignores it.

import { StaticTokenProvider } from "./auth.js";
import { runStdioBridge } from "./bridge/stdio.js";
import { StreamableHttpTransport } from "./transport.js";

const HELP = `matih-mcp — bridge an AI client (stdio MCP) to the Matih data platform (HTTP MCP)

Usage:
  matih-mcp [<endpoint-url>]

Endpoint (first non-flag arg, or env):
  MATIH_MCP_ENDPOINT   e.g. https://app.matih.ai/api/v1/mcp

Auth (env only — never a CLI flag):
  MATIH_MCP_TOKEN      a Matih bearer token

Optional:
  MATIH_MCP_ORIGIN     Origin header (if the server enforces an allowlist)
`;

function fail(message: string): never {
  process.stderr.write(`[matih-mcp] ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(HELP);
    return;
  }

  // Security: a token on the CLI leaks via the process list — warn + ignore; env only.
  if (argv.some((a) => a === "--token" || a.startsWith("--token="))) {
    process.stderr.write(
      "[matih-mcp] WARNING: --token is ignored — passing a token as a CLI argument is insecure " +
        "(visible in the OS process list). Use the MATIH_MCP_TOKEN environment variable.\n",
    );
  }

  const positional = argv.filter((a) => !a.startsWith("-"));
  const endpoint = process.env.MATIH_MCP_ENDPOINT || process.env.MATIH_MCP_URL || positional[0];
  if (!endpoint) {
    fail("No endpoint. Set MATIH_MCP_ENDPOINT (e.g. https://app.matih.ai/api/v1/mcp) or pass it as an argument.");
  }

  const token = process.env.MATIH_MCP_TOKEN;
  if (!token) {
    fail("No token. Set the MATIH_MCP_TOKEN environment variable (a Matih bearer token).");
  }

  const transport = new StreamableHttpTransport({
    endpoint,
    tokenProvider: new StaticTokenProvider(token),
    origin: process.env.MATIH_MCP_ORIGIN || undefined,
  });

  process.stderr.write(`[matih-mcp] bridging stdio ↔ ${endpoint}\n`);
  await runStdioBridge({ transport });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[matih-mcp] fatal: ${message}\n`);
  process.exit(1);
});
