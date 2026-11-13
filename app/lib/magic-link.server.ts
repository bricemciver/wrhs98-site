import { env } from "cloudflare:workers";
import { randomToken, sha256Hex } from "./crypto.server";
import { emailButton, escapeHtml, sendEmail } from "./email.server";
import { SITE_NAME } from "./school";

const TTL = 60 * 15; // 15 minutes
const MAX_PER_WINDOW = 3;

export type MagicLinkResult = "sent" | "rate-limited";

export async function sendMagicLink(request: Request, email: string, redirectTo: string): Promise<MagicLinkResult> {
  const now = Math.floor(Date.now() / 1000);
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM magic_links WHERE email = ? AND created_at > ?")
    .bind(email, now - TTL)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_PER_WINDOW) return "rate-limited";

  const token = randomToken();
  await env.DB.prepare("INSERT INTO magic_links (token_hash, email, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256Hex(token), email, now + TTL)
    .run();

  const url = new URL("/auth/verify", request.url);
  url.searchParams.set("token", token);
  if (redirectTo !== "/") url.searchParams.set("redirectTo", redirectTo);
  const link = url.toString();
  const site = SITE_NAME;

  const ignore =
    "If you didn't ask to sign in, you can safely ignore this email. No one can get into the site without this link, and it stops working on its own.";
  await sendEmail(email, {
    subject: `Your sign-in link for the ${site} website`,
    preview: "Tap the link to finish signing in. It works for the next 15 minutes.",
    text: `Hi,\n\nHere's the link you asked for to sign in to the ${site} website. It works once, for the next 15 minutes:\n\n${link}\n\n${ignore}`,
    html: `<p style="margin:0 0 16px">Hi,</p>
<p style="margin:0 0 16px">Here&#39;s the link you asked for to sign in to the ${escapeHtml(site)} website. It works once, for the next 15 minutes.</p>
${emailButton(link, "Sign in to the class site")}
<p style="margin:16px 0 0;font-size:14px;color:#555555">${escapeHtml(ignore)}</p>`,
    reason: `someone entered ${email} on the sign-in page of our class website`,
  });
  return "sent";
}

/** Marks a magic link as used and returns its email, or null if invalid/expired. */
export async function consumeMagicLink(token: string): Promise<string | null> {
  const row = await env.DB.prepare(
    `UPDATE magic_links SET used_at = unixepoch()
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > unixepoch()
      RETURNING email`,
  )
    .bind(await sha256Hex(token))
    .first<{ email: string }>();
  return row?.email ?? null;
}
