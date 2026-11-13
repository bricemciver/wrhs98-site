import { clearCookie, readCookie, serializeCookie } from "./cookies.server";
import type { SessionUser } from "./types";

/** Cookie that makes an admin see the site with member permissions. */
export const PREVIEW_COOKIE = "wrhs_preview";
const PREVIEW_TTL = 60 * 60 * 8; // ends on its own after 8 hours

/** The user as pages should see them: an admin in preview mode is shown the site as a member. */
export function applyPreview(request: Request, user: SessionUser | null): SessionUser | null {
  if (user?.role !== "admin" || readCookie(request, PREVIEW_COOKIE) !== "member") return user;
  return { ...user, role: "member", previewing: true };
}

export const startPreviewCookie = (request: Request) => serializeCookie(request, PREVIEW_COOKIE, "member", { maxAge: PREVIEW_TTL });
export const endPreviewCookie = (request: Request) => clearCookie(request, PREVIEW_COOKIE);
