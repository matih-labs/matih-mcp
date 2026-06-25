// stdio ↔ Streamable-HTTP bridge.
//
// Claude Desktop / Cursor / etc. speak MCP over stdio (newline-delimited JSON-RPC). This
// bridge reads each stdin message, forwards it to the Matih HTTP MCP endpoint via the
// transport, and writes the response to stdout — turning the remote HTTP server into a local
// stdio MCP server. Requests (with id) get a response line; notifications (no id) do not.

import { createInterface } from "node:readline";

import { humanizeError } from "../humanize.js";
import { JsonRpcCode, type JsonRpcId } from "../jsonrpc.js";

/** Minimal transport shape the bridge needs (StreamableHttpTransport satisfies it). */
export interface BridgeTransport {
  request(method: string, params?: unknown, opts?: { isInitialize?: boolean }): Promise<unknown>;
  notify(method: string, params?: unknown): Promise<void>;
}

export interface StdioBridgeOptions {
  transport: BridgeTransport;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  /** Diagnostics sink (stderr by default — never stdout, which carries the protocol). */
  log?: (message: string) => void;
}

interface IncomingMessage {
  jsonrpc?: string;
  id?: JsonRpcId | null;
  method?: string;
  params?: unknown;
}

/** Run the bridge until the input stream closes. Resolves when stdin ends. */
export function runStdioBridge(opts: StdioBridgeOptions): Promise<void> {
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;
  const log = opts.log ?? ((m: string) => process.stderr.write(`${m}\n`));
  const rl = createInterface({ input, crlfDelay: Infinity });

  const write = (obj: unknown): void => {
    output.write(`${JSON.stringify(obj)}\n`);
  };

  return new Promise<void>((resolve) => {
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      void handleLine(trimmed, opts.transport, write, log);
    });
    rl.on("close", () => resolve());
  });
}

async function handleLine(
  line: string,
  transport: BridgeTransport,
  write: (obj: unknown) => void,
  log: (m: string) => void,
): Promise<void> {
  let msg: IncomingMessage;
  try {
    msg = JSON.parse(line) as IncomingMessage;
  } catch {
    write({ jsonrpc: "2.0", id: null, error: { code: JsonRpcCode.PARSE_ERROR, message: "Parse error" } });
    return;
  }
  const method = msg.method;
  if (!method) {
    write({ jsonrpc: "2.0", id: msg.id ?? null, error: { code: JsonRpcCode.INVALID_REQUEST, message: "Missing method" } });
    return;
  }
  const hasId = msg.id !== undefined && msg.id !== null;

  // Notification (no id) — forward fire-and-forget; no stdout reply.
  if (!hasId) {
    try {
      await transport.notify(method, msg.params);
    } catch (err) {
      log(`notification ${method} failed: ${humanizeError(err).message}`);
    }
    return;
  }

  const id = msg.id as JsonRpcId;
  try {
    const result = await transport.request(method, msg.params, { isInitialize: method === "initialize" });
    write({ jsonrpc: "2.0", id, result });
  } catch (err) {
    const h = humanizeError(err);
    write({ jsonrpc: "2.0", id, error: { code: h.code, message: h.message, ...(h.data ? { data: h.data } : {}) } });
  }
}
