import browser from "webextension-polyfill";
import type { RequestMap, RequestType, Response } from "../shared/messages";
import { unwrap, type Bridge } from "./bridge";

export function createBridge(): Bridge {
  return {
    async send<K extends RequestType>(type: K, payload: RequestMap[K]["req"]) {
      const response = (await browser.runtime.sendMessage({ type, payload })) as
        Response<RequestMap[K]["res"]> | undefined;
      return unwrap(response);
    },
    async activeTabUrl() {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      return tab?.url ?? null;
    },
    copy: (text) => navigator.clipboard.writeText(text),
    openOptions: () => void browser.runtime.openOptionsPage(),
  };
}
