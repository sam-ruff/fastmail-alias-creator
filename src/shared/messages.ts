import type { ErrorKind } from "./errors";
import type { AuthState, MaskedEmail, MaskedEmailState } from "./types";

export interface Status {
  auth: AuthState;
  oauthAvailable: boolean;
  lastSyncedAt: number | null;
}

/** Every popup/options to background call, keyed by message type. */
export interface RequestMap {
  getStatus: { req: Record<string, never>; res: Status };
  signInOAuth: { req: Record<string, never>; res: Status };
  signInToken: { req: { token: string }; res: Status };
  signOut: { req: Record<string, never>; res: Status };
  sync: { req: { force: boolean }; res: Status };
  listForSite: { req: { url: string }; res: MaskedEmail[] };
  search: { req: { query: string }; res: MaskedEmail[] };
  create: { req: { url: string; description?: string }; res: MaskedEmail };
  setState: { req: { id: string; state: MaskedEmailState }; res: MaskedEmail };
}

export type RequestType = keyof RequestMap;

export type Request = {
  [K in RequestType]: { type: K; payload: RequestMap[K]["req"] };
}[RequestType];

export type Response<T> =
  { ok: true; data: T } | { ok: false; error: { kind: ErrorKind; message: string } };

export function isRequest(value: unknown): value is Request {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { type?: unknown; payload?: unknown };
  return typeof candidate.type === "string" && typeof candidate.payload === "object";
}
