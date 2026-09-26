import type { MaskedEmailApi } from "../api/jmap";
import type { AuthManager } from "../auth/authManager";
import type { TokenProvider } from "../auth/tokenProvider";
import { AliasService } from "../services/aliasService";
import { AppError, toAppError } from "../shared/errors";
import type { Request, RequestMap, RequestType, Response, Status } from "../shared/messages";
import type { AuthMethod } from "../shared/types";
import type { AliasStore } from "../storage/aliasStore";

export interface ControllerDeps {
  auth: AuthManager;
  store: AliasStore;
  apiFor: (tokens: TokenProvider) => MaskedEmailApi;
  now?: () => number;
}

type Handlers = {
  [K in RequestType]: (payload: RequestMap[K]["req"]) => Promise<RequestMap[K]["res"]>;
};

export class Controller {
  private cached: { method: AuthMethod; service: AliasService } | null = null;
  private readonly handlers: Handlers;

  constructor(private readonly deps: ControllerDeps) {
    this.handlers = {
      getStatus: () => this.status(),
      signInOAuth: async () => {
        await this.deps.auth.signInOAuth();
        return this.afterSignIn();
      },
      signInToken: async ({ token }) => {
        if (!token.trim()) throw new AppError("invalid", "Paste an API token first");
        await this.deps.auth.saveApiToken(token);
        return this.afterSignIn();
      },
      signOut: async () => {
        await this.deps.auth.signOut();
        await this.deps.store.clear();
        this.cached = null;
        return this.status();
      },
      sync: async ({ force }) => {
        await (await this.service()).sync(force);
        return this.status();
      },
      listForSite: async ({ url }) => (await this.service()).listForSite(url),
      search: async ({ query }) => (await this.service()).search(query),
      create: async ({ url, description }) =>
        (await this.service()).createForSite(url, description),
      setState: async ({ id, state }) => (await this.service()).setState(id, state),
    };
  }

  async handle(request: Request): Promise<Response<unknown>> {
    try {
      const handler = this.handlers[request.type] as (payload: unknown) => Promise<unknown>;
      return { ok: true, data: await handler(request.payload) };
    } catch (err) {
      const error = toAppError(err);
      return { ok: false, error: { kind: error.kind, message: error.message } };
    }
  }

  private async status(): Promise<Status> {
    return {
      auth: await this.deps.auth.state(),
      oauthAvailable: this.deps.auth.oauthAvailable,
      lastSyncedAt: await this.deps.store.lastSyncedAt(),
    };
  }

  /** Syncs straight away so a bad token is reported at sign in rather than on first use. */
  private async afterSignIn(): Promise<Status> {
    this.cached = null;
    await this.deps.store.clear();
    try {
      await (await this.service()).sync(true);
    } catch (err) {
      const error = toAppError(err);
      if (error.kind === "auth") await this.deps.auth.signOut();
      throw error;
    }
    return this.status();
  }

  private async service(): Promise<AliasService> {
    const state = await this.deps.auth.state();
    if (!state.signedIn) throw new AppError("auth", "Not signed in");
    if (this.cached?.method === state.method) return this.cached.service;

    const provider = await this.deps.auth.activeProvider();
    if (!provider) throw new AppError("auth", "Not signed in");
    const service = new AliasService(this.deps.apiFor(provider), this.deps.store, this.deps.now);
    this.cached = { method: state.method, service };
    return service;
  }
}
