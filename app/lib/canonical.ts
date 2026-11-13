/**
 * Sends visitors to the site's one official address (the SITE_URL secret). A request that arrives on any
 * other host, like an old domain or "www.", gets redirected to the same page there. Sign-in cookies only
 * work on the host that set them, so serving the site on two addresses would mean two separate sign-ins.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The URL to redirect to, or null to serve the request as is. */
export function canonicalUrl(requestUrl: string, siteUrl: string | undefined): string | null {
  if (!siteUrl) return null;
  let site: URL;
  try {
    site = new URL(siteUrl);
  } catch {
    return null;
  }
  const req = new URL(requestUrl);
  if (req.host === site.host || LOCAL_HOSTS.has(req.hostname)) return null;
  return `${site.origin}${req.pathname}${req.search}`;
}

/** 301 for page loads; 308 keeps the method and body for anything else, such as a form post. */
export function canonicalStatus(method: string): 301 | 308 {
  return method === "GET" || method === "HEAD" ? 301 : 308;
}
