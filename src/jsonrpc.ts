// JSON-RPC 2.0 framing for the Matih MCP Streamable-HTTP transport.
//
// The Matih server (McpServerController) accepts a SINGLE JSON-RPC message per POST
// (batching was removed from the MCP spec in 2025-06-18 and the server rejects arrays
// with 400). A request (has `id`) returns one JSON object; a notification (no `id`)
// returns 202 with no body.

export type JsonRpcId = string | number;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  result?: unknown;
  error?: JsonRpcErrorObject;
}

/** Standard JSON-RPC + MCP-reserved error codes (mirror of the server's McpJsonRpc). */
export const JsonRpcCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  /** MCP-reserved: resources/read for an unknown uri. */
  RESOURCE_NOT_FOUND: -32002,
} as const;

export function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { jsonrpc?: unknown }).jsonrpc === "2.0" &&
    "id" in value
  );
}

/** Monotonic per-process request-id source (string ids; the server preserves the type). */
export class RequestIdFactory {
  #seq = 0;

  next(): string {
    this.#seq += 1;
    return `matih-${this.#seq}`;
  }
}
