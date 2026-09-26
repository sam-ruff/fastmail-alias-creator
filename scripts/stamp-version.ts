// Writes a release version into package.json and the extension manifest.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const STAMPED_FILES = ["package.json", "public/manifest.json"];

// Only the top-level version line changes so the files keep their Prettier formatting.
const VERSION_LINE = /^( {2}"version": )"[^"]*"/m;

export function stampVersion(text: string, version: string): string {
  // Firefox manifests only accept dotted numbers, so prerelease tags are rejected here.
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Expected a plain x.y.z version, got ${version || "nothing"}`);
  }
  if (!VERSION_LINE.test(text)) throw new Error("No top-level version field");
  return text.replace(VERSION_LINE, `$1"${version}"`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = process.argv[2] ?? "";
  for (const file of STAMPED_FILES) {
    writeFileSync(file, stampVersion(readFileSync(file, "utf8"), version));
  }
  console.log(`Stamped ${version}`);
}
