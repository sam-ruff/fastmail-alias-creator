import { describe, expect, it } from "vitest";
import { base64Url, challengeFor, createVerifier } from "../../src/auth/pkce";

describe("pkce", () => {
  it("creates verifiers of the requested length from the allowed alphabet", () => {
    const verifier = createVerifier(undefined, 96);
    expect(verifier).toHaveLength(96);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it("skips bytes that would bias the alphabet", () => {
    let call = 0;
    const bytes = () => new Uint8Array(call++ === 0 ? [255, 254, 0] : [1, 2, 3]);
    expect(createVerifier(bytes, 3)).toBe("ABC");
  });

  it("encodes base64url without padding", () => {
    expect(base64Url(new Uint8Array([251, 255]))).toBe("-_8");
  });

  it("matches the RFC 7636 appendix B example", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(await challengeFor(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});
