// Keeps the addons.mozilla.org listing (text, icon, privacy policy, screenshots) in step with the repo.
import { createHmac, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "https://addons.mozilla.org/api/v5/addons/addon";

export interface AmoDeps {
  fetch: typeof fetch;
  apiKey: string;
  apiSecret: string;
  now?: () => number;
  randomId?: () => string;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 120_000;
// Edits share an hourly quota; waiting out a long throttle would only outlast the CI job.
const MAX_THROTTLE_WAIT_MS = 5 * 60_000;

export const LISTING_PARTS = ["details", "icon", "policy", "screenshots"] as const;
export type ListingPart = (typeof LISTING_PARTS)[number];

export function parseParts(args: string[]): Set<ListingPart> {
  if (args.length === 0) return new Set(LISTING_PARTS);
  for (const arg of args) {
    if (!(LISTING_PARTS as readonly string[]).includes(arg)) {
      throw new Error(`Unknown listing part "${arg}"; expected ${LISTING_PARTS.join(", ")}`);
    }
  }
  return new Set(args as ListingPart[]);
}

/** AMO throttles uploads and says how long to wait, in a header or the error body. */
export function throttleDelayMs(retryAfter: string | null, body: string): number {
  const seconds = Number(retryAfter ?? body.match(/available in (\d+) seconds?/)?.[1] ?? 60);
  return ((Number.isFinite(seconds) ? seconds : 60) + 1) * 1000;
}

export interface Screenshot {
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
}

export interface ListingContent {
  details: Record<string, unknown>;
  icon: Screenshot;
  policy: string;
  screenshots: Screenshot[];
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** AMO authenticates with a short-lived HS256 JWT signed by the API secret. */
export function createAmoJwt(
  apiKey: string,
  apiSecret: string,
  nowMs: number,
  jti: string,
): string {
  const iat = Math.floor(nowMs / 1000);
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const payload = base64UrlJson({ iss: apiKey, jti, iat, exp: iat + 60 });
  const signature = createHmac("sha256", apiSecret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

/** AMO shows the policy as plain text, so Markdown syntax is flattened. */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim();
}

export class AmoListing {
  private readonly deps: AmoDeps;
  private readonly addonId: string;
  private readonly now: () => number;
  private readonly randomId: () => string;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly log: (message: string) => void;

  constructor(deps: AmoDeps, addonId: string) {
    this.deps = deps;
    this.addonId = addonId;
    this.now = deps.now ?? Date.now;
    this.randomId = deps.randomId ?? randomUUID;
    this.sleep = deps.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms)));
    this.log = deps.log ?? console.log;
  }

  /** Listing fields from amo/metadata.json; the version block only applies to submissions. */
  async setDetails(details: Record<string, unknown>): Promise<void> {
    await this.request("", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(details),
    });
  }

  async setIcon(icon: Screenshot): Promise<void> {
    const form = new FormData();
    form.set("icon", new Blob([icon.bytes], { type: "image/png" }), icon.name);
    await this.request("", { method: "PATCH", body: form });
  }

  async setPrivacyPolicy(policy: string): Promise<void> {
    await this.request("eula_policy/", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ privacy_policy: { "en-US": policy } }),
    });
  }

  async previewCount(): Promise<number> {
    const response = await this.request("", { method: "GET" });
    const body = (await response.json()) as { previews?: unknown[] };
    return body.previews?.length ?? 0;
  }

  async uploadPreview(screenshot: Screenshot, position: number): Promise<void> {
    const form = new FormData();
    form.set("image", new Blob([screenshot.bytes], { type: "image/png" }), screenshot.name);
    form.set("position", String(position));
    await this.request("previews/", { method: "POST", body: form });
  }

  /**
   * Uploads run in order, so a listing with n screenshots already has the first n. Only the
   * rest are sent, which lets a run interrupted part way resume without duplicates.
   */
  async sync(content: ListingContent, parts: Set<ListingPart>): Promise<void> {
    if (parts.has("details")) {
      await this.setDetails(content.details);
      this.log("Listing text updated");
    }
    if (parts.has("icon")) {
      await this.setIcon(content.icon);
      this.log("Icon uploaded");
    }
    if (parts.has("policy")) {
      await this.setPrivacyPolicy(content.policy);
      this.log("Privacy policy updated");
    }
    if (parts.has("screenshots")) await this.syncScreenshots(content.screenshots);
  }

  private async syncScreenshots(screenshots: Screenshot[]): Promise<void> {
    const existing = await this.previewCount();
    this.log(`Listing has ${existing} of ${screenshots.length} screenshots`);
    for (const [position, screenshot] of screenshots.entries()) {
      if (position < existing) continue;
      await this.uploadPreview(screenshot, position);
      this.log(`Uploaded ${screenshot.name}`);
    }
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const url = `${API_BASE}/${encodeURIComponent(this.addonId)}/${path}`;
    for (let attempt = 1; ; attempt++) {
      const token = createAmoJwt(
        this.deps.apiKey,
        this.deps.apiSecret,
        this.now(),
        this.randomId(),
      );
      const response = await this.deps.fetch(url, {
        ...init,
        headers: { ...init.headers, Authorization: `JWT ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) return response;

      const body = await response.text();
      const method = init.method ?? "GET";
      if (response.status === 429 && attempt < MAX_ATTEMPTS) {
        const delay = throttleDelayMs(response.headers.get("Retry-After"), body);
        if (delay > MAX_THROTTLE_WAIT_MS) {
          const retryAt = new Date(this.now() + delay).toISOString().slice(11, 16);
          throw new Error(
            `AMO throttled ${method} ${path || "addon"} for ${Math.ceil(delay / 60_000)} minutes; run the Listing workflow again after ${retryAt} UTC`,
          );
        }
        this.log(`Throttled on ${method} ${path || "addon"}, retrying in ${delay / 1000}s`);
        await this.sleep(delay);
        continue;
      }
      throw new Error(`AMO ${method} ${path || "addon"} failed (${response.status}): ${body}`);
    }
  }
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8")) as {
    browser_specific_settings: { gecko: { id: string } };
  };
  const image = (path: string) => ({
    name: basename(path),
    bytes: new Uint8Array(readFileSync(path)),
  });
  const dir = "amo/screenshots";
  const details = JSON.parse(readFileSync("amo/metadata.json", "utf8")) as Record<string, unknown>;
  delete details["version"];
  const listing = new AmoListing(
    { fetch, apiKey: env("WEB_EXT_API_KEY"), apiSecret: env("WEB_EXT_API_SECRET") },
    manifest.browser_specific_settings.gecko.id,
  );
  const parts = parseParts(process.argv.slice(2));
  await listing.sync(
    {
      details,
      icon: image("amo/icon.png"),
      policy: markdownToPlainText(readFileSync("PRIVACY.md", "utf8")),
      screenshots: readdirSync(dir)
        .filter((name) => name.endsWith(".png"))
        .sort()
        .map((name) => image(join(dir, name))),
    },
    parts,
  );
  console.log(`Listing updated: ${[...parts].join(", ")}`);
}
