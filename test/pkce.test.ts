import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { base64UrlEncode, generatePkce, generateState } from "../src/pkce.js";

describe("PKCE S256", () => {
  it("challenge is base64url(SHA-256(verifier)) with no padding", () => {
    const { verifier, challenge, method } = generatePkce();
    expect(method).toBe("S256");
    // Recompute the challenge independently and compare.
    const expected = createHash("sha256")
      .update(verifier)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(challenge).toBe(expected);
    expect(challenge).not.toMatch(/[+/=]/); // url-safe, unpadded
  });

  it("verifier length is within the RFC 7636 43–128 range", () => {
    const { verifier } = generatePkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it("each pair + state is unique (high entropy)", () => {
    const a = generatePkce();
    const b = generatePkce();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).not.toBe(b.challenge);
    expect(generateState()).not.toBe(generateState());
  });

  it("base64UrlEncode strips padding and url-encodes", () => {
    expect(base64UrlEncode(Buffer.from([0xfb, 0xff, 0xfe]))).toBe("-__-");
  });
});
