// Error + tool-result humanization.
//
// (a) humanizeError maps an SDK error to a JSON-RPC error object (code + human message) so the
//     stdio bridge can hand a CLEAR, actionable message to the AI client instead of a stack
//     trace — auth and egress-consent failures get specific guidance, not "internal error".
// (b) humanizeToolResult renders a native ToolResult into a readable string, resolving
//     resource_link blocks to ABSOLUTE action URLs, for SDK consumers that want plain text.

import { AuthRequiredError, EgressConsentRequiredError, RpcError, TransportError } from "./errors.js";
import { JsonRpcCode } from "./jsonrpc.js";
import type { ContentBlock, ResourceLinkContent, ToolResult } from "./protocol.js";

/** SDK-specific JSON-RPC error codes (server-error range −32000…−32099). */
export const SdkErrorCode = {
  AUTH_REQUIRED: -32001,
  EGRESS_CONSENT_REQUIRED: -32010,
  TRANSPORT: -32011,
} as const;

export interface HumanizedError {
  code: number;
  message: string;
  data?: unknown;
}

export function humanizeError(err: unknown): HumanizedError {
  if (err instanceof RpcError) {
    return { code: err.code, message: err.message, data: err.data };
  }
  if (err instanceof EgressConsentRequiredError) {
    const tail = err.consentUrl ? ` Accept it here: ${err.consentUrl}` : "";
    return {
      code: SdkErrorCode.EGRESS_CONSENT_REQUIRED,
      message: `${err.detail}${tail}`,
      data: err.consentUrl ? { consentUrl: err.consentUrl } : undefined,
    };
  }
  if (err instanceof AuthRequiredError) {
    const hint =
      err.kind === "invalid_token"
        ? "Your Matih token was rejected — re-authenticate (rotate MATIH_MCP_TOKEN or re-run the OAuth login)."
        : "Matih MCP requires a bearer token — set MATIH_MCP_TOKEN or configure OAuth.";
    return {
      code: SdkErrorCode.AUTH_REQUIRED,
      message: err.reason ? `${hint} (${err.reason})` : hint,
      data: err.resourceMetadataUrl ? { resourceMetadata: err.resourceMetadataUrl } : undefined,
    };
  }
  if (err instanceof TransportError) {
    return { code: SdkErrorCode.TRANSPORT, message: err.message };
  }
  if (err instanceof Error) {
    return { code: JsonRpcCode.INTERNAL_ERROR, message: err.message };
  }
  return { code: JsonRpcCode.INTERNAL_ERROR, message: String(err) };
}

function isResourceLink(b: ContentBlock): b is ResourceLinkContent {
  return b.type === "resource_link" && typeof (b as ResourceLinkContent).uri === "string";
}

/**
 * Render a ToolResult to a human-readable string: text blocks joined, resource links shown as
 * absolute `name: uri` action lines, an error result prefixed. `baseUrl`, when given, resolves
 * any relative resource-link URI to an absolute URL.
 */
export function humanizeToolResult(result: ToolResult, baseUrl?: string): string {
  const lines: string[] = [];
  for (const block of result.content ?? []) {
    if (block.type === "text" && typeof (block as { text?: unknown }).text === "string") {
      lines.push((block as { text: string }).text);
    } else if (isResourceLink(block)) {
      const uri = absolutize(block.uri, baseUrl);
      lines.push(block.name ? `${block.name}: ${uri}` : uri);
    } else if (block.type === "image") {
      lines.push("[image]");
    }
  }
  const body = lines.join("\n");
  return result.isError ? `Error: ${body}` : body;
}

function absolutize(uri: string, baseUrl?: string): string {
  if (!baseUrl || /^[a-z][a-z0-9+.-]*:/i.test(uri)) {
    return uri; // already absolute (has a scheme) or no base to resolve against
  }
  try {
    return new URL(uri, baseUrl).toString();
  } catch {
    return uri;
  }
}
