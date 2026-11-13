/**
 * Picks a classmate's current last name from their sign-in account, or null
 * when the account doesn't give a usable one or it matches their 1998 name.
 * Prefers the provider's family name; falls back to a plain "First Last"
 * display name. Rejects anything that doesn't look like a surname (nicknames
 * with emoji, parentheses, "Mom of 3", …).
 */
export function lastNameFromAccount(
  familyName: string | null | undefined,
  displayName: string | null | undefined,
  classmate: { first_name: string; last_name: string },
): string | null {
  let candidate = familyName?.trim() || null;
  if (!candidate && displayName) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length === 2) candidate = parts[1];
  }
  if (!candidate) return null;
  candidate = candidate.replace(/\s+/g, " ");
  if (!/^\p{L}[\p{L}'’ .-]{0,59}$/u.test(candidate)) return null;

  // "Pleviak Carr" for a classmate whose 1998 name was Pleviak → "Carr".
  const maiden = classmate.last_name.toLowerCase();
  const words = candidate.split(" ").filter((w) => w.toLowerCase() !== maiden);
  candidate = words.join(" ");
  if (!candidate || candidate.length < 2) return null;
  const lc = candidate.toLowerCase();
  if (lc === maiden || lc === classmate.first_name.toLowerCase()) return null;
  return candidate;
}
