// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// CI runs these with plain `node`, which only strips types. Vitest compiles TypeScript fully,
// so without this check syntax such as parameter properties passes tests and fails in CI.
const dir = resolve(import.meta.dirname, "../../scripts");
const scripts = readdirSync(dir).filter((name) => name.endsWith(".ts"));

describe("release scripts", () => {
  it("finds the scripts", () => {
    expect(scripts).toContain("amo-listing.ts");
  });

  it.each(scripts)("%s only uses syntax Node can strip", (name) => {
    expect(() => stripTypeScriptTypes(readFileSync(join(dir, name), "utf8"))).not.toThrow();
  });

  it("rejects parameter properties", () => {
    const source = "class A { constructor(private readonly x: number) {} }";
    expect(() => stripTypeScriptTypes(source)).toThrow(
      expect.objectContaining({ code: "ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX" }),
    );
  });
});
