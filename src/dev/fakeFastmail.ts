import { MASKED_EMAIL_CAPABILITY, SESSION_URL } from "../api/jmap";
import type { MaskedEmail, MaskedEmailState } from "../shared/types";

export const FAKE_API_URL = "https://api.fastmail.com/jmap/api/";
export const FAKE_API_TOKEN = "fmu1-dev-token";
const ACCOUNT_ID = "u1234";

export interface FakeFastmailOptions {
  aliases?: MaskedEmail[];
  rateLimitCreate?: boolean;
  offline?: boolean;
  latencyMs?: number;
}

type MethodCall = [string, Record<string, unknown>, string];

/** In-memory stand-in for the parts of Fastmail's API the extension uses. */
export class FakeFastmail {
  readonly aliases: MaskedEmail[];
  private readonly validTokens = new Set([FAKE_API_TOKEN]);
  private counter = 0;

  constructor(private readonly options: FakeFastmailOptions = {}) {
    this.aliases = structuredClone(options.aliases ?? []);
  }

  readonly fetch: typeof fetch = async (input, init) => {
    if (this.options.latencyMs) await new Promise((r) => setTimeout(r, this.options.latencyMs));
    if (this.options.offline)
      throw new TypeError("NetworkError when attempting to fetch resource.");

    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/oauth/refresh")) return this.issueTokens();
    if (url.includes("/oauth/revoke")) return json({});

    const auth = new Headers(init?.headers).get("Authorization") ?? "";
    if (!this.validTokens.has(auth.replace(/^Bearer /, "")))
      return new Response("", { status: 401 });

    if (url === SESSION_URL) {
      return json({
        apiUrl: FAKE_API_URL,
        primaryAccounts: { [MASKED_EMAIL_CAPABILITY]: ACCOUNT_ID },
      });
    }
    if (url === FAKE_API_URL) {
      const body = JSON.parse(String(init?.body)) as { methodCalls: MethodCall[] };
      return json({ methodResponses: body.methodCalls.map((call) => this.handle(call)) });
    }
    return new Response("", { status: 404 });
  };

  private handle([name, args, callId]: MethodCall): MethodCall {
    if (name === "MaskedEmail/get")
      return [name, { accountId: ACCOUNT_ID, list: this.aliases }, callId];
    if (name !== "MaskedEmail/set") return ["error", { type: "unknownMethod" }, callId];

    const create = args["create"] as Record<string, Partial<MaskedEmail>> | undefined;
    const update = args["update"] as Record<string, { state: MaskedEmailState }> | undefined;
    const result: Record<string, unknown> = { accountId: ACCOUNT_ID };

    if (create) {
      if (this.options.rateLimitCreate) {
        result["notCreated"] = mapValues(create, () => ({ type: "rateLimit" }));
      } else {
        result["created"] = mapValues(create, (input) => {
          const alias = this.newAlias(input);
          this.aliases.push(alias);
          return {
            id: alias.id,
            email: alias.email,
            createdAt: alias.createdAt,
            createdBy: alias.createdBy,
          };
        });
      }
    }
    if (update) {
      result["updated"] = {};
      for (const [id, patch] of Object.entries(update)) {
        const alias = this.aliases.find((a) => a.id === id);
        if (!alias) continue;
        alias.state = patch.state;
        (result["updated"] as Record<string, null>)[id] = null;
      }
    }
    return [name, result, callId];
  }

  private newAlias(input: Partial<MaskedEmail>): MaskedEmail {
    this.counter += 1;
    const word = ["maple", "otter", "quartz", "lantern", "comet"][this.counter % 5];
    return {
      id: `me-new-${this.counter}`,
      email: `${word}.${1000 + this.counter}@fastmail.com`,
      state: input.state ?? "enabled",
      forDomain: input.forDomain ?? "",
      description: input.description ?? "",
      url: null,
      createdBy: "Fastmail Alias Creator",
      createdAt: new Date().toISOString(),
      lastMessageAt: null,
    };
  }

  private issueTokens(): Response {
    this.counter += 1;
    const accessToken = `access-${this.counter}`;
    this.validTokens.add(accessToken);
    return json({
      access_token: accessToken,
      refresh_token: `refresh-${this.counter}`,
      expires_in: 3600,
    });
  }
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function mapValues<T, U>(record: Record<string, T>, fn: (value: T) => U): Record<string, U> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, fn(value)]));
}
