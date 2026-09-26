// Writes a release version into package.json and the extension manifest.
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  // Firefox manifests only accept dotted numbers, so prerelease tags are rejected here.
  throw new Error(`Expected a plain x.y.z version, got ${version ?? "nothing"}`);
}

// Only the top-level version line changes so the files keep their Prettier formatting.
const VERSION_LINE = /^( {2}"version": )"[^"]*"/m;

for (const file of ["package.json", "public/manifest.json"]) {
  const text = readFileSync(file, "utf8");
  if (!VERSION_LINE.test(text)) throw new Error(`No top-level version in ${file}`);
  writeFileSync(file, text.replace(VERSION_LINE, `$1"${version}"`));
}
console.log(`Stamped ${version}`);
