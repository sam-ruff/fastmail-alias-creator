// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  AmoListing,
  createAmoJwt,
  markdownToPlainText,
  throttleDelayMs,
} from "../../scripts/amo-listing";

const ADDON = "addon@example.test";
const BASE = "https://addons.mozilla.org/api/v5/addons/addon/addon%40example.test/";

function decode(part: string | undefined): Record<string, unknown> {
  return JSON.parse(Buffer.from(part ?? "", "base64url").toString()) as Record<string, unknown>;
}

function listing(fetchFn: typeof fetch, sleep = vi.fn(async (_ms: number) => {})) {
  return new AmoListing(
    {
      fetch: fetchFn,
      apiKey: "key",
      apiSecret: "secret",
      now: () => 0,
      randomId: () => "jti",
      sleep,
      log: () => {},
    },
    ADDON,
  );
}

const throttled = () =>
  new Response('{"detail":"Request was throttled. Expected available in 55 seconds."}', {
    status: 429,
  });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const content = {
  details: { summary: { "en-US": "Short" } },
  icon: { name: "icon.png", bytes: new Uint8Array([9]) },
  policy: "Policy",
  screenshots: [
    { name: "1.png", bytes: new Uint8Array([1]) },
    { name: "2.png", bytes: new Uint8Array([2]) },
  ],
};

const withPreviews = (previews: unknown[]) =>
  vi
    .fn<typeof fetch>()
    .mockImplementation(async (url, init) =>
      json(String(url) === BASE && init?.method === "GET" ? { previews } : {}),
    );

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

describe("throttleDelayMs", () => {
  it("prefers Retry-After, then the body, then a minute, plus a second of margin", () => {
    expect(throttleDelayMs("10", "")).toBe(11_000);
    expect(throttleDelayMs(null, "Expected available in 55 seconds.")).toBe(56_000);
    expect(throttleDelayMs(null, "slow down")).toBe(61_000);
    expect(throttleDelayMs("soon", "")).toBe(61_000);
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

  it("syncs details, icon and policy, then uploads screenshots in order", async () => {
    const fetchSpy = withPreviews([]);
    await listing(fetchSpy).sync(content);

    const calls = fetchSpy.mock.calls.map(([url, init]) => `${init?.method} ${url}`);
    expect(calls).toEqual([
      `PATCH ${BASE}`,
      `PATCH ${BASE}`,
      `PATCH ${BASE}eula_policy/`,
      `GET ${BASE}`,
      `POST ${BASE}previews/`,
      `POST ${BASE}previews/`,
    ]);
    const [details, icon] = fetchSpy.mock.calls.map(([, init]) => init?.body);
    expect(JSON.parse(String(details))).toEqual(content.details);
    expect(((icon as FormData).get("icon") as File).name).toBe("icon.png");

    const forms = fetchSpy.mock.calls.slice(4).map(([, init]) => init?.body as FormData);
    expect(forms.map((form) => form.get("position"))).toEqual(["0", "1"]);
    expect((forms[0]?.get("image") as File).name).toBe("1.png");
  });

  it("leaves a complete set of screenshots alone", async () => {
    const fetchSpy = withPreviews([{ id: 1 }, { id: 2 }]);
    await listing(fetchSpy).sync(content);
    expect(fetchSpy.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("uploads only the screenshots a previous run did not reach", async () => {
    const fetchSpy = withPreviews([{ id: 1 }]);
    await listing(fetchSpy).sync(content);

    const posts = fetchSpy.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    const form = posts[0]?.[1]?.body as FormData;
    expect((form.get("image") as File).name).toBe("2.png");
    expect(form.get("position")).toBe("1");
  });

  it("waits out throttling and retries with a fresh request", async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(throttled())
      .mockResolvedValueOnce(json({}));
    await listing(fetchSpy, sleep).setPrivacyPolicy("p");

    expect(sleep).toHaveBeenCalledWith(56_000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("gives up after repeated throttling", async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const fetchSpy = vi.fn<typeof fetch>().mockImplementation(async () => throttled());
    await expect(listing(fetchSpy, sleep).setPrivacyPolicy("p")).rejects.toThrow(/429/);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it("reports API errors with the response body", async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"detail":"Not found."}', { status: 404 }));
    await expect(listing(fetchSpy).setPrivacyPolicy("p")).rejects.toThrow(/404.*Not found/);
  });
});
