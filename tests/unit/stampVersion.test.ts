import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as prettier from "prettier";
import { describe, expect, it } from "vitest";
import { STAMPED_FILES, stampVersion } from "../../scripts/stamp-version";

const root = resolve(import.meta.dirname, "../..");

describe("stampVersion", () => {
  it.each(STAMPED_FILES)("keeps %s valid and Prettier formatted", async (file) => {
    const path = resolve(root, file);
    const stamped = stampVersion(readFileSync(path, "utf8"), "12.34.56");

    expect((JSON.parse(stamped) as { version: string }).version).toBe("12.34.56");
    const options = await prettier.resolveConfig(path);
    expect(await prettier.check(stamped, { ...options, filepath: path })).toBe(true);
  });

  it("changes only the top-level version", () => {
    const text = '{\n  "version": "0.1.0",\n  "deps": {\n    "version": "9.9.9"\n  }\n}\n';
    expect(stampVersion(text, "1.2.3")).toBe(
      '{\n  "version": "1.2.3",\n  "deps": {\n    "version": "9.9.9"\n  }\n}\n',
    );
  });

  it.each(["1.0.0-beta.1", "v1.0.0", ""])("rejects %j", (version) => {
    expect(() => stampVersion('{\n  "version": "0.1.0"\n}\n', version)).toThrow();
  });

  it("fails when there is no version to replace", () => {
    expect(() => stampVersion("{}\n", "1.0.0")).toThrow();
  });
});
