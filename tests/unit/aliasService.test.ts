import { beforeEach, describe, expect, it, vi, type Mocked } from "vitest";
import type { MaskedEmailApi } from "../../src/api/jmap";
import { SAMPLE_ALIASES } from "../../src/dev/fixtures";
import { AliasService, SYNC_INTERVAL_MS } from "../../src/services/aliasService";
import { AppError } from "../../src/shared/errors";
import { AliasStore } from "../../src/storage/aliasStore";
import { MemoryStorage } from "../../src/storage/kv";

function mockApi(): Mocked<MaskedEmailApi> {
  return { list: vi.fn(), create: vi.fn(), setState: vi.fn() };
}

describe("AliasService", () => {
  let api: Mocked<MaskedEmailApi>;
  let store: AliasStore;
  let now: number;
  let service: AliasService;

  beforeEach(() => {
    api = mockApi();
    store = new AliasStore(new MemoryStorage());
    now = Date.parse("2026-09-26T12:00:00Z");
    service = new AliasService(api, store, () => now);
  });

  describe("sync", () => {
    it("fetches when the cache is empty", async () => {
      api.list.mockResolvedValue(SAMPLE_ALIASES);
      await service.sync(false);
      expect(api.list).toHaveBeenCalledTimes(1);
      expect(await store.lastSyncedAt()).toBe(now);
    });

    it("skips when the cache is fresh unless forced", async () => {
      api.list.mockResolvedValue([]);
      await store.replaceAll([], now - SYNC_INTERVAL_MS + 1);
      await service.sync(false);
      expect(api.list).not.toHaveBeenCalled();
      await service.sync(true);
      expect(api.list).toHaveBeenCalledTimes(1);
    });

    it("keeps the old cache when the fetch fails", async () => {
      await store.replaceAll(SAMPLE_ALIASES, 1);
      api.list.mockRejectedValue(new AppError("network", "offline"));
      await expect(service.sync(true)).rejects.toThrow("offline");
      expect(await store.search("")).toHaveLength(5);
    });
  });

  describe("createForSite", () => {
    it("creates for the page origin, defaults the description and caches the result", async () => {
      api.create.mockResolvedValue({ id: "new", email: "x.1@fastmail.com" });
      const alias = await service.createForSite("https://login.example.com/signup?x=1");

      expect(api.create).toHaveBeenCalledWith({
        forDomain: "https://login.example.com",
        description: "login.example.com",
      });
      expect(alias).toMatchObject({ id: "new", email: "x.1@fastmail.com", state: "enabled" });
      expect(alias.createdAt).toBe("2026-09-26T12:00:00.000Z");
      expect(await service.listForSite("https://example.com")).toEqual([alias]);
    });

    it("uses a trimmed note when given", async () => {
      api.create.mockResolvedValue({ id: "new", email: "x@fastmail.com" });
      await service.createForSite("https://example.com", "  Newsletter  ");
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Newsletter" }),
      );
    });

    it("refuses non-web pages without calling the API", async () => {
      await expect(service.createForSite("about:config")).rejects.toMatchObject({
        kind: "invalid",
      });
      expect(api.create).not.toHaveBeenCalled();
    });

    it("does not cache anything when creation fails", async () => {
      api.create.mockRejectedValue(new AppError("rateLimit", "slow down"));
      await expect(service.createForSite("https://example.com")).rejects.toMatchObject({
        kind: "rateLimit",
      });
      expect(await service.search("")).toEqual([]);
    });
  });

  describe("setState", () => {
    it("updates the cached alias", async () => {
      await store.replaceAll(SAMPLE_ALIASES, now);
      api.setState.mockResolvedValue();
      const updated = await service.setState("me-1", "disabled");
      expect(api.setState).toHaveBeenCalledWith("me-1", "disabled");
      expect(updated.state).toBe("disabled");
      expect((await store.get("me-1"))?.state).toBe("disabled");
    });

    it("resyncs when the alias is not cached", async () => {
      api.setState.mockResolvedValue();
      api.list.mockResolvedValue(SAMPLE_ALIASES);
      const updated = await service.setState("me-3", "enabled");
      expect(api.list).toHaveBeenCalledTimes(1);
      expect(updated.id).toBe("me-3");
    });
  });
});
