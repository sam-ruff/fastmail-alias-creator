// Keeps the addons.mozilla.org listing's privacy policy and screenshots in step with the repo.
import { createHmac, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
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

  constructor(
    private readonly deps: AmoDeps,
    private readonly addonId: string,
  ) {
    this.now = deps.now ?? Date.now;
    this.randomId = deps.randomId ?? randomUUID;
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
  async sync(policy: string, screenshots: Screenshot[]): Promise<void> {
    await this.setPrivacyPolicy(policy);
    if ((await this.previewCount()) > 0) return;
    for (const [position, screenshot] of screenshots.entries()) {
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
  const dir = "amo/screenshots";
  const screenshots = readdirSync(dir)
    .filter((name) => name.endsWith(".png"))
    .sort()
    .map((name) => ({ name, bytes: new Uint8Array(readFileSync(join(dir, name))) }));
  const listing = new AmoListing(
    { fetch, apiKey: env("WEB_EXT_API_KEY"), apiSecret: env("WEB_EXT_API_SECRET") },
    manifest.browser_specific_settings.gecko.id,
  );
  await listing.sync(markdownToPlainText(readFileSync("PRIVACY.md", "utf8")), screenshots);
  console.log("Listing updated");
}
