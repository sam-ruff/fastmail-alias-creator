import { getDomain } from "tldts";

export interface Site {
  origin: string;
  hostname: string;
  registrableDomain: string;
}

export function siteFromUrl(url: string): Site | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (!parsed.hostname) return null;
  return {
    origin: parsed.origin,
    hostname: parsed.hostname,
    registrableDomain: registrableDomain(parsed.hostname),
  };
}

export function registrableDomain(hostname: string): string {
  const host = hostname.toLowerCase();
  return getDomain(host, { allowPrivateDomains: true }) ?? host;
}

/** forDomain values from other clients may be a bare host rather than an origin. */
export function registrableDomainOf(forDomain: string): string | null {
  const value = forDomain.trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const { hostname } = new URL(withScheme);
    return hostname ? registrableDomain(hostname) : null;
  } catch {
    return null;
  }
}

export function belongsToSite(forDomain: string, site: Site): boolean {
  return registrableDomainOf(forDomain) === site.registrableDomain;
}
