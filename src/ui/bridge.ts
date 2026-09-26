import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { ErrorKind } from "../shared/errors";
import type { RequestMap, RequestType, Response } from "../shared/messages";

export interface Bridge {
  send<K extends RequestType>(
    type: K,
    payload: RequestMap[K]["req"],
  ): Promise<RequestMap[K]["res"]>;
  activeTabUrl(): Promise<string | null>;
  copy(text: string): Promise<void>;
  openOptions(): void;
}

export class BridgeError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "BridgeError";
  }
}

export function unwrap<T>(response: Response<T> | undefined): T {
  if (!response) throw new BridgeError("server", "The extension background did not respond");
  if (!response.ok) throw new BridgeError(response.error.kind, response.error.message);
  return response.data;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const BridgeContext = createContext<Bridge | null>(null);

export function useBridge(): Bridge {
  const bridge = useContext(BridgeContext);
  if (!bridge) throw new Error("BridgeContext is missing");
  return bridge;
}
