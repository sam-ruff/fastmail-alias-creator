import { describe, expect, it, vi, type Mocked } from "vitest";
import { FastmailJmapClient, MASKED_EMAIL_CAPABILITY, SESSION_URL } from "../../src/api/jmap";
import type { TokenProvider } from "../../src/auth/tokenProvider";
import { FAKE_API_URL, FakeFastmail } from "../../src/dev/fakeFastmail";
import { SAMPLE_ALIASES } from "../../src/dev/fixtures";

function tokens(token = "fmu1-dev-token"): Mocked<TokenProvider> {
  return {
    getAccessToken: vi.fn().mockResolvedValue(token),
    handleUnauthorised: vi.fn().mockResolvedValue(false),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const session = json({
  apiUrl: FAKE_API_URL,
  primaryAccounts: { [MASKED_EMAIL_CAPABILITY]: "u1" },
});

describe("FastmailJmapClient", () => {
  it("discovers the session once and lists aliases", async () => {
    const fake = new FakeFastmail({ aliases: SAMPLE_ALIASES });
    const fetchSpy = vi.fn(fake.fetch);
    const client = new FastmailJmapClient(tokens(), fetchSpy);

    expect(await client.list()).toHaveLength(SAMPLE_ALIASES.length);
    await client.list();
    expect(fetchSpy.mock.calls.filter(([url]) => url === SESSION_URL)).toHaveLength(1);
  });

  it("sends the bearer token and masked email capability", async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(session.clone())
      .mockResolvedValueOnce(json({ methodResponses: [["MaskedEmail/get", { list: [] }, "0"]] }));
    await new FastmailJmapClient(tokens("abc"), fetchSpy).list();

    const [, init] = fetchSpy.mock.calls[1] ?? [];
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer abc");
    expect(JSON.parse(String(init?.body)).using).toContain(MASKED_EMAIL_CAPABILITY);
  });

  it("creates enabled aliases with the given domain", async () => {
    const fake = new FakeFastmail();
    const client = new FastmailJmapClient(tokens(), fake.fetch);
    const created = await client.create({ forDomain: "https://a.com", description: "a" });

    expect(created.email).toMatch(/@fastmail\.com$/);
    expect(fake.aliases[0]).toMatchObject({ forDomain: "https://a.com", state: "enabled" });
  });

  it("maps a rateLimit SetError", async () => {
    const client = new FastmailJmapClient(
      tokens(),
      new FakeFastmail({ rateLimitCreate: true }).fetch,
    );
    await expect(
      client.create({ forDomain: "https://a.com", description: "" }),
    ).rejects.toMatchObject({
      kind: "rateLimit",
    });
  });

  it("maps other SetErrors to invalid", async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(session.clone())
      .mockResolvedValueOnce(
        json({
          methodResponses: [
            [
              "MaskedEmail/set",
              { notCreated: { new: { type: "invalidProperties", description: "bad prefix" } } },
              "0",
            ],
          ],
        }),
      );
    const client = new FastmailJmapClient(tokens(), fetchSpy);
    await expect(client.create({ forDomain: "x", description: "" })).rejects.toMatchObject({
      kind: "invalid",
      message: "bad prefix",
    });
  });

  it("updates state and reports missing aliases", async () => {
    const fake = new FakeFastmail({ aliases: SAMPLE_ALIASES.map((a) => ({ ...a })) });
    const client = new FastmailJmapClient(tokens(), fake.fetch);
    await client.setState("me-1", "disabled");
    expect(fake.aliases.find((a) => a.id === "me-1")?.state).toBe("disabled");
    await expect(client.setState("missing", "disabled")).rejects.toThrow();
  });

  it("retries once after a successful token refresh", async () => {
    const provider = tokens();
    provider.handleUnauthorised.mockResolvedValue(true);
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(session.clone())
      .mockResolvedValueOnce(json({ methodResponses: [["MaskedEmail/get", { list: [] }, "0"]] }));

    expect(await new FastmailJmapClient(provider, fetchSpy).list()).toEqual([]);
    expect(provider.handleUnauthorised).toHaveBeenCalledTimes(1);
  });

  it("reports auth errors when the token is rejected", async () => {
    const client = new FastmailJmapClient(tokens("wrong"), new FakeFastmail().fetch);
    await expect(client.list()).rejects.toMatchObject({ kind: "auth" });
  });

  it("reports auth errors when the token lacks masked email scope", async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ apiUrl: FAKE_API_URL, primaryAccounts: {} }));
    await expect(new FastmailJmapClient(tokens(), fetchSpy).list()).rejects.toMatchObject({
      kind: "auth",
    });
  });

  it("surfaces JMAP method errors", async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(session.clone())
      .mockResolvedValueOnce(
        json({ methodResponses: [["error", { type: "accountNotFound" }, "0"]] }),
      );
    await expect(new FastmailJmapClient(tokens(), fetchSpy).list()).rejects.toThrow(
      "accountNotFound",
    );
  });

  it("maps HTTP 429 to rateLimit", async () => {
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 429 }));
    await expect(new FastmailJmapClient(tokens(), fetchSpy).list()).rejects.toMatchObject({
      kind: "rateLimit",
    });
  });
});
