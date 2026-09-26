import { FastmailJmapClient } from "../api/jmap";
import { ApiTokenProvider } from "../auth/apiToken";
import { AuthManager } from "../auth/authManager";
import { OAuthTokenProvider } from "../auth/oauth";
import { Controller } from "../background/controller";
import type { RequestMap, RequestType, Response } from "../shared/messages";
import { AliasStore } from "../storage/aliasStore";
import { MemoryStorage } from "../storage/kv";
import { unwrap, type Bridge } from "../ui/bridge";
import { FAKE_API_TOKEN, FakeFastmail } from "./fakeFastmail";
import { SAMPLE_ALIASES } from "./fixtures";

/**
 * Dev-mode bridge: the real controller and client running against an in-memory Fastmail.
 * Query parameters pick the scenario, e.g. ?scenario=signed-in&url=https://github.com/login
 */
export function createBridge(): Bridge {
  const params = new URLSearchParams(location.search);
  const scenario = params.get("scenario") ?? "signed-out";
  const tabUrl = params.get("url") ?? "https://github.com/login";

  const fake = new FakeFastmail({
    aliases: scenario === "empty" ? [] : SAMPLE_ALIASES,
    rateLimitCreate: scenario === "rate-limit",
    offline: scenario === "offline",
    latencyMs: 250,
  });
  const storage = new MemoryStorage();
  const apiToken = new ApiTokenProvider(storage);
  const oauth =
    scenario === "no-oauth"
      ? null
      : new OAuthTokenProvider({
          clientId: "dev-client",
          redirectUri: "http://127.0.0.1/mozoauth2/dev",
          storage,
          fetch: fake.fetch,
          launchWebAuthFlow: async (url) => {
            const state = new URL(url).searchParams.get("state") ?? "";
            return `http://127.0.0.1/mozoauth2/dev?code=dev-code&state=${state}`;
          },
        });
  const controller = new Controller({
    auth: new AuthManager(apiToken, oauth),
    store: new AliasStore(storage),
    apiFor: (tokens) => new FastmailJmapClient(tokens, fake.fetch),
  });

  const ready = ["signed-in", "rate-limit", "offline", "empty"].includes(scenario)
    ? apiToken.save(FAKE_API_TOKEN)
    : Promise.resolve();

  return {
    async send<K extends RequestType>(type: K, payload: RequestMap[K]["req"]) {
      await ready;
      const response = (await controller.handle({ type, payload } as never)) as Response<
        RequestMap[K]["res"]
      >;
      return unwrap(response);
    },
    activeTabUrl: async () => tabUrl,
    copy: async (text) => {
      console.info("[dev] copied", text);
      await navigator.clipboard?.writeText(text).catch(() => undefined);
    },
    openOptions: () => window.open(`/options/index.html${location.search}`, "_blank"),
  };
}
