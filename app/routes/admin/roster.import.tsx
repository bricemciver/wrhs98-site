import { env } from "cloudflare:workers";
import { ArrowLeft } from "lucide-react";
import { data, Form, Link, useNavigation } from "react-router";
import { Alert, Button, Card, Field, PageHeader, Textarea } from "~/components/ui";
import { memberContext } from "~/context";
import { logActivity } from "~/lib/audit.server";
import { parseCsv } from "~/lib/csv";
import { cleanLinks, MAX_LINKS, normalizeUrl, parseLinks, serializeLinks } from "~/lib/social";
import type { Route } from "./+types/roster.import";
import { pageTitle, SCHOOL } from "~/lib/school";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("Import roster", "Admin") }];

const COLUMNS = ["first_name", "last_name", "maiden_name", "current_last_name", "nickname", "email", "phone", "city", "state", "notes", "links", "deceased"] as const;
const ALIASES: Record<string, (typeof COLUMNS)[number]> = {
  first: "first_name",
  firstname: "first_name",
  "first name": "first_name",
  last: "last_name",
  lastname: "last_name",
  "last name": "last_name",
  maiden: "maiden_name",
  "maiden name": "maiden_name",
  [`last name in ${SCHOOL.classYear}`]: "maiden_name",
  "current last name": "current_last_name",
  "married name": "current_last_name",
  "married last name": "current_last_name",
  nick: "nickname",
  "e-mail": "email",
  "email address": "email",
  telephone: "phone",
  "phone number": "phone",
  note: "notes",
  facebook: "links",
  social: "links",
  "social links": "links",
};
const MAX_ROWS = 2000;
const MODES = ["add", "add-update", "update"] as const;
type Mode = (typeof MODES)[number];

interface Existing {
  id: number;
  first_name: string;
  last_name: string;
  current_last_name: string | null;
  nickname: string | null;
  last_known_email: string | null;
  last_known_phone: string | null;
  last_known_city: string | null;
  last_known_state: string | null;
  admin_notes: string | null;
  found_links: string | null;
  is_deceased: number;
}

const blank = (v: string | null | undefined) => !v || !v.trim();

export async function action({ request, context }: Route.ActionArgs) {
  const me = context.get(memberContext);
  const form = await request.formData();
  const modeRaw = String(form.get("mode") ?? "add");
  const mode: Mode = (MODES as readonly string[]).includes(modeRaw) ? (modeRaw as Mode) : "add";
  let text = String(form.get("csv") ?? "");
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 2 * 1024 * 1024) return data({ error: "File is too large (2 MB max)." }, { status: 413 });
    text = await file.text();
  }
  const rows = parseCsv(text);
  if (rows.length < 2) return data({ error: "Add a header row and at least one classmate." }, { status: 400 });
  if (rows.length > MAX_ROWS + 1) return data({ error: `Import at most ${MAX_ROWS} rows at a time.` }, { status: 400 });

  type Column = (typeof COLUMNS)[number];
  const header: (Column | null)[] = rows[0].map((h) => {
    const k = h.trim().toLowerCase();
    const snake = k.replace(/ /g, "_");
    return (COLUMNS as readonly string[]).includes(snake) ? (snake as Column) : (ALIASES[k] ?? null);
  });
  if (!header.includes("first_name") || !header.includes("last_name")) {
    return data({ error: "The header row needs first_name and last_name columns." }, { status: 400 });
  }

  const existing = await env.DB.prepare(
    `SELECT id, first_name, last_name, current_last_name, nickname, last_known_email, last_known_phone, last_known_city,
            last_known_state, admin_notes, found_links, is_deceased FROM classmates`,
  ).all<Existing>();
  const byKey = new Map(existing.results.map((r) => [`${r.first_name.toLowerCase()}|${r.last_name.toLowerCase()}`, r]));
  // Emails already on the roster, so an update never gives two classmates the same sign-in match.
  const emailOwner = new Map<string, number>();
  for (const r of existing.results) if (r.last_known_email) emailOwner.set(r.last_known_email.toLowerCase(), r.id);
  const seen = new Set<string>();
  const stmts: D1PreparedStatement[] = [];
  const updates = new Map<number, Existing>();
  const skipped: string[] = [];
  let unchanged = 0;

  for (const raw of rows.slice(1)) {
    const rec: Partial<Record<(typeof COLUMNS)[number], string>> = {};
    header.forEach((col, i) => {
      if (col) rec[col] = (raw[i] ?? "").trim();
    });
    const first = rec.first_name?.slice(0, 80);
    // Spreadsheets list names two ways. With a maiden_name column, last_name is
    // today's surname and maiden_name is the 1998 one; otherwise last_name is the
    // 1998 surname and current_last_name (if any) is today's.
    let last = rec.last_name?.slice(0, 80);
    let current = rec.current_last_name?.slice(0, 80) || null;
    if (rec.maiden_name) {
      current = last && last.toLowerCase() !== rec.maiden_name.toLowerCase() ? last : null;
      last = rec.maiden_name.slice(0, 80);
    }
    if (!first || !last) {
      skipped.push(`Row missing a name: ${raw.join(", ").slice(0, 60)}`);
      continue;
    }
    const key = `${first.toLowerCase()}|${last.toLowerCase()}`;
    const emailRaw = rec.email?.trim().toLowerCase().slice(0, 254);
    const email = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : null;
    const deceased = /^(1|y|yes|true|x)$/i.test(rec.deceased ?? "") ? 1 : 0;
    // Admin-only "found online" links; invalid entries are dropped rather than failing the row.
    const found = cleanLinks((rec.links ?? "").split(/[\s;|]+/).filter((l) => normalizeUrl(l) !== null));
    const foundLinks = "links" in found ? found.links : [];
    const notes = rec.notes?.trim().slice(0, 4000) || null;

    const match = byKey.get(key);
    if (match) {
      if (mode === "add") {
        skipped.push(`${first} ${last} (already on the roster)`);
        continue;
      }
      // Fill in blanks only; never overwrite what an admin or the import already set.
      const cur = updates.get(match.id) ?? { ...match };
      const next = { ...cur };
      const fill = (field: "current_last_name" | "nickname" | "last_known_phone" | "last_known_city" | "last_known_state", v: string | null | undefined, max: number) => {
        if (blank(next[field]) && v && v.trim()) next[field] = v.trim().slice(0, max);
      };
      if (current && current.toLowerCase() !== match.last_name.toLowerCase()) fill("current_last_name", current, 80);
      fill("nickname", rec.nickname, 80);
      fill("last_known_phone", rec.phone, 40);
      fill("last_known_city", rec.city, 80);
      fill("last_known_state", rec.state, 40);
      if (email && blank(next.last_known_email)) {
        const owner = emailOwner.get(email);
        if (owner !== undefined && owner !== match.id) {
          skipped.push(`${first} ${last}: email ${email} is already on another classmate, so it wasn't added`);
        } else {
          next.last_known_email = email;
          emailOwner.set(email, match.id);
        }
      }
      if (notes && !(next.admin_notes ?? "").includes(notes)) {
        next.admin_notes = (next.admin_notes ? `${next.admin_notes}\n${notes}` : notes).slice(0, 4000);
      }
      if (foundLinks.length) {
        const merged = [...parseLinks(next.found_links)];
        for (const l of foundLinks) if (!merged.includes(l)) merged.push(l);
        next.found_links = serializeLinks(merged.slice(0, MAX_LINKS));
      }
      if (deceased) next.is_deceased = 1;
      updates.set(match.id, next);
      continue;
    }

    if (mode === "update") {
      skipped.push(`${first} ${last} (not on the roster, so not added)`);
      continue;
    }
    if (seen.has(key)) {
      skipped.push(`${first} ${last} (listed twice in this file)`);
      continue;
    }
    seen.add(key);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO classmates (first_name, last_name, current_last_name, nickname, last_known_email, last_known_phone,
                                 last_known_city, last_known_state, admin_notes, found_links, is_deceased)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        first,
        last,
        current,
        rec.nickname?.slice(0, 80) || null,
        email,
        rec.phone?.slice(0, 40) || null,
        rec.city?.slice(0, 80) || null,
        rec.state?.slice(0, 40) || null,
        notes,
        foundLinks.length ? serializeLinks(foundLinks) : null,
        deceased,
      ),
    );
  }
  const imported = stmts.length;
  let updated = 0;
  const FIELDS = [
    "current_last_name",
    "nickname",
    "last_known_email",
    "last_known_phone",
    "last_known_city",
    "last_known_state",
    "admin_notes",
    "found_links",
    "is_deceased",
  ] as const;
  for (const next of updates.values()) {
    const before = byKey.get(`${next.first_name.toLowerCase()}|${next.last_name.toLowerCase()}`);
    if (before && FIELDS.every((f) => before[f] === next[f])) {
      unchanged++;
      continue;
    }
    updated++;
    stmts.push(
      env.DB.prepare(
        `UPDATE classmates SET current_last_name = ?, nickname = ?, last_known_email = ?, last_known_phone = ?, last_known_city = ?,
                last_known_state = ?, admin_notes = ?, found_links = ?, is_deceased = ?, updated_at = unixepoch()
          WHERE id = ?`,
      ).bind(...FIELDS.map((f) => next[f]), next.id),
    );
  }
  // D1 batches are transactional; chunk to stay well under statement limits.
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  if (imported || updated) {
    const sourceName = file instanceof File && file.size > 0 ? ` from ${file.name.slice(0, 120)}` : "";
    await logActivity(
      me,
      "roster.import",
      `Imported a roster CSV${sourceName}: ${imported} added, ${updated} updated, ${unchanged} unchanged, ${skipped.length} skipped or flagged`,
    );
  }
  return { imported, updated, unchanged, skipped };
}

export default function RosterImport({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state === "submitting";
  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <Link to="/admin/roster" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Roster
      </Link>
      <PageHeader
        title="Import roster"
        description={`Upload a CSV exported from a spreadsheet, or paste one below. Rows are matched to the roster by first name and ${SCHOOL.classYear} last name.`}
      />

      {actionData && "error" in actionData && <Alert tone="error">{actionData.error}</Alert>}
      {actionData && "imported" in actionData && (
        <Alert tone="success">
          Added {actionData.imported} new classmate{actionData.imported === 1 ? "" : "s"}
          {actionData.updated + actionData.unchanged > 0 &&
            `, filled in details for ${actionData.updated}${actionData.unchanged ? ` (${actionData.unchanged} had nothing new)` : ""}`}
          .
          {actionData.skipped.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer">Skipped {actionData.skipped.length}</summary>
              <ul className="list-disc pl-5 mt-1">
                {actionData.skipped.slice(0, 200).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </details>
          )}
        </Alert>
      )}

      <Card className="p-6">
        <Form method="post" encType="multipart/form-data" className="flex flex-col gap-4">
          <Field label="CSV file" htmlFor="file">
            <input id="file" name="file" type="file" accept=".csv,text/csv" className="text-sm" />
          </Field>
          <Field
            label="…or paste CSV"
            htmlFor="csv"
            hint={
              <>
                Columns: <code>{COLUMNS.join(", ")}</code>. Only <code>first_name</code> and <code>last_name</code> are
                required. Put each person&apos;s {SCHOOL.classYear} surname in <code>last_name</code> and today&apos;s in{" "}
                <code>current_last_name</code>, or, if your sheet lists current names, use <code>last_name</code> for today&apos;s and{" "}
                <code>maiden_name</code> for the {SCHOOL.classYear} one. <code>links</code> takes social profile URLs (separate several with spaces or
                semicolons); they&apos;re only visible to admins. Use <code>yes</code> in <code>deceased</code> for classmates who have passed.
              </>
            }
          >
            <Textarea
              id="csv"
              name="csv"
              rows={10}
              className="font-mono text-sm"
              placeholder={"first_name,last_name,current_last_name,nickname,email,city,state,deceased\nJennifer,Smith,Jones,Jen,jen@example.com,Austin,TX,"}
            />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium mb-1">Classmates already on the roster</legend>
            {(
              [
                ["add", "Skip them. Only add new classmates."],
                ["add-update", "Add new classmates, and fill in blank details for existing ones."],
                ["update", "Only fill in blank details for existing classmates. Don't add anyone new."],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-start gap-2 text-sm">
                <input type="radio" name="mode" value={value} defaultChecked={value === "add"} className="mt-1 size-4 accent-[var(--primary)]" />
                <span>{label}</span>
              </label>
            ))}
            <p className="text-xs text-muted-foreground">
              Filling in never overwrites anything already entered. Notes are added below existing notes, and links are added to
              the existing ones. An email already used by another classmate is skipped.
            </p>
          </fieldset>
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? "Importing…" : "Import"}
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}
