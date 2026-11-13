import { env } from "cloudflare:workers";
import { lastNameFromAccount } from "./names";
import { createSession } from "./session.server";
import type { Role } from "./types";

export interface VerifiedIdentity {
  /** Lowercased email address. */
  email: string;
  /** True only when the identity provider asserts the address is verified. */
  emailVerified: boolean;
  name: string | null;
  /** Surname from the provider, when it sends one. */
  familyName?: string | null;
  /** Absent for magic-link sign-ins. */
  provider?: "google" | "microsoft";
  providerUserId?: string;
}

export class LoginError extends Error {
  constructor(public code: "email-conflict" | "denied") {
    super(code);
  }
}

/** Accounts named in ADMIN_EMAILS are site owners: always admin, and only they can grant or remove admin. */
function adminEmails(): Set<string> {
  return new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function ownerEmails(): string[] {
  return [...adminEmails()];
}

export function isOwnerEmail(email: string): boolean {
  return adminEmails().has(email.trim().toLowerCase());
}

interface UserRow {
  id: number;
  email: string;
  email_verified: number;
  name: string | null;
  role: Role;
  classmate_id: number | null;
}

/**
 * Finds or creates the user for a verified sign-in, applies roster matching
 * and admin bootstrap, and starts a session. Returns the Set-Cookie header
 * and the user's resulting role.
 */
export async function completeLogin(
  request: Request,
  identity: VerifiedIdentity,
): Promise<{ setCookie: string; role: Role }> {
  const db = env.DB;
  const email = identity.email.trim().toLowerCase();
  const method = identity.provider ?? "email";

  let user: UserRow | null = null;

  if (identity.provider && identity.providerUserId) {
    user = await db
      .prepare(
        `SELECT u.* FROM oauth_accounts o JOIN users u ON u.id = o.user_id
          WHERE o.provider = ? AND o.provider_user_id = ?`,
      )
      .bind(identity.provider, identity.providerUserId)
      .first<UserRow>();
  }

  if (!user) {
    const byEmail = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();
    if (byEmail) {
      // Only attach a new sign-in method to an existing account by email when
      // the provider vouches for the address; otherwise anyone could claim it.
      if (!identity.emailVerified) throw new LoginError("email-conflict");
      user = byEmail;
    } else {
      user = await db
        .prepare("INSERT INTO users (email, email_verified, name, signup_method) VALUES (?, ?, ?, ?) RETURNING *")
        .bind(email, identity.emailVerified ? 1 : 0, identity.name, method)
        .first<UserRow>();
    }
    if (identity.provider && identity.providerUserId && user) {
      await db
        .prepare("INSERT OR IGNORE INTO oauth_accounts (provider, provider_user_id, user_id) VALUES (?, ?, ?)")
        .bind(identity.provider, identity.providerUserId, user.id)
        .run();
    }
  }
  if (!user) throw new Error("Failed to load or create user");

  let role = user.role;
  let classmateId = user.classmate_id;
  const wasLinked = classmateId !== null;
  const verified = identity.emailVerified || user.email_verified === 1;

  // Owners are restored to admin before the denied check, so no one can lock them out.
  if (verified && adminEmails().has(email)) {
    role = "admin";
  } else if (role === "denied") {
    throw new LoginError("denied");
  }

  // Automatic roster match: a verified email equal to an admin-entered
  // last-known email for a classmate who has not yet been claimed.
  if (verified && classmateId === null) {
    const match = await db
      .prepare(
        `SELECT c.id FROM classmates c
          WHERE c.last_known_email = ? AND c.is_deceased = 0
            AND NOT EXISTS (SELECT 1 FROM users u WHERE u.classmate_id = c.id)
          LIMIT 1`,
      )
      .bind(email)
      .first<{ id: number }>();
    if (match) {
      classmateId = match.id;
      if (role === "pending") role = "member";
    }
  }

  await db
    .prepare(
      `UPDATE users SET role = ?, classmate_id = ?, email_verified = MAX(email_verified, ?),
              name = COALESCE(name, ?), family_name = COALESCE(?, family_name), last_login_at = unixepoch(),
              signup_method = COALESCE(signup_method, ?), last_login_method = ?
        WHERE id = ?`,
    )
    .bind(role, classmateId, identity.emailVerified ? 1 : 0, identity.name, identity.familyName?.trim() || null, method, method, user.id)
    .run();
  if (!wasLinked && classmateId !== null) await fillCurrentLastName(user.id, classmateId);

  if (role === "member" || role === "admin") {
    await db
      .prepare("UPDATE access_requests SET status = 'approved', reviewed_at = unixepoch() WHERE user_id = ? AND status = 'open'")
      .bind(user.id)
      .run();
  }

  return { setCookie: await createSession(request, user.id), role };
}

/**
 * When an account is first linked to a roster entry, fills in the classmate's
 * current last name from the account's name, so a married name shows in the
 * directory right away. Never overwrites a name that's already set; the
 * member can change it on their profile.
 */
export async function fillCurrentLastName(userId: number, classmateId: number, typedName?: string | null): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT u.name, u.family_name, c.first_name, c.last_name, c.current_last_name
       FROM users u, classmates c WHERE u.id = ? AND c.id = ?`,
  )
    .bind(userId, classmateId)
    .first<{ name: string | null; family_name: string | null; first_name: string; last_name: string; current_last_name: string | null }>();
  if (!row || row.current_last_name?.trim()) return;
  // A current name the person typed on their access request beats the account's.
  const typedLast = typedName?.trim().split(/\s+/).slice(1).pop() ?? null;
  const current = lastNameFromAccount(typedLast, null, row) ?? lastNameFromAccount(row.family_name, row.name, row);
  if (!current) return;
  await env.DB.prepare(
    `UPDATE classmates SET current_last_name = ?, updated_at = unixepoch()
      WHERE id = ? AND (current_last_name IS NULL OR trim(current_last_name) = '')`,
  )
    .bind(current.slice(0, 80), classmateId)
    .run();
}

/** Only allow same-site relative redirects after login. */
export function safeRedirect(to: string | null | undefined, fallback = "/"): string {
  if (!to || !to.startsWith("/") || to.startsWith("//") || to.startsWith("/\\")) return fallback;
  return to;
}
