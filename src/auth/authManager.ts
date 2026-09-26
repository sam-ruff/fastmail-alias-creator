import type { AuthState } from "../shared/types";
import type { ApiTokenProvider } from "./apiToken";
import type { OAuthTokenProvider } from "./oauth";
import type { TokenProvider } from "./tokenProvider";

/** Chooses between OAuth and API token credentials. OAuth wins if both exist. */
export class AuthManager {
  constructor(
    private readonly apiToken: ApiTokenProvider,
    private readonly oauth: OAuthTokenProvider | null,
  ) {}

  get oauthAvailable(): boolean {
    return this.oauth !== null;
  }

  async state(): Promise<AuthState> {
    if (this.oauth && (await this.oauth.hasTokens())) return { signedIn: true, method: "oauth" };
    if (await this.apiToken.hasToken()) return { signedIn: true, method: "token" };
    return { signedIn: false };
  }

  async activeProvider(): Promise<TokenProvider | null> {
    const state = await this.state();
    if (!state.signedIn) return null;
    return state.method === "oauth" ? this.oauth : this.apiToken;
  }

  async signInOAuth(): Promise<void> {
    if (!this.oauth) throw new Error("OAuth is not configured in this build");
    await this.oauth.signIn();
    await this.apiToken.clear();
  }

  async saveApiToken(token: string): Promise<void> {
    await this.oauth?.signOut();
    await this.apiToken.save(token);
  }

  async signOut(): Promise<void> {
    await this.oauth?.signOut();
    await this.apiToken.clear();
  }
}
