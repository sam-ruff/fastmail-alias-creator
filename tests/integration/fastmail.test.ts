import { describe, expect, it } from "vitest";
import { FastmailJmapClient } from "../../src/api/jmap";
import type { TokenProvider } from "../../src/auth/tokenProvider";

// Talks to the real Fastmail API. Creates one alias and marks it deleted afterwards.
const token = process.env.FASTMAIL_API_TOKEN;

const staticToken: TokenProvider = {
  getAccessToken: async () => token ?? "",
  handleUnauthorised: async () => false,
};

describe.skipIf(!token)("Fastmail API", () => {
  const client = new FastmailJmapClient(staticToken, (input, init) => fetch(input, init));

  it("lists existing aliases", async () => {
    const aliases = await client.list();
    expect(Array.isArray(aliases)).toBe(true);
  });

  it("creates, disables and deletes an alias", async () => {
    const forDomain = "https://fastmail-alias-creator.invalid";
    const created = await client.create({ forDomain, description: "Integration test" });
    try {
      expect(created.email).toContain("@");
      await client.setState(created.id, "disabled");

      const listed = (await client.list()).find((alias) => alias.id === created.id);
      expect(listed).toMatchObject({ forDomain, state: "disabled" });
    } finally {
      await client.setState(created.id, "deleted");
    }
  });

  it("rejects an invalid token", async () => {
    const bad = new FastmailJmapClient(
      { getAccessToken: async () => "fmu1-invalid", handleUnauthorised: async () => false },
      (input, init) => fetch(input, init),
    );
    await expect(bad.list()).rejects.toMatchObject({ kind: "auth" });
  });
});
