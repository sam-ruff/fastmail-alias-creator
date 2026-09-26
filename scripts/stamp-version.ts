// Writes a release version into package.json and the extension manifest.
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  // Firefox manifests only accept dotted numbers, so prerelease tags are rejected here.
  throw new Error(`Expected a plain x.y.z version, got ${version ?? "nothing"}`);
}

for (const file of ["package.json", "public/manifest.json"]) {
  const json = JSON.parse(readFileSync(file, "utf8")) as { version: string };
  json.version = version;
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}
console.log(`Stamped ${version}`);
