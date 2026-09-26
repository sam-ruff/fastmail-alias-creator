import { AppError } from "../shared/errors";
import type { KeyValueStorage } from "../storage/kv";
import {
  base64Url,
  challengeFor,
  createVerifier,
  cryptoRandomBytes,
  type RandomBytes,
} from "./pkce";
import type { TokenProvider } from "./tokenProvider";

export const OAUTH_TOKENS_KEY = "auth.oauthTokens";

const AUTHORIZE_URL = "https://api.fastmail.com/oauth/authorize";
const TOKEN_URL = "https://api.fastmail.com/oauth/refresh";
const REVOKE_URL = "https://api.fastmail.com/oauth/revoke";
const SCOPES = ["urn:ietf:params:jmap:core", "https://www.fastmail.com/dev/maskedemail"];
const EXPIRY_MARGIN_MS = 60_000;

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface OAuthDeps {
  clientId: string;
  redirectUri: string;
  storage: KeyValueStorage;
  fetch: typeof fetch;
  launchWebAuthFlow: (url: string) => Promise<string>;
  now?: () => number;
  randomBytes?: RandomBytes;
}

export class OAuthTokenProvider implements TokenProvider {
  private refreshing: Promise<StoredTokens> | null = null;
  private readonly now: () => number;
  private readonly randomBytes: RandomBytes;

  constructor(private readonly deps: OAuthDeps) {
    this.now = deps.now ?? Date.now;
    this.randomBytes = deps.randomBytes ?? cryptoRandomBytes;
  }

  async signIn(): Promise<void> {
    const verifier = createVerifier(this.randomBytes);
    const state = base64Url(this.randomBytes(16));
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.deps.clientId,
      redirect_uri: this.deps.redirectUri,
      scope: SCOPES.join(" "),
      state,
      code_challenge: await challengeFor(verifier),
      code_challenge_method: "S256",
    });

    const redirected = new URL(await this.deps.launchWebAuthFlow(`${AUTHORIZE_URL}?${params}`));
    const error = redirected.searchParams.get("error");
    if (error) throw new AppError("auth", `Fastmail sign in failed: ${error}`);
    if (redirected.searchParams.get("state") !== state) {
      throw new AppError("auth", "Sign in response did not match the request");
    }
    const code = redirected.searchParams.get("code");
    if (!code) throw new AppError("auth", "Fastmail did not return an authorisation code");

    const tokens = await this.requestTokens(
      {
        grant_type: "authorization_code",
        code,
        redirect_uri: this.deps.redirectUri,
        code_verifier: verifier,
      },
      null,
    );
    await this.deps.storage.set(OAUTH_TOKENS_KEY, tokens);
  }

  async getAccessToken(): Promise<string> {
    const tokens = await this.load();
    if (tokens.expiresAt - EXPIRY_MARGIN_MS > this.now()) return tokens.accessToken;
    return (await this.refresh()).accessToken;
  }

  async handleUnauthorised(): Promise<boolean> {
    try {
      await this.refresh();
      return true;
    } catch {
      return false;
    }
  }

  async signOut(): Promise<void> {
    const tokens = await this.deps.storage.get<StoredTokens>(OAUTH_TOKENS_KEY);
    await this.deps.storage.remove(OAUTH_TOKENS_KEY);
    if (!tokens) return;
    try {
      await this.deps.fetch(REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: this.deps.clientId, token: tokens.refreshToken }),
      });
    } catch {
      // Revocation is best effort; the local tokens are already gone.
    }
  }

  async hasTokens(): Promise<boolean> {
    return Boolean(await this.deps.storage.get<StoredTokens>(OAUTH_TOKENS_KEY));
  }

  /** Fastmail revokes the whole grant if an old refresh token is reused, so only one refresh may run. */
  private refresh(): Promise<StoredTokens> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<StoredTokens> {
    const current = await this.load();
    try {
      const tokens = await this.requestTokens(
        { grant_type: "refresh_token", refresh_token: current.refreshToken },
        current.refreshToken,
      );
      await this.deps.storage.set(OAUTH_TOKENS_KEY, tokens);
      return tokens;
    } catch (err) {
      if (err instanceof AppError && err.kind === "auth") {
        await this.deps.storage.remove(OAUTH_TOKENS_KEY);
      }
      throw err;
    }
  }

  private async load(): Promise<StoredTokens> {
    const tokens = await this.deps.storage.get<StoredTokens>(OAUTH_TOKENS_KEY);
    if (!tokens) throw new AppError("auth", "Not signed in");
    return tokens;
  }

  private async requestTokens(
    params: Record<string, string>,
    previousRefreshToken: string | null,
  ): Promise<StoredTokens> {
    const response = await this.deps.fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...params, client_id: this.deps.clientId }),
    });
    if (response.status === 400 || response.status === 401) {
      throw new AppError("auth", "Fastmail session expired, please sign in again");
    }
    if (!response.ok) throw new AppError("server", `Token request failed (${response.status})`);

    const body = (await response.json()) as TokenResponse;
    const refreshToken = body.refresh_token ?? previousRefreshToken;
    if (!body.access_token || !refreshToken) {
      throw new AppError("server", "Fastmail returned an incomplete token response");
    }
    return {
      accessToken: body.access_token,
      refreshToken,
      expiresAt: this.now() + (body.expires_in ?? 3600) * 1000,
    };
  }
}
