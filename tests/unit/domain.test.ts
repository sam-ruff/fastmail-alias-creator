import { describe, expect, it } from "vitest";
import { belongsToSite, registrableDomainOf, siteFromUrl } from "../../src/domain";

describe("siteFromUrl", () => {
  it("returns origin, host and registrable domain for web pages", () => {
    expect(siteFromUrl("https://login.example.co.uk/path?q=1")).toEqual({
      origin: "https://login.example.co.uk",
      hostname: "login.example.co.uk",
      registrableDomain: "example.co.uk",
    });
  });

  it.each(["about:blank", "moz-extension://abc/popup.html", "file:///tmp/x", "not a url"])(
    "rejects %s",
    (url) => {
      expect(siteFromUrl(url)).toBeNull();
    },
  );

  it("falls back to the host for localhost and IPs", () => {
    expect(siteFromUrl("http://localhost:5173/")?.registrableDomain).toBe("localhost");
    expect(siteFromUrl("http://192.168.1.10/")?.registrableDomain).toBe("192.168.1.10");
  });

  it("treats private suffixes like github.io as separate sites", () => {
    expect(siteFromUrl("https://alice.github.io/")?.registrableDomain).toBe("alice.github.io");
  });
});

describe("registrableDomainOf", () => {
  it("accepts origins and bare hosts", () => {
    expect(registrableDomainOf("https://www.amazon.co.uk")).toBe("amazon.co.uk");
    expect(registrableDomainOf("news.ycombinator.com")).toBe("ycombinator.com");
  });

  it("returns null for empty values", () => {
    expect(registrableDomainOf("  ")).toBeNull();
  });
});

describe("belongsToSite", () => {
  const site = siteFromUrl("https://github.com/login");

  it("matches subdomains of the same registrable domain", () => {
    expect(site).not.toBeNull();
    if (!site) return;
    expect(belongsToSite("https://gist.github.com", site)).toBe(true);
    expect(belongsToSite("https://github.com.evil.io", site)).toBe(false);
    expect(belongsToSite("", site)).toBe(false);
  });
});
