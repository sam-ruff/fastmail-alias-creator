import { beforeEach, describe, expect, it } from "vitest";
import { SAMPLE_ALIASES } from "../../src/dev/fixtures";
import { siteFromUrl } from "../../src/domain";
import { AliasStore } from "../../src/storage/aliasStore";
import { MemoryStorage } from "../../src/storage/kv";

describe("AliasStore", () => {
  let store: AliasStore;

  beforeEach(async () => {
    store = new AliasStore(new MemoryStorage());
    await store.replaceAll(SAMPLE_ALIASES, 1000);
  });

  it("records when it last synced", async () => {
    expect(await store.lastSyncedAt()).toBe(1000);
  });

  it("lists aliases for a site newest first, hiding deleted ones", async () => {
    const site = siteFromUrl("https://github.com/");
    if (!site) throw new Error("bad fixture");
    const aliases = await store.forSite(site);
    expect(aliases.map((a) => a.id)).toEqual(["me-1", "me-2"]);
  });

  it("searches across email, domain and description with all terms required", async () => {
    expect((await store.search("amazon")).map((a) => a.id)).toEqual(["me-3"]);
    expect((await store.search("RIVER hacker")).map((a) => a.id)).toEqual(["me-4"]);
    expect(await store.search("github nothing")).toEqual([]);
    expect(await store.search("")).toHaveLength(5);
  });

  it("upserts by id", async () => {
    const first = SAMPLE_ALIASES[0];
    if (!first) throw new Error("bad fixture");
    await store.upsert({ ...first, state: "disabled" });
    expect((await store.get(first.id))?.state).toBe("disabled");
    expect(await store.search("")).toHaveLength(5);
  });

  it("clears everything", async () => {
    await store.clear();
    expect(await store.search("")).toEqual([]);
    expect(await store.lastSyncedAt()).toBeNull();
  });
});
