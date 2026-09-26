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
  private readonly now: () => number;
  private readonly randomId: () => string;

  private readonly deps: AmoDeps;
  private readonly addonId: string;

  constructor(deps: AmoDeps, addonId: string) {
    this.deps = deps;
    this.addonId = addonId;
    this.now = deps.now ?? Date.now;
    this.randomId = deps.randomId ?? randomUUID;
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

  /** Screenshots are only uploaded to an empty listing so reruns never add duplicates. */
  async sync(content: ListingContent): Promise<void> {
    await this.setDetails(content.details);
    await this.setIcon(content.icon);
    await this.setPrivacyPolicy(content.policy);
    if ((await this.previewCount()) > 0) return;
    for (const [position, screenshot] of content.screenshots.entries()) {
      await this.uploadPreview(screenshot, position);
    }
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const token = createAmoJwt(this.deps.apiKey, this.deps.apiSecret, this.now(), this.randomId());
    const response = await this.deps.fetch(
      `${API_BASE}/${encodeURIComponent(this.addonId)}/${path}`,
      { ...init, headers: { ...init.headers, Authorization: `JWT ${token}` } },
    );
    if (!response.ok) {
      const method = init.method ?? "GET";
      throw new Error(
        `AMO ${method} ${path || "addon"} failed (${response.status}): ${await response.text()}`,
      );
    }
    return response;
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
  await listing.sync({
    details,
    icon: image("amo/icon.png"),
    policy: markdownToPlainText(readFileSync("PRIVACY.md", "utf8")),
    screenshots: readdirSync(dir)
      .filter((name) => name.endsWith(".png"))
      .sort()
      .map((name) => image(join(dir, name))),
  });
  console.log("Listing updated");
}
