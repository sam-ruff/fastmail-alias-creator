import { belongsToSite, type Site } from "../domain";
import type { MaskedEmail } from "../shared/types";
import type { KeyValueStorage } from "./kv";

export const ALIAS_CACHE_KEY = "aliases.cache";

interface AliasCache {
  aliases: MaskedEmail[];
  lastSyncedAt: number | null;
}

const EMPTY: AliasCache = { aliases: [], lastSyncedAt: null };

export class AliasStore {
  constructor(private readonly storage: KeyValueStorage) {}

  async lastSyncedAt(): Promise<number | null> {
    return (await this.load()).lastSyncedAt;
  }

  async replaceAll(aliases: MaskedEmail[], syncedAt: number): Promise<void> {
    await this.storage.set<AliasCache>(ALIAS_CACHE_KEY, { aliases, lastSyncedAt: syncedAt });
  }

  async upsert(alias: MaskedEmail): Promise<void> {
    const cache = await this.load();
    const others = cache.aliases.filter((existing) => existing.id !== alias.id);
    await this.storage.set<AliasCache>(ALIAS_CACHE_KEY, {
      ...cache,
      aliases: [...others, alias],
    });
  }

  async get(id: string): Promise<MaskedEmail | undefined> {
    return (await this.load()).aliases.find((alias) => alias.id === id);
  }

  async forSite(site: Site): Promise<MaskedEmail[]> {
    const aliases = await this.visible();
    return aliases.filter((alias) => belongsToSite(alias.forDomain, site));
  }

  async search(query: string): Promise<MaskedEmail[]> {
    const aliases = await this.visible();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return aliases;
    return aliases.filter((alias) => {
      const haystack = `${alias.email} ${alias.forDomain} ${alias.description}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }

  async clear(): Promise<void> {
    await this.storage.remove(ALIAS_CACHE_KEY);
  }

  private async visible(): Promise<MaskedEmail[]> {
    const { aliases } = await this.load();
    return aliases
      .filter((alias) => alias.state !== "deleted")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private async load(): Promise<AliasCache> {
    return (await this.storage.get<AliasCache>(ALIAS_CACHE_KEY)) ?? EMPTY;
  }
}
