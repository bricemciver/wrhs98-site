import { env } from "cloudflare:workers";
import { ownerEmails } from "./auth.server";
import { escapeHtml, sendEmail } from "./email.server";
import { COLORS, SITE_NAME } from "./school";

const DAY = 60 * 60 * 24;

interface Queue {
  key: "requests" | "suggestions" | "leads";
  path: string;
  one: string;
  many: string;
  /** Open items in this queue, as a FROM/WHERE clause over alias t. */
  open: string;
  table: string;
}

const QUEUES: Queue[] = [
  {
    key: "requests",
    path: "/admin/requests",
    one: "access request",
    many: "access requests",
    table: "access_requests",
    open: "access_requests t JOIN users u ON u.id = t.user_id WHERE t.status = 'open' AND u.role = 'pending'",
  },
  {
    key: "suggestions",
    path: "/admin/suggestions",
    one: "suggested classmate",
    many: "suggested classmates",
    table: "classmate_suggestions",
    open: "classmate_suggestions t WHERE t.status = 'open'",
  },
  { key: "leads", path: "/admin/leads", one: "Help Us Find tip", many: "Help Us Find tips", table: "leads", open: "leads t WHERE t.resolved = 0" },
];

export interface ReminderResult {
  sent: boolean;
  newlyOverdue: Record<Queue["key"], number>;
}

/**
 * Emails the site owners once about each review item (access request,
 * suggested classmate, tip) that has waited more than 24 hours. Only names
 * counts and links: details stay behind sign-in. Items are marked reminded
 * only after the email goes out, so a failed send is retried next run.
 */
export async function sendOverdueReminders(now = Math.floor(Date.now() / 1000)): Promise<ReminderResult> {
  const cutoff = now - DAY;
  const results = await env.DB.batch(
    QUEUES.flatMap((q) => [
      env.DB.prepare(`SELECT t.id, t.created_at FROM ${q.open} AND t.created_at < ? AND t.reminded_at IS NULL`).bind(cutoff),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM ${q.open} AND t.created_at < ? AND t.reminded_at IS NOT NULL`).bind(cutoff),
    ]),
  );
  const fresh = QUEUES.map((q, i) => ({
    q,
    rows: results[i * 2].results as { id: number; created_at: number }[],
    earlier: (results[i * 2 + 1].results[0] as { n: number }).n,
  }));
  const newlyOverdue = Object.fromEntries(fresh.map((f) => [f.q.key, f.rows.length])) as ReminderResult["newlyOverdue"];
  const total = fresh.reduce((n, f) => n + f.rows.length, 0);
  const recipients = ownerEmails();
  if (total === 0 || recipients.length === 0) return { sent: false, newlyOverdue };

  const base = (env.SITE_URL ?? "").replace(/\/+$/, "");
  const days = (t: number) => Math.max(1, Math.floor((now - t) / DAY));
  const lines = fresh
    .filter((f) => f.rows.length)
    .map((f) => {
      const n = f.rows.length;
      const oldest = days(Math.min(...f.rows.map((r) => r.created_at)));
      return {
        label: `${n} ${n === 1 ? f.q.one : f.q.many}${n > 1 || oldest > 1 ? ` (oldest waiting ${oldest} day${oldest === 1 ? "" : "s"})` : ""}`,
        url: `${base}${f.q.path}`,
      };
    });
  const earlier = fresh.reduce((n, f) => n + f.earlier, 0);
  const site = SITE_NAME;
  const subject = `${site}: ${total} ${total === 1 ? "item has" : "items have"} waited more than a day`;
  const earlierText =
    earlier > 0 ? `\n\n${earlier} older ${earlier === 1 ? "item is" : "items are"} also still open from earlier reminders.` : "";
  const note = "You get one reminder per item. Sign in to see the details; this email leaves them out on purpose.";
  const content = {
    subject,
    preview: lines.map((l) => l.label).join(", "),
    text: `Hi,\n\nThese have been waiting for an admin on the class website for more than a day:\n\n${lines.map((l) => `- ${l.label}: ${l.url}`).join("\n")}${earlierText}\n\n${note}`,
    html: `<p style="margin:0 0 16px">Hi,</p>
<p style="margin:0 0 12px">These have been waiting for an admin on the class website for more than a day:</p>
<ul style="margin:0 0 16px;padding-left:20px">${lines.map((l) => `<li style="margin-bottom:6px"><a href="${escapeHtml(l.url)}" style="color:${COLORS.primary}">${escapeHtml(l.label)}</a></li>`).join("")}</ul>
${earlier > 0 ? `<p style="margin:0 0 16px">${escapeHtml(earlierText.trim())}</p>` : ""}
<p style="margin:0;font-size:14px;color:#555555">${escapeHtml(note)}</p>`,
    reason: "you're listed as an owner of the class website, and owners get a daily note when access requests, suggestions, or tips need attention",
  };

  let delivered = false;
  for (const to of recipients) {
    try {
      await sendEmail(to, content);
      delivered = true;
    } catch (err) {
      console.error(`[reminders] failed to email ${to}:`, err);
    }
  }
  if (!delivered) throw new Error("Overdue reminder email could not be sent to any owner");

  await env.DB.batch(
    fresh
      .filter((f) => f.rows.length)
      .map((f) =>
        env.DB.prepare(`UPDATE ${f.q.table} SET reminded_at = ? WHERE id IN (SELECT value FROM json_each(?))`).bind(
          now,
          JSON.stringify(f.rows.map((r) => r.id)),
        ),
      ),
  );
  return { sent: true, newlyOverdue };
}
