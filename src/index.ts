// @matihlabs/mcp — public API.
//
// Connect an AI client to the Matih data platform over MCP:
//
//   import { McpClient, MatihTools, StaticTokenProvider } from "@matihlabs/mcp";
//   const client = new McpClient({
//     endpoint: "https://app.matih.ai/api/v1/mcp",
//     tokenProvider: new StaticTokenProvider(process.env.MATIH_MCP_TOKEN!),
//   });
//   await client.initialize();
//   const tools = new MatihTools(client);
//   const result = await tools.runSql({ connection_id: "...", sql: "select 1" });

export { McpClient, type McpClientOptions } from "./client.js";
export { MatihTools } from "./tools.js";
export type {
  ChartType,
  RunSqlArgs,
  ProfileTableArgs,
  RunAnalysisArgs,
  CreateChartArgs,
  CreateDashboardArgs,
  PublishDashboardArgs,
  GetQueryResultArgs,
  UploadFileArgs,
  CreateUploadUrlArgs,
} from "./tools.js";

export {
  type TokenProvider,
  StaticTokenProvider,
  OAuthTokenProvider,
  type OAuthTokenProviderOptions,
  type AuthCodeAcquirer,
} from "./auth.js";

export { StreamableHttpTransport, type TransportOptions } from "./transport.js";

export {
  MatihMcpError,
  TransportError,
  RpcError,
  AuthRequiredError,
  EgressConsentRequiredError,
  parseWwwAuthenticate,
} from "./errors.js";

export {
  fetchProtectedResourceMetadata,
  fetchAuthorizationServerMetadata,
  type ProtectedResourceMetadata,
  type AuthorizationServerMetadata,
} from "./discovery.js";

export {
  buildAuthorizeUrl,
  exchangeCode,
  refreshToken,
  type TokenSet,
  type AuthorizeRequest,
} from "./oauth.js";

export { generatePkce, generateState, type PkcePair } from "./pkce.js";

export {
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  PROTOCOL_VERSION_HEADER,
  SESSION_ID_HEADER,
  type ProtocolVersion,
  type ToolDefinition,
  type ToolResult,
  type ContentBlock,
  type ResourceDefinition,
  type ResourceContents,
  type PromptDefinition,
  type PromptResult,
  type InitializeResult,
} from "./protocol.js";

export { runStdioBridge, type StdioBridgeOptions } from "./bridge/stdio.js";
