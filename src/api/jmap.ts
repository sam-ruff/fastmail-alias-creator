import type { TokenProvider } from "../auth/tokenProvider";
import { AppError } from "../shared/errors";
import type { CreateMaskedEmailInput, MaskedEmail, MaskedEmailState } from "../shared/types";

export const SESSION_URL = "https://api.fastmail.com/jmap/session";
export const MASKED_EMAIL_CAPABILITY = "https://www.fastmail.com/dev/maskedemail";
const USING = ["urn:ietf:params:jmap:core", MASKED_EMAIL_CAPABILITY];

export interface CreatedMaskedEmail {
  id: string;
  email: string;
  createdAt?: string;
  createdBy?: string;
}

export interface MaskedEmailApi {
  list(): Promise<MaskedEmail[]>;
  create(input: CreateMaskedEmailInput): Promise<CreatedMaskedEmail>;
  setState(id: string, state: MaskedEmailState): Promise<void>;
}

interface Session {
  apiUrl: string;
  accountId: string;
}

interface SetError {
  type: string;
  description?: string;
}

interface SetResponse {
  created?: Record<string, CreatedMaskedEmail> | null;
  notCreated?: Record<string, SetError> | null;
  updated?: Record<string, unknown> | null;
  notUpdated?: Record<string, SetError> | null;
}

type MethodCall = [string, Record<string, unknown>, string];

export class FastmailJmapClient implements MaskedEmailApi {
  private session: Session | null = null;

  constructor(
    private readonly tokens: TokenProvider,
    private readonly fetchFn: typeof fetch,
  ) {}

  async list(): Promise<MaskedEmail[]> {
    const { accountId } = await this.getSession();
    const result = await this.call<{ list: MaskedEmail[] }>([
      "MaskedEmail/get",
      { accountId, ids: null },
      "0",
    ]);
    return result.list;
  }

  async create(input: CreateMaskedEmailInput): Promise<CreatedMaskedEmail> {
    const { accountId } = await this.getSession();
    const result = await this.call<SetResponse>([
      "MaskedEmail/set",
      { accountId, create: { new: { ...input, state: "enabled" } } },
      "0",
    ]);
    const created = result.created?.["new"];
    if (created) return created;
    throw setErrorToAppError(result.notCreated?.["new"], "Fastmail did not create the alias");
  }

  async setState(id: string, state: MaskedEmailState): Promise<void> {
    const { accountId } = await this.getSession();
    const result = await this.call<SetResponse>([
      "MaskedEmail/set",
      { accountId, update: { [id]: { state } } },
      "0",
    ]);
    if (result.updated && id in result.updated) return;
    throw setErrorToAppError(result.notUpdated?.[id], "Fastmail did not update the alias");
  }

  private async getSession(): Promise<Session> {
    if (this.session) return this.session;
    const response = await this.authorisedFetch(SESSION_URL, { method: "GET" });
    const body = (await response.json()) as {
      apiUrl?: string;
      primaryAccounts?: Record<string, string>;
    };
    const accountId = body.primaryAccounts?.[MASKED_EMAIL_CAPABILITY];
    if (!body.apiUrl || !accountId) {
      throw new AppError("auth", "This Fastmail login does not have Masked Email access");
    }
    this.session = { apiUrl: body.apiUrl, accountId };
    return this.session;
  }

  private async call<T>(methodCall: MethodCall): Promise<T> {
    const { apiUrl } = await this.getSession();
    const response = await this.authorisedFetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ using: USING, methodCalls: [methodCall] }),
    });
    const body = (await response.json()) as { methodResponses?: MethodCall[] };
    const first = body.methodResponses?.[0];
    if (!first) throw new AppError("server", "Empty response from Fastmail");

    const [name, args] = first;
    if (name === "error") {
      const type = typeof args["type"] === "string" ? args["type"] : "unknown";
      throw new AppError("server", `Fastmail returned an error: ${type}`);
    }
    return args as T;
  }

  private async authorisedFetch(url: string, init: RequestInit): Promise<Response> {
    const send = async () =>
      this.fetchFn(url, {
        ...init,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${await this.tokens.getAccessToken()}`,
        },
      });

    let response = await send();
    if (response.status === 401 && (await this.tokens.handleUnauthorised())) {
      response = await send();
    }
    if (response.status === 401 || response.status === 403) {
      throw new AppError("auth", "Fastmail rejected the credentials");
    }
    if (response.status === 429) throw new AppError("rateLimit", "Fastmail rate limit reached");
    if (!response.ok) throw new AppError("server", `Fastmail request failed (${response.status})`);
    return response;
  }
}

function setErrorToAppError(error: SetError | undefined, fallback: string): AppError {
  if (!error) return new AppError("server", fallback);
  if (error.type === "rateLimit") {
    return new AppError("rateLimit", "Too many aliases created recently, try again later");
  }
  return new AppError("invalid", error.description ?? `${fallback} (${error.type})`);
}
