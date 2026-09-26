import { describe, expect, it } from "vitest";
import { FastmailJmapClient } from "../../src/api/jmap";
import { ApiTokenProvider } from "../../src/auth/apiToken";
import { AuthManager } from "../../src/auth/authManager";
import { OAuthTokenProvider } from "../../src/auth/oauth";
import { Controller } from "../../src/background/controller";
import { loopbackRedirectUri } from "../../src/background/redirect";
import { FAKE_API_TOKEN, FakeFastmail, type FakeFastmailOptions } from "../../src/dev/fakeFastmail";
import { SAMPLE_ALIASES } from "../../src/dev/fixtures";
import type { Request } from "../../src/shared/messages";
import { AliasStore } from "../../src/storage/aliasStore";
import { MemoryStorage } from "../../src/storage/kv";

function setup(options: FakeFastmailOptions & { oauth?: boolean } = {}) {
  const fake = new FakeFastmail({ aliases: SAMPLE_ALIASES, ...options });
  const storage = new MemoryStorage();
  const oauth = options.oauth
    ? new OAuthTokenProvider({
        clientId: "c",
        redirectUri: "http://127.0.0.1/mozoauth2/x",
        storage,
        fetch: fake.fetch,
        launchWebAuthFlow: async (url) =>
          `http://127.0.0.1/mozoauth2/x?code=c&state=${new URL(url).searchParams.get("state")}`,
      })
    : null;
  const controller = new Controller({
    auth: new AuthManager(new ApiTokenProvider(storage), oauth),
    store: new AliasStore(storage),
    apiFor: (tokens) => new FastmailJmapClient(tokens, fake.fetch),
  });
  const send = (request: Request) => controller.handle(request);
  return { fake, send };
}

describe("Controller", () => {
  it("starts signed out", async () => {
    const { send } = setup();
    expect(await send({ type: "getStatus", payload: {} })).toEqual({
      ok: true,
      data: { auth: { signedIn: false }, oauthAvailable: false, lastSyncedAt: null },
    });
  });

  it("signs in with a token and syncs straight away", async () => {
    const { send } = setup();
    const result = await send({ type: "signInToken", payload: { token: ` ${FAKE_API_TOKEN} ` } });
    expect(result).toMatchObject({ ok: true, data: { auth: { signedIn: true, method: "token" } } });

    const search = await send({ type: "search", payload: { query: "" } });
    expect(search.ok && (search.data as unknown[]).length).toBe(5);
  });

  it("rejects and forgets a bad token", async () => {
    const { send } = setup();
    const result = await send({ type: "signInToken", payload: { token: "wrong" } });
    expect(result).toMatchObject({ ok: false, error: { kind: "auth" } });
    expect(await send({ type: "getStatus", payload: {} })).toMatchObject({
      data: { auth: { signedIn: false } },
    });
  });

  it("rejects an empty token without a network call", async () => {
    const { send } = setup({ offline: true });
    expect(await send({ type: "signInToken", payload: { token: " " } })).toMatchObject({
      ok: false,
      error: { kind: "invalid" },
    });
  });

  it("signs in with OAuth and prefers it over a token", async () => {
    const { send } = setup({ oauth: true });
    await send({ type: "signInToken", payload: { token: FAKE_API_TOKEN } });
    const result = await send({ type: "signInOAuth", payload: {} });
    expect(result).toMatchObject({
      ok: true,
      data: { auth: { signedIn: true, method: "oauth" }, oauthAvailable: true },
    });
  });

  it("creates an alias for the current site and lists it there", async () => {
    const { send, fake } = setup();
    await send({ type: "signInToken", payload: { token: FAKE_API_TOKEN } });
    const created = await send({
      type: "create",
      payload: { url: "https://accounts.example.org/signup" },
    });
    expect(created.ok).toBe(true);
    expect(fake.aliases.at(-1)?.forDomain).toBe("https://accounts.example.org");

    const listed = await send({ type: "listForSite", payload: { url: "https://example.org/" } });
    expect(listed).toMatchObject({ ok: true, data: [{ description: "accounts.example.org" }] });
  });

  it("returns errors as data rather than throwing", async () => {
    const { send } = setup({ offline: true });
    expect(await send({ type: "sync", payload: { force: true } })).toMatchObject({
      ok: false,
      error: { kind: "auth" },
    });
  });

  it("clears the cache on sign out", async () => {
    const { send } = setup();
    await send({ type: "signInToken", payload: { token: FAKE_API_TOKEN } });
    await send({ type: "signOut", payload: {} });
    expect(await send({ type: "search", payload: { query: "" } })).toMatchObject({
      ok: false,
      error: { kind: "auth" },
    });
  });
});

describe("loopbackRedirectUri", () => {
  it("converts the Firefox redirect URL to the loopback form", () => {
    expect(loopbackRedirectUri("https://3aa3f5a1b2.extensions.allizom.org/")).toBe(
      "http://127.0.0.1/mozoauth2/3aa3f5a1b2",
    );
  });
});
