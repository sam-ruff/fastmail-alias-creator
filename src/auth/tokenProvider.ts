export interface TokenProvider {
  getAccessToken(): Promise<string>;
  /** Called after the API rejects a token. Returns true if a retry is worthwhile. */
  handleUnauthorised(): Promise<boolean>;
}
