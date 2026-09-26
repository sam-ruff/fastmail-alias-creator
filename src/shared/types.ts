export type MaskedEmailState = "pending" | "enabled" | "disabled" | "deleted";

export interface MaskedEmail {
  id: string;
  email: string;
  state: MaskedEmailState;
  forDomain: string;
  description: string;
  url: string | null;
  createdBy: string;
  createdAt: string;
  lastMessageAt: string | null;
}

export interface CreateMaskedEmailInput {
  forDomain: string;
  description: string;
  emailPrefix?: string;
}

export type AuthMethod = "oauth" | "token";

export type AuthState = { signedIn: false } | { signedIn: true; method: AuthMethod };
