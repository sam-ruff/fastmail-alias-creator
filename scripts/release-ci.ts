// Validates the tested source and release plan before anything is published.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const QUALITY_WORKFLOW = "Quality and release artifacts";
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SOURCE = /^[0-9a-f]{40}$/;

export interface ReleasePlan {
  schema: 1;
  source: string;
  version: string | null;
}

interface WorkflowRunEvent {
  workflow_run?: {
    conclusion?: string;
    event?: string;
    head_branch?: string;
    name?: string;
    head_sha?: string;
    head_repository?: { full_name?: string };
  };
}

export function validateRun(event: WorkflowRunEvent, repository: string, checkout: string): string {
  const run = event.workflow_run ?? {};
  if (
    run.conclusion !== "success" ||
    run.event !== "push" ||
    run.head_branch !== "main" ||
    run.name !== QUALITY_WORKFLOW ||
    run.head_repository?.full_name !== repository
  ) {
    throw new Error("Only a successful main push from this repository can release");
  }
  const source = run.head_sha ?? "";
  if (!SOURCE.test(source) || source !== checkout) {
    throw new Error("The current main revision has not passed this quality run");
  }
  return source;
}

export function validatePlan(plan: unknown, source: string): string | null {
  const candidate = plan as Partial<ReleasePlan> | null;
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    candidate.schema !== 1 ||
    !("version" in candidate) ||
    candidate.source !== source ||
    !SOURCE.test(source)
  ) {
    throw new Error("Release plan does not match the tested source");
  }
  const { version } = candidate;
  if (version !== null && (typeof version !== "string" || !VERSION.test(version))) {
    throw new Error("Release plan contains an invalid version");
  }
  return version ?? null;
}

export function validateVersion(version: string, expected: string): void {
  if (!VERSION.test(version) || version !== expected) {
    throw new Error("The release version changed after the artifacts were tested");
  }
}

function output(name: string, value: string): void {
  const path = process.env.GITHUB_OUTPUT;
  if (!path) throw new Error("GITHUB_OUTPUT is not set");
  appendFileSync(path, `${name}=${value}\n`);
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function main(args: string[]): void {
  const [command, arg] = args;
  if (command === "source") {
    const event = JSON.parse(readFileSync(env("GITHUB_EVENT_PATH"), "utf8")) as WorkflowRunEvent;
    const checkout = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    output("source", validateRun(event, env("GITHUB_REPOSITORY"), checkout));
    return;
  }
  if (command === "plan" && arg) {
    const plan: unknown = JSON.parse(readFileSync(arg, "utf8"));
    output("version", validatePlan(plan, env("RELEASE_SOURCE")) ?? "");
    return;
  }
  if (command === "version" && arg) {
    validateVersion(arg, process.env.EXPECTED_VERSION ?? "");
    return;
  }
  throw new Error("Usage: release-ci.ts source | plan <path> | version <value>");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
