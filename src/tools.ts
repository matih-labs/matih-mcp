// Typed wrappers over the Matih MCP tool surface (the frozen 14-tool manifest). Thin, typed
// sugar over McpClient.callTool — argument shapes mirror mcp-manifest-frozen.json exactly.

import type { McpClient } from "./client.js";
import type { ToolResult } from "./protocol.js";

export type ChartType = "bar" | "line" | "area" | "pie" | "scatter";

export interface RunSqlArgs {
  connection_id: string;
  sql: string;
  limit?: number;
}
export interface ProfileTableArgs {
  table_fqn: string;
}
export interface RunAnalysisArgs {
  connection_id: string;
  sql: string;
  chart_type?: ChartType;
  x?: string;
  y?: string;
  limit?: number;
}
export interface CreateChartArgs {
  data: unknown;
  chart_type?: ChartType;
  x?: string;
  y?: string;
}
export interface CreateDashboardArgs {
  project_id: string;
  spec: unknown;
  name?: string;
  description?: string;
}
export interface PublishDashboardArgs {
  dashboard_id: string;
  password?: string;
  expires_at?: string;
  allow_embed?: boolean;
}
export interface GetQueryResultArgs {
  execution_id: string;
  limit?: number;
}
export interface UploadFileArgs {
  content_base64: string;
  table_name: string;
  format?: string;
}
export interface CreateUploadUrlArgs {
  file_name: string;
  file_size: number;
  table_name: string;
}

/** Typed facade over the Matih MCP tools. Construct with a connected {@link McpClient}. */
export class MatihTools {
  constructor(private readonly client: McpClient) {}

  runSql(args: RunSqlArgs): Promise<ToolResult> {
    return this.client.callTool("run_sql", { ...args });
  }
  profileTable(args: ProfileTableArgs): Promise<ToolResult> {
    return this.client.callTool("profile_table", { ...args });
  }
  runAnalysis(args: RunAnalysisArgs): Promise<ToolResult> {
    return this.client.callTool("run_analysis", { ...args });
  }
  createChart(args: CreateChartArgs): Promise<ToolResult> {
    return this.client.callTool("create_chart", { ...args });
  }
  createDashboard(args: CreateDashboardArgs): Promise<ToolResult> {
    return this.client.callTool("create_dashboard", { ...args });
  }
  getDashboard(dashboardId: string): Promise<ToolResult> {
    return this.client.callTool("get_dashboard", { dashboard_id: dashboardId });
  }
  publishDashboard(args: PublishDashboardArgs): Promise<ToolResult> {
    return this.client.callTool("publish_dashboard", { ...args });
  }
  whoami(): Promise<ToolResult> {
    return this.client.callTool("whoami", {});
  }
  getScope(): Promise<ToolResult> {
    return this.client.callTool("get_scope", {});
  }
  getQueryResult(args: GetQueryResultArgs): Promise<ToolResult> {
    return this.client.callTool("get_query_result", { ...args });
  }
  uploadFile(args: UploadFileArgs): Promise<ToolResult> {
    return this.client.callTool("upload_file", { ...args });
  }
  uploadStatus(uploadId: string): Promise<ToolResult> {
    return this.client.callTool("upload_status", { upload_id: uploadId });
  }
  createUploadUrl(args: CreateUploadUrlArgs): Promise<ToolResult> {
    return this.client.callTool("create_upload_url", { ...args });
  }
  finalizeUpload(uploadId: string): Promise<ToolResult> {
    return this.client.callTool("finalize_upload", { upload_id: uploadId });
  }
}
