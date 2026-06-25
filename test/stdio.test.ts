// stdio child-process harness: spawn the built CLI (`node dist/cli.js`) against a local mock
// MCP HTTP server, pipe JSON-RPC over stdin, and assert the bridge proxies stdin↔HTTP↔stdout.
// Requires `npm run build` first (spawns dist/cli.js).

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { createInterface, type Interface } from "node:readline";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, "../dist/cli.js");

let server: Server;
let port: number;
let child: ChildProcessWithoutNullStreams;
let rl: Interface;
const inbox: string[] = [];
let waiter: ((line: string) => void) | undefined;

function nextLine(): Promise<string> {
  const queued = inbox.shift();
  if (queued !== undefined) {
    return Promise.resolve(queued);
  }
  return new Promise((resolve) => {
    waiter = resolve;
  });
}

function send(message: unknown): void {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

beforeAll(async () => {
  expect(existsSync(cli), "run `npm run build` before the stdio harness").toBe(true);

  // Mock MCP server: dispatch by JSON-RPC method.
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const auth = req.headers["authorization"];
      if (auth !== "Bearer harness-token") {
        res.writeHead(401, { "www-authenticate": 'Bearer error="invalid_token", resource_metadata="http://x/m"' });
        res.end("{}");
        return;
      }
      const msg = JSON.parse(body || "{}") as { id?: unknown; method?: string; params?: { name?: string } };
      const reply = (result?: unknown, error?: unknown): void => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, ...(error ? { error } : { result }) }));
      };
      if (msg.id === undefined || msg.id === null) {
        res.writeHead(202).end(); // notification
        return;
      }
      switch (msg.method) {
        case "initialize":
          res.setHeader("Mcp-Session-Id", "harness-sess");
          reply({ protocolVersion: "2025-11-25", capabilities: {}, serverInfo: { name: "matih-harness" } });
          break;
        case "tools/call":
          if (msg.params?.name === "boom") {
            reply(undefined, { code: -32602, message: "bad params" });
          } else {
            reply({ content: [{ type: "text", text: "ok" }] });
          }
          break;
        default:
          reply({});
      }
    });
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as { port: number }).port;

  child = spawn(process.execPath, [cli, `http://127.0.0.1:${port}/api/v1/mcp`], {
    env: { ...process.env, MATIH_MCP_TOKEN: "harness-token" },
  }) as ChildProcessWithoutNullStreams;

  rl = createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    if (waiter) {
      const w = waiter;
      waiter = undefined;
      w(line);
    } else {
      inbox.push(line);
    }
  });
});

afterAll(() => {
  rl?.close();
  child?.kill();
  server?.close();
});

describe("stdio bridge (child process)", () => {
  it("proxies initialize and returns the server's InitializeResult", async () => {
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } });
    const resp = JSON.parse(await nextLine());
    expect(resp.id).toBe(1);
    expect(resp.result.serverInfo.name).toBe("matih-harness");
  });

  it("proxies a successful tools/call", async () => {
    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "whoami", arguments: {} } });
    const resp = JSON.parse(await nextLine());
    expect(resp.id).toBe(2);
    expect(resp.result.content[0].text).toBe("ok");
  });

  it("maps a server JSON-RPC error back to the client", async () => {
    send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "boom", arguments: {} } });
    const resp = JSON.parse(await nextLine());
    expect(resp.id).toBe(3);
    expect(resp.error.code).toBe(-32602);
    expect(resp.error.message).toBe("bad params");
  });
});
