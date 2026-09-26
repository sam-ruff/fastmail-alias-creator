// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AmoListing, createAmoJwt, markdownToPlainText } from "../../scripts/amo-listing";

const ADDON = "addon@example.test";
const BASE = "https://addons.mozilla.org/api/v5/addons/addon/addon%40example.test/";

function decode(part: string | undefined): Record<string, unknown> {
  return JSON.parse(Buffer.from(part ?? "", "base64url").toString()) as Record<string, unknown>;
}

function listing(fetchFn: typeof fetch) {
  return new AmoListing(
    { fetch: fetchFn, apiKey: "key", apiSecret: "secret", now: () => 0, randomId: () => "jti" },
    ADDON,
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const shots = [
  { name: "1.png", bytes: new Uint8Array([1]) },
  { name: "2.png", bytes: new Uint8Array([2]) },
];

describe("createAmoJwt", () => {
  it("signs a one minute HS256 token for the API key", () => {
    const token = createAmoJwt("user:1:2", "secret", 1_700_000_000_500, "jti-1");
    const [header, payload, signature] = token.split(".");

    expect(decode(header)).toEqual({ alg: "HS256", typ: "JWT" });
    expect(decode(payload)).toEqual({
      iss: "user:1:2",
      jti: "jti-1",
      iat: 1_700_000_000,
      exp: 1_700_000_060,
    });
    const expected = createHmac("sha256", "secret")
      .update(`${header}.${payload}`)
      .digest("base64url");
    expect(signature).toBe(expected);
  });
});

describe("markdownToPlainText", () => {
  it("flattens headings, links, code and bold", () => {
    const markdown =
      "# Title\n\nSee [the policy](https://x.test/p) for `api.x`.\n\n**Note.** Done.\n";
    expect(markdownToPlainText(markdown)).toBe(
      "Title\n\nSee the policy (https://x.test/p) for api.x.\n\nNote. Done.",
    );
  });
});

describe("AmoListing", () => {
  it("patches the privacy policy with a signed request", async () => {
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(json({}));
    await listing(fetchSpy).setPrivacyPolicy("Policy text");

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE}eula_policy/`);
    expect(init?.method).toBe("PATCH");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      `JWT ${createAmoJwt("key", "secret", 0, "jti")}`,
    );
    expect(JSON.parse(String(init?.body))).toEqual({ privacy_policy: { "en-US": "Policy text" } });
  });

  it("uploads screenshots in order when the listing has none", async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) => json(String(url) === BASE ? { previews: [] } : {}));
    await listing(fetchSpy).sync("p", shots);

    const posts = fetchSpy.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts.map(([url]) => url)).toEqual([`${BASE}previews/`, `${BASE}previews/`]);
    const forms = posts.map(([, init]) => init?.body as FormData);
    expect(forms.map((form) => form.get("position"))).toEqual(["0", "1"]);
    expect((forms[0]?.get("image") as File).name).toBe("1.png");
  });

  it("leaves existing screenshots alone", async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        json(String(url) === BASE ? { previews: [{ id: 1 }] } : {}),
      );
    await listing(fetchSpy).sync("p", shots);
    expect(fetchSpy.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("reports API errors with the response body", async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"detail":"Not found."}', { status: 404 }));
    await expect(listing(fetchSpy).setPrivacyPolicy("p")).rejects.toThrow(/404.*Not found/);
  });
});
