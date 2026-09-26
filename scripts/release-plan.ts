// Works out the next version with a semantic-release dry run, without publishing anything.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ReleasePlan } from "./release-ci.ts";

const source = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[0-9a-f]{40}$/.test(source)) throw new Error("Expected a complete source revision");

const { default: release } = await import("semantic-release");
const result = await release({
  dryRun: true,
  ci: true,
  branches: ["main"],
  plugins: ["@semantic-release/commit-analyzer", "@semantic-release/release-notes-generator"],
});

const plan: ReleasePlan = {
  schema: 1,
  source,
  version: result ? result.nextRelease.version : null,
};
const path = resolve("artifacts/release-plan.json");
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, `${JSON.stringify(plan, null, 2)}\n`);
if (process.env.GITHUB_OUTPUT)
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${plan.version ?? ""}\n`);
console.log(plan.version ? `Release planned: ${plan.version}` : "No release required");
