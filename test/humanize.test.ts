import { describe, expect, it } from "vitest";

import { AuthRequiredError, EgressConsentRequiredError, RpcError, parseWwwAuthenticate } from "../src/errors.js";
import { SdkErrorCode, humanizeError, humanizeToolResult } from "../src/humanize.js";

describe("parseWwwAuthenticate", () => {
  it("parses the missing-token challenge", () => {
    const p = parseWwwAuthenticate('Bearer resource_metadata="https://app/.well-known/oauth-protected-resource/api/v1/mcp"');
    expect(p.scheme).toBe("bearer");
    expect(p.resourceMetadata).toBe("https://app/.well-known/oauth-protected-resource/api/v1/mcp");
    expect(p.error).toBeUndefined();
  });

  it("parses the invalid-token challenge with error + description", () => {
    const p = parseWwwAuthenticate('Bearer error="invalid_token", error_description="expired", resource_metadata="https://app/m"');
    expect(p.error).toBe("invalid_token");
    expect(p.errorDescription).toBe("expired");
    expect(p.resourceMetadata).toBe("https://app/m");
  });

  it("returns empty for a null header", () => {
    expect(parseWwwAuthenticate(null)).toEqual({});
  });
});

describe("humanizeError", () => {
  it("preserves an RpcError code + data", () => {
    expect(humanizeError(new RpcError(-32602, "bad", { x: 1 }))).toEqual({ code: -32602, message: "bad", data: { x: 1 } });
  });

  it("gives consent guidance + url for EgressConsentRequiredError", () => {
    const h = humanizeError(new EgressConsentRequiredError("DPA not accepted", "https://app/consent"));
    expect(h.code).toBe(SdkErrorCode.EGRESS_CONSENT_REQUIRED);
    expect(h.message).toContain("https://app/consent");
    expect(h.data).toEqual({ consentUrl: "https://app/consent" });
  });

  it("gives re-auth guidance for an invalid_token AuthRequiredError", () => {
    const h = humanizeError(new AuthRequiredError("invalid_token", "https://app/m", "expired"));
    expect(h.code).toBe(SdkErrorCode.AUTH_REQUIRED);
    expect(h.message).toMatch(/re-authenticate/i);
    expect(h.message).toContain("expired");
  });
});

describe("humanizeToolResult", () => {
  it("joins text blocks and absolutizes relative resource links", () => {
    const out = humanizeToolResult(
      {
        content: [
          { type: "text", text: "Ran 5 rows." },
          { type: "resource_link", uri: "/results/abc", name: "Open results" },
        ],
      },
      "https://app.matih.ai",
    );
    expect(out).toContain("Ran 5 rows.");
    expect(out).toContain("Open results: https://app.matih.ai/results/abc");
  });

  it("leaves an absolute link untouched and prefixes errors", () => {
    const out = humanizeToolResult(
      { content: [{ type: "text", text: "bad sql" }], isError: true },
      "https://app.matih.ai",
    );
    expect(out).toBe("Error: bad sql");
  });
});
