import browser from "webextension-polyfill";
import { FastmailJmapClient } from "../api/jmap";
import { ApiTokenProvider } from "../auth/apiToken";
import { AuthManager } from "../auth/authManager";
import { OAuthTokenProvider } from "../auth/oauth";
import { isRequest } from "../shared/messages";
import { AliasStore } from "../storage/aliasStore";
import { ExtensionStorage } from "../storage/kv";
import { Controller } from "./controller";
import { loopbackRedirectUri } from "./redirect";

const storage = new ExtensionStorage(browser.storage.local);
const fetchFn: typeof fetch = (input, init) => fetch(input, init);
const clientId = import.meta.env.FASTMAIL_OAUTH_CLIENT_ID as string | undefined;

const oauth = clientId
  ? new OAuthTokenProvider({
      clientId,
      redirectUri: loopbackRedirectUri(browser.identity.getRedirectURL()),
      storage,
      fetch: fetchFn,
      launchWebAuthFlow: (url) => browser.identity.launchWebAuthFlow({ url, interactive: true }),
    })
  : null;

const controller = new Controller({
  auth: new AuthManager(new ApiTokenProvider(storage), oauth),
  store: new AliasStore(storage),
  apiFor: (tokens) => new FastmailJmapClient(tokens, fetchFn),
});

browser.runtime.onMessage.addListener((message: unknown) => {
  if (!isRequest(message)) return undefined;
  return controller.handle(message);
});
