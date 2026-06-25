// High-level MCP client over the Streamable-HTTP transport.

import type { TokenProvider } from "./auth.js";
import {
  CLIENT_INFO,
  LATEST_PROTOCOL_VERSION,
  type InitializeResult,
  type ProtocolVersion,
  type PromptDefinition,
  type PromptResult,
  type ResourceContents,
  type ResourceDefinition,
  type ToolDefinition,
  type ToolResult,
} from "./protocol.js";
import { StreamableHttpTransport, type TransportOptions } from "./transport.js";

export interface McpClientOptions {
  /** Full MCP endpoint URL (e.g. https://app.matih.ai/api/v1/mcp). */
  endpoint: string;
  tokenProvider: TokenProvider;
  fetchImpl?: typeof fetch;
  origin?: string;
  protocolVersion?: ProtocolVersion;
}

/**
 * A connected Matih MCP client. Call {@link initialize} once, then list/call. The transport
 * handles auth (Bearer + 401 re-auth), the protocol-version + session headers, and the
 * 403 egress-consent gate.
 */
export class McpClient {
  readonly #transport: StreamableHttpTransport;
  #initialized = false;
  #serverInfo: InitializeResult | undefined;

  constructor(opts: McpClientOptions) {
    const transportOpts: TransportOptions = {
      endpoint: opts.endpoint,
      tokenProvider: opts.tokenProvider,
      fetchImpl: opts.fetchImpl,
      origin: opts.origin,
      protocolVersion: opts.protocolVersion,
    };
    this.#transport = new StreamableHttpTransport(transportOpts);
  }

  get serverInfo(): InitializeResult | undefined {
    return this.#serverInfo;
  }
  get sessionId(): string | undefined {
    return this.#transport.sessionId;
  }
  get protocolVersion(): string {
    return this.#transport.negotiatedVersion;
  }

  /** Run the MCP initialize handshake (and send notifications/initialized). Idempotent. */
  async initialize(): Promise<InitializeResult> {
    if (this.#initialized && this.#serverInfo) {
      return this.#serverInfo;
    }
    const result = (await this.#transport.request(
      "initialize",
      {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: CLIENT_INFO,
      },
      { isInitialize: true },
    )) as InitializeResult;
    this.#serverInfo = result;
    this.#initialized = true;
    await this.#transport.notify("notifications/initialized");
    return result;
  }

  async listTools(): Promise<ToolDefinition[]> {
    const r = (await this.#transport.request("tools/list")) as { tools?: ToolDefinition[] };
    return r.tools ?? [];
  }

  async callTool(name: string, args?: Record<string, unknown>): Promise<ToolResult> {
    return (await this.#transport.request("tools/call", {
      name,
      arguments: args ?? {},
    })) as ToolResult;
  }

  async listResources(): Promise<ResourceDefinition[]> {
    const r = (await this.#transport.request("resources/list")) as { resources?: ResourceDefinition[] };
    return r.resources ?? [];
  }

  async readResource(uri: string): Promise<ResourceContents[]> {
    const r = (await this.#transport.request("resources/read", { uri })) as { contents?: ResourceContents[] };
    return r.contents ?? [];
  }

  async listPrompts(): Promise<PromptDefinition[]> {
    const r = (await this.#transport.request("prompts/list")) as { prompts?: PromptDefinition[] };
    return r.prompts ?? [];
  }

  async getPrompt(name: string, args?: Record<string, unknown>): Promise<PromptResult> {
    return (await this.#transport.request("prompts/get", {
      name,
      ...(args ? { arguments: args } : {}),
    })) as PromptResult;
  }
}
