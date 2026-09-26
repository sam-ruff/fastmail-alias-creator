import { beforeEach, describe, expect, it, vi } from "vitest";
import { OAUTH_TOKENS_KEY, OAuthTokenProvider, type StoredTokens } from "../../src/auth/oauth";
import { MemoryStorage } from "../../src/storage/kv";

const REDIRECT = "http://127.0.0.1/mozoauth2/abc";

function tokenResponse(access: string, refresh: string | undefined, expiresIn = 3600): Response {
  return new Response(
    JSON.stringify({ access_token: access, refresh_token: refresh, expires_in: expiresIn }),
    { status: 200 },
  );
}

function formOf(init: RequestInit | undefined): URLSearchParams {
  return new URLSearchParams(String(init?.body));
}

describe("OAuthTokenProvider", () => {
  let storage: MemoryStorage;
  let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;
  let launch: ReturnType<typeof vi.fn<(url: string) => Promise<string>>>;
  let now: number;
  let provider: OAuthTokenProvider;

  beforeEach(() => {
    storage = new MemoryStorage();
    fetchSpy = vi.fn<typeof fetch>();
    launch = vi.fn();
    now = 1_000_000;
    provider = new OAuthTokenProvider({
      clientId: "client-1",
      redirectUri: REDIRECT,
      storage,
      fetch: fetchSpy,
      launchWebAuthFlow: launch,
      now: () => now,
    });
  });

  const seed = (tokens: StoredTokens) => storage.set(OAUTH_TOKENS_KEY, tokens);

  describe("signIn", () => {
    it("runs the PKCE flow and stores the tokens", async () => {
      launch.mockImplementation(async (url) => {
        const params = new URL(url).searchParams;
        expect(params.get("client_id")).toBe("client-1");
        expect(params.get("redirect_uri")).toBe(REDIRECT);
        expect(params.get("code_challenge_method")).toBe("S256");
        expect(params.get("scope")).toContain("https://www.fastmail.com/dev/maskedemail");
        return `${REDIRECT}?code=the-code&state=${params.get("state")}`;
      });
      fetchSpy.mockResolvedValue(tokenResponse("a1", "r1"));

      await provider.signIn();

      const form = formOf(fetchSpy.mock.calls[0]?.[1]);
      expect(form.get("grant_type")).toBe("authorization_code");
      expect(form.get("code")).toBe("the-code");
      expect(form.get("code_verifier")).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
      expect(await storage.get(OAUTH_TOKENS_KEY)).toEqual({
        accessToken: "a1",
        refreshToken: "r1",
        expiresAt: now + 3_600_000,
      });
    });

    it("rejects a mismatched state", async () => {
      launch.mockResolvedValue(`${REDIRECT}?code=c&state=forged`);
      await expect(provider.signIn()).rejects.toMatchObject({ kind: "auth" });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("reports a denied consent", async () => {
      launch.mockResolvedValue(`${REDIRECT}?error=access_denied`);
      await expect(provider.signIn()).rejects.toThrow("access_denied");
    });
  });

  describe("getAccessToken", () => {
    it("returns a fresh token without refreshing", async () => {
      await seed({ accessToken: "a1", refreshToken: "r1", expiresAt: now + 600_000 });
      expect(await provider.getAccessToken()).toBe("a1");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("refreshes near expiry and stores the rotated refresh token", async () => {
      await seed({ accessToken: "a1", refreshToken: "r1", expiresAt: now + 30_000 });
      fetchSpy.mockResolvedValue(tokenResponse("a2", "r2"));

      expect(await provider.getAccessToken()).toBe("a2");
      expect(formOf(fetchSpy.mock.calls[0]?.[1]).get("refresh_token")).toBe("r1");
      expect((await storage.get<StoredTokens>(OAUTH_TOKENS_KEY))?.refreshToken).toBe("r2");
    });

    it("keeps the old refresh token if none is returned", async () => {
      await seed({ accessToken: "a1", refreshToken: "r1", expiresAt: 0 });
      fetchSpy.mockResolvedValue(tokenResponse("a2", undefined));
      await provider.getAccessToken();
      expect((await storage.get<StoredTokens>(OAUTH_TOKENS_KEY))?.refreshToken).toBe("r1");
    });

    it("only runs one refresh for concurrent callers", async () => {
      await seed({ accessToken: "a1", refreshToken: "r1", expiresAt: 0 });
      fetchSpy.mockImplementation(async () => tokenResponse("a2", "r2"));

      const results = await Promise.all([
        provider.getAccessToken(),
        provider.getAccessToken(),
        provider.handleUnauthorised(),
      ]);
      expect(results).toEqual(["a2", "a2", true]);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("signs out when the refresh token is rejected", async () => {
      await seed({ accessToken: "a1", refreshToken: "r1", expiresAt: 0 });
      fetchSpy.mockResolvedValue(new Response("{}", { status: 400 }));

      await expect(provider.getAccessToken()).rejects.toMatchObject({ kind: "auth" });
      expect(await provider.hasTokens()).toBe(false);
    });

    it("keeps tokens on a server error so a later retry can succeed", async () => {
      await seed({ accessToken: "a1", refreshToken: "r1", expiresAt: 0 });
      fetchSpy.mockResolvedValue(new Response("", { status: 503 }));
      await expect(provider.getAccessToken()).rejects.toMatchObject({ kind: "server" });
      expect(await provider.hasTokens()).toBe(true);
    });

    it("errors when not signed in", async () => {
      await expect(provider.getAccessToken()).rejects.toMatchObject({ kind: "auth" });
    });
  });

  it("revokes the refresh token on sign out", async () => {
    await seed({ accessToken: "a1", refreshToken: "r1", expiresAt: now + 600_000 });
    fetchSpy.mockResolvedValue(new Response("", { status: 200 }));
    await provider.signOut();

    expect(fetchSpy.mock.calls[0]?.[0]).toBe("https://api.fastmail.com/oauth/revoke");
    expect(formOf(fetchSpy.mock.calls[0]?.[1]).get("token")).toBe("r1");
    expect(await provider.hasTokens()).toBe(false);
  });

  it("still signs out locally when revocation fails", async () => {
    await seed({ accessToken: "a1", refreshToken: "r1", expiresAt: now });
    fetchSpy.mockRejectedValue(new TypeError("offline"));
    await provider.signOut();
    expect(await provider.hasTokens()).toBe(false);
  });
});
