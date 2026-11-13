/**
 * Shared layout for every email the site sends: a complete HTML document with
 * a matching plain-text part, a clear header, and a footer saying who sent it,
 * why the reader got it, and how to reach a person. Mail that looks like a bare
 * fragment from an unexplained "noreply" sender is what spam filters (and
 * readers) distrust, so every message goes through here.
 */

import { COLORS, REUNION_NUMBER, SCHOOL } from "./school";

export interface EmailSite {
  /** The site's name, e.g. "Washburn Rural Class of 1998" (SITE_NAME in school.ts). */
  name: string;
  /** Public site address, e.g. https://reunion.example.org */
  url: string;
  /** The person running the site, named in the footer. Optional. */
  contactName?: string;
}

export interface EmailContent {
  subject: string;
  /** One line shown after the subject in most inboxes. */
  preview: string;
  /** Body as plain text: paragraphs separated by blank lines. */
  text: string;
  /** Body as HTML (already escaped). Wrapped in the layout. */
  html: string;
  /** Why this person got this email, e.g. "you asked to sign in". Finishes "You're getting this email because …". */
  reason: string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BLUE = COLORS.primary;

/** A button plus the raw link, for clients that block or mangle buttons. */
export function emailButton(href: string, label: string): string {
  const h = escapeHtml(href);
  return `<p style="margin:24px 0"><a href="${h}" style="display:inline-block;padding:12px 20px;background:${BLUE};color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(label)}</a></p>
<p style="font-size:14px;color:#555555">If the button doesn't work, copy this link into your browser:<br><a href="${h}" style="color:${BLUE};word-break:break-all">${h}</a></p>`;
}

function footerLines(site: EmailSite, reason: string): string[] {
  const host = site.url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const runBy = site.contactName ? `, run by ${site.contactName}, a classmate` : ", run by members of the class";
  return [
    `You're getting this email because ${reason}.`,
    `This email is from ${host}, a private website for ${SCHOOL.name}'s Class of ${SCHOOL.classYear} in ${SCHOOL.location}, ` +
      `and our ${REUNION_NUMBER}-year reunion${runBy}.`,
    "Questions? Just reply to this email and a person will read it.",
  ];
}

export function renderEmail(site: EmailSite, content: EmailContent): { subject: string; text: string; html: string } {
  const footer = footerLines(site, content.reason);
  const text = `${content.text.trim()}\n\n--\n${footer.join("\n\n")}\n`;
  const siteUrl = escapeHtml(site.url);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(content.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1f2937">
<tr><td style="padding:20px 28px;border-bottom:3px solid ${COLORS.accent}">
<a href="${siteUrl}" style="color:${BLUE};text-decoration:none;font-weight:700;font-size:18px">${escapeHtml(site.name)}</a>
</td></tr>
<tr><td style="padding:24px 28px">
${content.html.trim()}
</td></tr>
<tr><td style="padding:20px 28px;border-top:1px solid #e5e7eb;font-size:13px;line-height:1.5;color:#6b7280">
${footer.map((l) => `<p style="margin:0 0 10px">${escapeHtml(l)}</p>`).join("\n")}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
  return { subject: content.subject, text, html };
}
