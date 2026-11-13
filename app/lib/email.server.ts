import { env } from "cloudflare:workers";
import { type EmailContent, renderEmail } from "./email-layout";
import { SITE_NAME } from "./school";

export { emailButton, escapeHtml } from "./email-layout";

/**
 * Sends an email through Resend, wrapped in the shared layout (header, footer
 * saying who sent it and why, plain-text part). Replies go to EMAIL_REPLY_TO
 * because the From address can't receive mail. Without RESEND_API_KEY (local
 * dev) the plain-text version is logged instead so sign-in links still work.
 */
export async function sendEmail(to: string, content: EmailContent): Promise<void> {
  const msg = renderEmail({ name: SITE_NAME, url: env.SITE_URL ?? "", contactName: env.SITE_CONTACT_NAME || undefined }, content);
  if (!env.RESEND_API_KEY) {
    console.log(`[email] To: ${to}\nReply-To: ${env.EMAIL_REPLY_TO}\nSubject: ${msg.subject}\n\n${msg.text}`);
    return;
  }
  if (!env.EMAIL_FROM) {
    throw new Error("Email send failed: EMAIL_FROM isn't set (pnpm wrangler secret put EMAIL_FROM)");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      reply_to: env.EMAIL_REPLY_TO ? [env.EMAIL_REPLY_TO] : undefined,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    }),
  });
  if (!res.ok) {
    throw new Error(`Email send failed: ${res.status} ${await res.text()}`);
  }
}
