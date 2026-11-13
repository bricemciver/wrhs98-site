import { env } from "cloudflare:workers";
import { randomToken, sha256Hex } from "./crypto.server";
import { clearCookie, readCookie, serializeCookie } from "./cookies.server";
import type { Role, SessionUser } from "./types";

export const SESSION_COOKIE = "wrhs98_session";
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days
const RENEW_THRESHOLD = 60 * 60 * 24 * 15; // extend when under 15 days remain

const now = () => Math.floor(Date.now() / 1000);

/** Creates a session and returns the Set-Cookie header value. */
export async function createSession(request: Request, userId: number): Promise<string> {
  const token = randomToken();
  await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256Hex(token), userId, now() + SESSION_TTL)
    .run();
  return serializeCookie(request, SESSION_COOKIE, token, { maxAge: SESSION_TTL });
}

interface SessionRow {
  session_id: string;
  expires_at: number;
  id: number;
  email: string;
  name: string | null;
  role: Role;
  classmate_id: number | null;
}

export interface LoadedSession {
  user: SessionUser | null;
  /** Set-Cookie value when the session was renewed or found invalid. */
  setCookie: string | null;
}

export async function loadSession(request: Request): Promise<LoadedSession> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return { user: null, setCookie: null };
  const sessionId = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.id AS session_id, s.expires_at, u.id, u.email, u.name, u.role, u.classmate_id
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`,
  )
    .bind(sessionId)
    .first<SessionRow>();
  if (!row) return { user: null, setCookie: clearCookie(request, SESSION_COOKIE) };
  const t = now();
  if (row.expires_at <= t) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
    return { user: null, setCookie: clearCookie(request, SESSION_COOKIE) };
  }
  let setCookie: string | null = null;
  if (row.expires_at - t < RENEW_THRESHOLD) {
    // Sliding expiry: extend the row and reissue the cookie with a fresh Max-Age.
    await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?")
      .bind(t + SESSION_TTL, sessionId)
      .run();
    setCookie = serializeCookie(request, SESSION_COOKIE, token, { maxAge: SESSION_TTL });
  }
  return {
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      classmateId: row.classmate_id,
    },
    setCookie,
  };
}

export async function destroySession(request: Request): Promise<string> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256Hex(token)).run();
  }
  return clearCookie(request, SESSION_COOKIE);
}
