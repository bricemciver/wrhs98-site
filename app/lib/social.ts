/** Helpers for social/profile links stored as JSON arrays of URLs. */

export const MAX_LINKS = 5;
const MAX_URL_LENGTH = 300;

const PLATFORMS: { label: string; hosts: string[] }[] = [
  { label: "Facebook", hosts: ["facebook.com", "fb.com", "fb.me"] },
  { label: "Instagram", hosts: ["instagram.com"] },
  { label: "LinkedIn", hosts: ["linkedin.com"] },
  { label: "X", hosts: ["x.com", "twitter.com"] },
  { label: "Threads", hosts: ["threads.net", "threads.com"] },
  { label: "Bluesky", hosts: ["bsky.app"] },
  { label: "TikTok", hosts: ["tiktok.com"] },
  { label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
];

/** "Facebook", "LinkedIn", … or the bare hostname for anything else. */
export function linkLabel(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  } catch {
    return url;
  }
  const match = PLATFORMS.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
  return match ? match.label : host;
}

/** Normalizes user input ("facebook.com/jen" → "https://facebook.com/jen"); null if not a valid http(s) URL. */
export function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    const out = u.toString();
    return out.length <= MAX_URL_LENGTH ? out : null;
  } catch {
    return null;
  }
}

/** Validates a list of raw inputs. Returns the clean URLs, or the first input that isn't a valid link. */
export function cleanLinks(inputs: string[]): { links: string[] } | { invalid: string } {
  const links: string[] = [];
  for (const input of inputs) {
    if (!input.trim()) continue;
    const url = normalizeUrl(input);
    if (!url) return { invalid: input.trim().slice(0, 80) };
    if (!links.includes(url)) links.push(url);
  }
  return { links: links.slice(0, MAX_LINKS) };
}

/** Parses a stored JSON array, dropping anything that isn't a safe http(s) URL. */
export function parseLinks(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === "string" && normalizeUrl(v) === v);
  } catch {
    return [];
  }
}

export const serializeLinks = (links: string[]) => (links.length ? JSON.stringify(links) : null);
