import { env } from "cloudflare:workers";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import { z } from "zod";
import { Alert, Avatar, Button, Card, Checkbox, Field, Input, PageHeader, Textarea } from "~/components/ui";
import { memberContext } from "~/context";
import { activityStmt, logActivity } from "~/lib/audit.server";
import { classmateInitials, classmateName, formatDate } from "~/lib/format";
import { bool, notFound, str } from "~/lib/http.server";
import { decodeImage, resizeBitmap } from "~/lib/image-client";
import { cleanLinks, parseLinks, serializeLinks } from "~/lib/social";
import type { Route } from "./+types/roster.edit";
import { SCHOOL } from "~/lib/school";

interface ClassmateRow {
  id: number;
  first_name: string;
  last_name: string;
  nickname: string | null;
  current_last_name: string | null;
  last_known_email: string | null;
  last_known_phone: string | null;
  last_known_city: string | null;
  last_known_state: string | null;
  admin_notes: string | null;
  found_links: string | null;
  is_deceased: number;
  deceased_on: string | null;
  memoriam_text: string | null;
  memoriam_photo_key: string | null;
}

export function meta({ loaderData: data }: Route.MetaArgs) {
  return [{ title: data?.classmate ? `${classmateName(data.classmate)} · Roster` : "Add classmate · Roster" }];
}

export async function loader({ params }: Route.LoaderArgs) {
  if (!params.id) return { classmate: null, linkedUser: null, leads: [] };
  const id = Number(params.id);
  const [c, u, l] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM classmates WHERE id = ?").bind(id),
    env.DB.prepare("SELECT id, email, role FROM users WHERE classmate_id = ?").bind(id),
    env.DB.prepare(
      `SELECT l.id, l.info, l.resolved, l.created_at, u.name AS submitted_by
         FROM leads l LEFT JOIN users u ON u.id = l.submitted_by WHERE l.classmate_id = ? ORDER BY l.created_at DESC`,
    ).bind(id),
  ]);
  const classmate = c.results[0] as ClassmateRow | undefined;
  if (!classmate) notFound();
  return {
    classmate,
    linkedUser: (u.results[0] as { id: number; email: string; role: string } | undefined) ?? null,
    leads: l.results as { id: number; info: string; resolved: number; created_at: number; submitted_by: string | null }[],
  };
}

const schema = z.object({
  first_name: z.string().min(1, "First name is required.").max(80),
  last_name: z.string().min(1, "Last name is required.").max(80),
  nickname: z.string().max(80),
  current_last_name: z.string().max(80),
  last_known_email: z.union([z.literal(""), z.email("Enter a valid email.").max(254)]),
  last_known_phone: z.string().max(40),
  last_known_city: z.string().max(80),
  last_known_state: z.string().max(40),
  admin_notes: z.string().max(4000),
  deceased_on: z.string().max(60),
  memoriam_text: z.string().max(4000),
});

/** Column → label for the activity log; it records which fields changed, never their values. */
const FIELD_LABELS = {
  first_name: "first name",
  last_name: "last name in school",
  nickname: "nickname",
  current_last_name: "current last name",
  last_known_email: "email",
  last_known_phone: "phone",
  last_known_city: "city",
  last_known_state: "state",
  admin_notes: "admin notes",
  found_links: "found links",
  is_deceased: "in memoriam status",
  deceased_on: "date of passing",
  memoriam_text: "memorial text",
} as const;

export async function action({ request, params, context }: Route.ActionArgs) {
  const me = context.get(memberContext);
  const form = await request.formData();
  const intent = str(form, "intent");
  const before = params.id
    ? await env.DB.prepare("SELECT * FROM classmates WHERE id = ?").bind(Number(params.id)).first<Record<string, unknown>>()
    : null;
  if (params.id && !before) return data({ error: "That roster entry no longer exists." }, { status: 404 });
  const beforeName = before ? classmateName(before as unknown as ClassmateRow) : "";

  if (intent === "delete" && params.id) {
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET classmate_id = NULL WHERE classmate_id = ?").bind(Number(params.id)),
      env.DB.prepare("DELETE FROM classmates WHERE id = ?").bind(Number(params.id)),
      activityStmt(me, "roster.delete", `Deleted ${beforeName} from the roster`, { type: "classmate", id: Number(params.id) }),
    ]);
    throw redirect("/admin/roster");
  }

  const parsed = schema.safeParse({
    first_name: str(form, "first_name"),
    last_name: str(form, "last_name"),
    nickname: str(form, "nickname"),
    current_last_name: str(form, "current_last_name"),
    last_known_email: str(form, "last_known_email").toLowerCase(),
    last_known_phone: str(form, "last_known_phone"),
    last_known_city: str(form, "last_known_city"),
    last_known_state: str(form, "last_known_state"),
    admin_notes: str(form, "admin_notes"),
    deceased_on: str(form, "deceased_on"),
    memoriam_text: str(form, "memoriam_text"),
  });
  if (!parsed.success) return data({ error: parsed.error.issues[0]?.message ?? "Please check the form." }, { status: 400 });
  const v = parsed.data;
  const found = cleanLinks(str(form, "found_links").split(/\s+/));
  if ("invalid" in found) return data({ error: `“${found.invalid}” doesn't look like a web address.` }, { status: 400 });
  const n = (s: string) => s || null;
  const values = [
    v.first_name,
    v.last_name,
    n(v.nickname),
    n(v.current_last_name),
    n(v.last_known_email),
    n(v.last_known_phone),
    n(v.last_known_city),
    n(v.last_known_state),
    n(v.admin_notes),
    serializeLinks(found.links),
    bool(form, "is_deceased"),
    n(v.deceased_on),
    n(v.memoriam_text),
  ];

  if (params.id && before) {
    const changed = (Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[]).filter(
      (k, i) => (before[k] ?? null) !== (values[i] ?? null),
    );
    const update = env.DB.prepare(
      `UPDATE classmates SET first_name = ?, last_name = ?, nickname = ?, current_last_name = ?, last_known_email = ?, last_known_phone = ?,
              last_known_city = ?, last_known_state = ?, admin_notes = ?, found_links = ?, is_deceased = ?, deceased_on = ?,
              memoriam_text = ?, updated_at = unixepoch()
        WHERE id = ?`,
    ).bind(...values, Number(params.id));
    const stmts = [update];
    const resolveLeads = form.get("resolve_leads") === "on";
    if (resolveLeads) stmts.push(env.DB.prepare("UPDATE leads SET resolved = 1 WHERE classmate_id = ? AND resolved = 0").bind(Number(params.id)));
    if (changed.length || resolveLeads) {
      const parts = [changed.length ? `changed ${changed.map((k) => FIELD_LABELS[k]).join(", ")}` : null, resolveLeads ? "resolved their tips" : null];
      stmts.push(
        activityStmt(me, "roster.update", `Updated ${beforeName}: ${parts.filter(Boolean).join("; ")}`, { type: "classmate", id: Number(params.id) }),
      );
    }
    await env.DB.batch(stmts);
    return { ok: true };
  }
  const row = await env.DB.prepare(
    `INSERT INTO classmates (first_name, last_name, nickname, current_last_name, last_known_email, last_known_phone,
                             last_known_city, last_known_state, admin_notes, found_links, is_deceased, deceased_on,
                             memoriam_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(...values)
    .first<{ id: number }>();
  await logActivity(me, "roster.create", `Added ${v.first_name} ${v.last_name} to the roster`, { type: "classmate", id: row!.id });
  throw redirect(`/admin/roster/${row!.id}`);
}

function MemorialPhoto({ classmateId, current, fallback }: { classmateId: number; current: string | null; fallback: string }) {
  const [src, setSrc] = useState(current);
  const [status, setStatus] = useState<string | null>(null);
  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("Uploading…");
    try {
      const bitmap = await decodeImage(file);
      const { blob } = await resizeBitmap(bitmap, 800);
      bitmap.close();
      const body = new FormData();
      body.set("target", "memoriam");
      body.set("classmateId", String(classmateId));
      body.set("photo", new File([blob], "memoriam.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/profile-photo", { method: "POST", body });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error);
      setSrc(json.url);
      setStatus("Photo saved.");
    } catch {
      setStatus("Couldn't use that photo. Try a JPEG or PNG.");
    }
  }
  return (
    <div className="flex items-center gap-4">
      <Avatar size="lg" src={src} initials={fallback} alt="Memorial photo" />
      <div className="flex flex-col gap-1">
        <label htmlFor="memoriam_photo" className="text-sm font-medium">
          Memorial photo
        </label>
        <input id="memoriam_photo" type="file" accept="image/*" onChange={onChange} className="text-sm" />
        {status && <p className="text-sm text-muted-foreground">{status}</p>}
      </div>
    </div>
  );
}

export default function RosterEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { classmate: c, linkedUser, leads } = loaderData;
  const busy = useNavigation().state === "submitting";
  const [deceased, setDeceased] = useState(c?.is_deceased === 1);
  const openLeads = leads.filter((l) => !l.resolved);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <Link to="/admin/roster" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Roster
      </Link>
      <PageHeader
        title={c ? classmateName(c) : "Add classmate"}
        description={
          linkedUser ? `Linked to the account ${linkedUser.email} (${linkedUser.role}).` : c ? "Hasn't joined the site yet." : undefined
        }
      />
      {actionData && "ok" in actionData && <Alert tone="success">Saved.</Alert>}
      {actionData && "error" in actionData && <Alert tone="error">{actionData.error}</Alert>}

      {leads.length > 0 && (
        <Card className="p-5 flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Tips from classmates</h2>
          <ul className="flex flex-col gap-3 text-sm">
            {leads.map((l) => (
              <li key={l.id} className={l.resolved ? "opacity-60" : ""}>
                <p className="whitespace-pre-line">{l.info}</p>
                <p className="text-muted-foreground">
                  {l.submitted_by ?? "A member"} · {formatDate(l.created_at)}
                  {l.resolved ? " · resolved" : ""}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-6">
        <Form method="post" className="flex flex-col gap-4" key={c?.id ?? "new"}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="First name" htmlFor="first_name">
              <Input id="first_name" name="first_name" required maxLength={80} defaultValue={c?.first_name ?? ""} />
            </Field>
            <Field label="Nickname" htmlFor="nickname">
              <Input id="nickname" name="nickname" maxLength={80} defaultValue={c?.nickname ?? ""} />
            </Field>
            <Field label={`Last name in ${SCHOOL.classYear} (maiden name)`} htmlFor="last_name" hint="As it appeared in the yearbook.">
              <Input id="last_name" name="last_name" required maxLength={80} defaultValue={c?.last_name ?? ""} />
            </Field>
            <Field
              label="Current last name"
              htmlFor="current_last_name"
              hint={linkedUser ? "Only if it changed. This classmate can also edit it from their profile." : "Only if it changed."}
            >
              <Input id="current_last_name" name="current_last_name" maxLength={80} defaultValue={c?.current_last_name ?? ""} />
            </Field>
          </div>

          <fieldset className="flex flex-col gap-4 rounded-md border p-4">
            <legend className="px-1 text-sm font-medium">Last known contact (admins only)</legend>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Email" htmlFor="last_known_email" hint="A verified sign-in with this email is approved automatically.">
                <Input id="last_known_email" name="last_known_email" type="email" maxLength={254} defaultValue={c?.last_known_email ?? ""} />
              </Field>
              <Field label="Phone" htmlFor="last_known_phone">
                <Input id="last_known_phone" name="last_known_phone" type="tel" maxLength={40} defaultValue={c?.last_known_phone ?? ""} />
              </Field>
              <Field label="City" htmlFor="last_known_city">
                <Input id="last_known_city" name="last_known_city" maxLength={80} defaultValue={c?.last_known_city ?? ""} />
              </Field>
              <Field label="State" htmlFor="last_known_state">
                <Input id="last_known_state" name="last_known_state" maxLength={40} defaultValue={c?.last_known_state ?? ""} />
              </Field>
            </div>
            <Field
              label="Found online"
              htmlFor="found_links"
              hint="Social profiles you've found for reaching out, one per line (up to 5). Only admins see these."
            >
              <Textarea
                id="found_links"
                name="found_links"
                rows={3}
                className="font-mono text-sm"
                placeholder="facebook.com/jennifer.smith.123"
                defaultValue={parseLinks(c?.found_links).join("\n")}
              />
            </Field>
            <Field label="Notes" htmlFor="admin_notes" hint="e.g. “Messaged on Facebook 11/10”.">
              <Textarea id="admin_notes" name="admin_notes" maxLength={4000} defaultValue={c?.admin_notes ?? ""} />
            </Field>
            {openLeads.length > 0 && <Checkbox name="resolve_leads" label={`Mark ${openLeads.length} tip(s) as resolved`} />}
          </fieldset>

          <fieldset className="flex flex-col gap-4 rounded-md border p-4">
            <legend className="px-1 text-sm font-medium">In memoriam</legend>
            <Checkbox name="is_deceased" checked={deceased} onChange={(e) => setDeceased(e.target.checked)} label="This classmate has passed away" />
            {deceased && (
              <>
                <Field label="When" htmlFor="deceased_on" hint="Free text, e.g. “2019” or “March 2021”.">
                  <Input id="deceased_on" name="deceased_on" maxLength={60} defaultValue={c?.deceased_on ?? ""} />
                </Field>
                <Field label="Remembrance" htmlFor="memoriam_text">
                  <Textarea id="memoriam_text" name="memoriam_text" maxLength={4000} rows={5} defaultValue={c?.memoriam_text ?? ""} />
                </Field>
                {c && (
                  <MemorialPhoto
                    classmateId={c.id}
                    current={c.memoriam_photo_key ? `/files/${c.memoriam_photo_key}` : null}
                    fallback={classmateInitials(c)}
                  />
                )}
              </>
            )}
          </fieldset>

          <div className="flex flex-wrap justify-between gap-2">
            <Button type="submit" name="intent" value="save" disabled={busy}>
              {busy ? "Saving…" : c ? "Save changes" : "Add classmate"}
            </Button>
            {c && (
              <Button
                type="submit"
                name="intent"
                value="delete"
                variant="destructive"
                formNoValidate
                onClick={(e) => !confirm(`Remove ${classmateName(c)} from the roster?`) && e.preventDefault()}
              >
                Remove from roster
              </Button>
            )}
          </div>
        </Form>
      </Card>
    </div>
  );
}
