// MCP protocol shapes (the subset the Matih server speaks) + version constants.
// Mirrors backend McpProtocol.java — keep the version list + header names in lockstep.

/** Header names — byte-for-byte the server's McpProtocol constants. */
export const PROTOCOL_VERSION_HEADER = "MCP-Protocol-Version";
export const SESSION_ID_HEADER = "Mcp-Session-Id";

/** Supported protocol versions, newest first (server SUPPORTED_VERSIONS). */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;
export type ProtocolVersion = (typeof SUPPORTED_PROTOCOL_VERSIONS)[number];

/** The latest version this client requests on initialize (server LATEST_VERSION). */
export const LATEST_PROTOCOL_VERSION: ProtocolVersion = "2025-11-25";

/** This SDK's advertised client identity (sent on initialize). */
export const CLIENT_INFO = { name: "@matihlabs/mcp", version: "0.1.0" } as const;

// ---- content blocks (the native MCP tool-result shape) ----

export interface TextContent {
  type: "text";
  text: string;
}
export interface ImageContent {
  type: "image";
  data: string; // base64
  mimeType: string;
}
export interface ResourceLinkContent {
  type: "resource_link";
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}
export type ContentBlock = TextContent | ImageContent | ResourceLinkContent | { type: string; [k: string]: unknown };

// ---- capabilities / handshake ----

export interface ServerInfo {
  name: string;
  version?: string;
  title?: string;
}

export interface InitializeResult {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo?: ServerInfo;
  instructions?: string;
}

// ---- tools / resources / prompts ----

export interface ToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/** The native tools/call result. `structuredContent` is the machine-readable half. */
export interface ToolResult {
  content: ContentBlock[];
  structuredContent?: unknown;
  isError?: boolean;
}

export interface ResourceDefinition {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceContents {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface PromptDefinition {
  name: string;
  title?: string;
  description: string;
  arguments: PromptArgument[];
}

export interface PromptMessage {
  role: "user" | "assistant";
  content: ContentBlock;
}

export interface PromptResult {
  description?: string;
  messages: PromptMessage[];
}
