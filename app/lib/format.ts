/** Timezone used for displaying dates (server and client must agree to avoid hydration mismatches). */
export const SITE_TIMEZONE = "America/Chicago";

export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: SITE_TIMEZONE,
  });
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "post"
  );
}

export interface NameParts {
  first_name: string;
  last_name: string;
  nickname?: string | null;
  current_last_name?: string | null;
}

/** Current last name if it differs from the 1998 (maiden) name, else null. */
export function changedLastName(c: NameParts): string | null {
  const current = c.current_last_name?.trim();
  return current && current.toLowerCase() !== c.last_name.toLowerCase() ? current : null;
}

/** Reunion-style name: 'Jennifer "Jen" Jones (Smith)', with the 1998 surname in parentheses when it changed. */
export function classmateName(c: NameParts): string {
  const first = c.nickname ? `${c.first_name} "${c.nickname}"` : c.first_name;
  const current = changedLastName(c);
  return current ? `${first} ${current} (${c.last_name})` : `${first} ${c.last_name}`;
}

/** Initials from the name people know them by now. */
export function classmateInitials(c: NameParts): string {
  return initials(c.first_name, changedLastName(c) ?? c.last_name);
}

export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatShortDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: SITE_TIMEZONE });
}

export function formatDateTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: SITE_TIMEZONE,
  });
}
