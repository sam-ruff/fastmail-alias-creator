import { AppError } from "../shared/errors";
import type { KeyValueStorage } from "../storage/kv";
import type { TokenProvider } from "./tokenProvider";

export const API_TOKEN_KEY = "auth.apiToken";

export class ApiTokenProvider implements TokenProvider {
  constructor(private readonly storage: KeyValueStorage) {}

  async getAccessToken(): Promise<string> {
    const token = await this.storage.get<string>(API_TOKEN_KEY);
    if (!token) throw new AppError("auth", "No API token saved");
    return token;
  }

  async handleUnauthorised(): Promise<boolean> {
    return false;
  }

  async save(token: string): Promise<void> {
    await this.storage.set(API_TOKEN_KEY, token.trim());
  }

  async clear(): Promise<void> {
    await this.storage.remove(API_TOKEN_KEY);
  }

  async hasToken(): Promise<boolean> {
    return Boolean(await this.storage.get<string>(API_TOKEN_KEY));
  }
}
