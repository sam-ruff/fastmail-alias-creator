import type { MaskedEmailApi } from "../api/jmap";
import { siteFromUrl } from "../domain";
import { AppError } from "../shared/errors";
import type { MaskedEmail, MaskedEmailState } from "../shared/types";
import type { AliasStore } from "../storage/aliasStore";

export const SYNC_INTERVAL_MS = 5 * 60_000;

export class AliasService {
  constructor(
    private readonly api: MaskedEmailApi,
    private readonly store: AliasStore,
    private readonly now: () => number = Date.now,
  ) {}

  async sync(force: boolean): Promise<void> {
    const last = await this.store.lastSyncedAt();
    if (!force && last !== null && this.now() - last < SYNC_INTERVAL_MS) return;
    const aliases = await this.api.list();
    await this.store.replaceAll(aliases, this.now());
  }

  async listForSite(url: string): Promise<MaskedEmail[]> {
    const site = siteFromUrl(url);
    if (!site) return [];
    return this.store.forSite(site);
  }

  search(query: string): Promise<MaskedEmail[]> {
    return this.store.search(query);
  }

  async createForSite(url: string, description?: string): Promise<MaskedEmail> {
    const site = siteFromUrl(url);
    if (!site) throw new AppError("invalid", "Aliases can only be created for websites");

    const input = { forDomain: site.origin, description: description?.trim() || site.hostname };
    const created = await this.api.create(input);
    const alias: MaskedEmail = {
      ...input,
      id: created.id,
      email: created.email,
      state: "enabled",
      url: null,
      createdBy: created.createdBy ?? "",
      createdAt: created.createdAt ?? new Date(this.now()).toISOString(),
      lastMessageAt: null,
    };
    await this.store.upsert(alias);
    return alias;
  }

  async setState(id: string, state: MaskedEmailState): Promise<MaskedEmail> {
    await this.api.setState(id, state);
    const existing = await this.store.get(id);
    if (!existing) {
      await this.sync(true);
      const synced = await this.store.get(id);
      if (!synced) throw new AppError("invalid", "Alias no longer exists");
      return synced;
    }
    const updated = { ...existing, state };
    await this.store.upsert(updated);
    return updated;
  }
}
