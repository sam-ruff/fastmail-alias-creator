import { describe, expect, it } from "vitest";
import {
  QUALITY_WORKFLOW,
  validatePlan,
  validateRun,
  validateVersion,
} from "../../scripts/release-ci";

const SHA = "a".repeat(40);
const REPO = "sam-ruff/fastmail-alias-creator";

function run(overrides: Record<string, unknown> = {}) {
  return {
    workflow_run: {
      conclusion: "success",
      event: "push",
      head_branch: "main",
      name: QUALITY_WORKFLOW,
      head_sha: SHA,
      head_repository: { full_name: REPO },
      ...overrides,
    },
  };
}

describe("release validation", () => {
  it("accepts a successful main push of the checked out revision", () => {
    expect(validateRun(run(), REPO, SHA)).toBe(SHA);
  });

  it.each([
    { conclusion: "failure" },
    { event: "pull_request" },
    { head_branch: "feature" },
    { name: "Something else" },
    { head_repository: { full_name: "someone/fork" } },
  ])("rejects run %o", (override) => {
    expect(() => validateRun(run(override), REPO, SHA)).toThrow();
  });

  it("rejects a run for a different revision than the checkout", () => {
    expect(() => validateRun(run(), REPO, "b".repeat(40))).toThrow();
  });

  it("returns the planned version or null", () => {
    expect(validatePlan({ schema: 1, source: SHA, version: "1.2.3" }, SHA)).toBe("1.2.3");
    expect(validatePlan({ schema: 1, source: SHA, version: null }, SHA)).toBeNull();
  });

  it("rejects plans for other sources or bad versions", () => {
    expect(() =>
      validatePlan({ schema: 1, source: "c".repeat(40), version: "1.0.0" }, SHA),
    ).toThrow();
    expect(() => validatePlan({ schema: 1, source: SHA, version: "v1" }, SHA)).toThrow();
    expect(() => validatePlan({ schema: 1, source: SHA }, SHA)).toThrow();
  });

  it("requires the released version to match the tested one", () => {
    expect(() => validateVersion("1.0.0", "1.0.0")).not.toThrow();
    expect(() => validateVersion("1.1.0", "1.0.0")).toThrow();
  });
});
