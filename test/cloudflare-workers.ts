/**
 * Stand-in for the "cloudflare:workers" module in unit tests. Only plain vars
 * are provided; anything touching DB or MEDIA belongs in a local smoke test.
 */
export const env: Record<string, unknown> = {
  ADMIN_EMAILS: "",
  SITE_URL: "http://localhost:5198",
};
