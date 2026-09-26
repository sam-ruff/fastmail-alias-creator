/**
 * Fastmail only accepts owned HTTPS domains, private schemes or loopback redirects, so the
 * default https://<hash>.extensions.allizom.org/ URL is converted to Firefox's loopback form.
 */
export function loopbackRedirectUri(extensionRedirectUrl: string): string {
  const { hostname } = new URL(extensionRedirectUrl);
  const hash = hostname.split(".")[0];
  if (!hash) throw new Error(`Unexpected redirect URL: ${extensionRedirectUrl}`);
  return `http://127.0.0.1/mozoauth2/${hash}`;
}
