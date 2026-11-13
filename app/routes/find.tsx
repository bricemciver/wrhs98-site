import { env } from "cloudflare:workers";
import { useEffect, useRef } from "react";
import { data, useFetcher } from "react-router";
import { UserPlus } from "lucide-react";
import { Alert, Button, Card, EmptyState, Field, Input, PageHeader, Select, Textarea } from "~/components/ui";
import { memberContext } from "~/context";
import { classmateName } from "~/lib/format";
import { optStr, str } from "~/lib/http.server";
import { CONNECTIONS, DAILY_SUGGESTION_LIMIT, isConnection } from "~/lib/suggestions";
import type { Route } from "./+types/find";
import { pageTitle, SCHOOL } from "~/lib/school";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("Help Us Find") }];

interface Row {
  id: number;
  first_name: string;
  last_name: string;
  nickname: string | null;
  current_last_name: string | null;
  tips: number;
}

// "Missing" = not deceased, not joined, and no admin-entered email or phone.
export async function loader() {
  // Living classmates only; In Memoriam entries aren't anyone to find.
  const progress = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(EXISTS (SELECT 1 FROM users u WHERE u.classmate_id = c.id AND u.role IN ('member', 'admin'))) AS joined,
            SUM(EXISTS (SELECT 1 FROM users u WHERE u.classmate_id = c.id)
                OR c.last_known_email IS NOT NULL OR c.last_known_phone IS NOT NULL) AS found
       FROM classmates c WHERE c.is_deceased = 0`,
  ).first<{ total: number; joined: number | null; found: number | null }>();
  const rows = await env.DB.prepare(
    `SELECT c.id, c.first_name, c.last_name, c.nickname, c.current_last_name,
            (SELECT COUNT(*) FROM leads l WHERE l.classmate_id = c.id) AS tips
       FROM classmates c
      WHERE c.is_deceased = 0 AND c.last_known_email IS NULL AND c.last_known_phone IS NULL
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.classmate_id = c.id)
      ORDER BY c.last_name COLLATE NOCASE, c.first_name COLLATE NOCASE`,
  ).all<Row>();
  return {
    missing: rows.results.map((r) => ({ id: r.id, name: classmateName(r), tips: r.tips })),
    progress: { total: progress?.total ?? 0, joined: progress?.joined ?? 0, found: progress?.found ?? 0 },
  };
}

async function suggest(form: FormData, userId: number) {
  const first = str(form, "first_name");
  const last = str(form, "last_name");
  const current = optStr(form, "current_last_name");
  const connection = str(form, "connection");
  const details = optStr(form, "details");
  const contact = optStr(form, "contact");
  const fail = (error: string, status = 400) => data({ suggestError: error }, { status });

  if (!first || !last) return fail("Please add their first name and last name in school.");
  if (first.length > 80 || last.length > 80 || (current?.length ?? 0) > 80) return fail("Names must be under 80 characters.");
  if (!isConnection(connection)) return fail("Please choose how they're connected to the class.");
  if ((details?.length ?? 0) > 2000 || (contact?.length ?? 0) > 500) return fail("Please shorten your note.");

  const [recent, onRoster, pending] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n FROM classmate_suggestions WHERE submitted_by = ? AND created_at > unixepoch() - 86400").bind(userId),
    env.DB.prepare(
      `SELECT 1 FROM classmates WHERE lower(first_name) = lower(?1) AND (lower(last_name) = lower(?2) OR lower(current_last_name) = lower(?2))
          OR (?3 IS NOT NULL AND lower(first_name) = lower(?1) AND lower(current_last_name) = lower(?3))`,
    ).bind(first, last, current),
    env.DB.prepare(
      "SELECT 1 FROM classmate_suggestions WHERE status = 'open' AND lower(first_name) = lower(?) AND lower(last_name) = lower(?)",
    ).bind(first, last),
  ]);
  if (((recent.results[0] as { n: number } | undefined)?.n ?? 0) >= DAILY_SUGGESTION_LIMIT) {
    return fail("You've sent a lot of suggestions today. Thank you! Please try again tomorrow.", 429);
  }
  if (onRoster.results.length) return fail(`${first} ${last} is already on the roster. Look them up in the directory.`, 409);
  if (pending.results.length) return fail(`Someone already suggested ${first} ${last}. The admins will review it soon.`, 409);

  await env.DB.prepare(
    `INSERT INTO classmate_suggestions (submitted_by, first_name, last_name, current_last_name, connection, details, contact)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(userId, first, last, current, connection, details, contact)
    .run();
  return { suggested: `${first} ${last}` };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(memberContext);
  const form = await request.formData();
  if (str(form, "intent") === "suggest") return suggest(form, user.id);
  const classmateId = Number(form.get("classmateId"));
  const info = str(form, "info");
  if (!Number.isInteger(classmateId) || !info) return data({ error: "Please add some details.", classmateId }, { status: 400 });
  if (info.length > 2000) return data({ error: "Please keep tips under 2,000 characters.", classmateId }, { status: 400 });
  const exists = await env.DB.prepare("SELECT 1 FROM classmates WHERE id = ?").bind(classmateId).first();
  if (!exists) return data({ error: "Classmate not found.", classmateId }, { status: 404 });
  await env.DB.prepare("INSERT INTO leads (classmate_id, submitted_by, info) VALUES (?, ?, ?)")
    .bind(classmateId, user.id, info)
    .run();
  return { ok: true, classmateId };
}

function TipForm({ classmateId, name }: { classmateId: number; name: string }) {
  const fetcher = useFetcher<typeof action>();
  const formRef = useRef<HTMLFormElement>(null);
  const sent = fetcher.data && "ok" in fetcher.data;
  useEffect(() => {
    if (sent) formRef.current?.reset();
  }, [sent]);
  const id = `tip-${classmateId}`;
  return (
    <fetcher.Form method="post" ref={formRef} className="flex flex-col gap-2">
      <input type="hidden" name="classmateId" value={classmateId} />
      <label htmlFor={id} className="sr-only">
        What do you know about {name}?
      </label>
      <Textarea id={id} name="info" required maxLength={2000} rows={3} placeholder="Where they live now, a married name, a social media profile, a mutual friend…" />
      {fetcher.data && "error" in fetcher.data && <Alert tone="error">{fetcher.data.error}</Alert>}
      {sent && <Alert tone="success">Thanks! The admins will follow up.</Alert>}
      <div>
        <Button type="submit" size="sm" variant="secondary" disabled={fetcher.state !== "idle"}>
          Send tip
        </Button>
      </div>
    </fetcher.Form>
  );
}

function Progress({ total, joined, found }: { total: number; joined: number; found: number }) {
  if (!total) return null;
  const pct = (n: number) => (n / total) * 100;
  const contactOnly = Math.max(found - joined, 0);
  const missing = Math.max(total - found, 0);
  return (
    <Card className="p-5 sm:p-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">
          {found} of {total} classmates found
        </h2>
        <span className="text-sm text-muted-foreground tabular-nums">{Math.round(pct(found))}%</span>
      </div>
      <div
        role="img"
        aria-label={`${joined} joined the site, ${contactOnly} more we can reach, ${missing} still missing`}
        className="flex h-4 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="bg-primary" style={{ width: `${pct(joined)}%` }} />
        <div className="bg-primary/40" style={{ width: `${pct(contactOnly)}%` }} />
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <li className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-primary" aria-hidden="true" />
          {joined} joined the site
        </li>
        <li className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-primary/40" aria-hidden="true" />
          {contactOnly} more we can reach
        </li>
        <li className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-muted border" aria-hidden="true" />
          {missing} still missing
        </li>
      </ul>
    </Card>
  );
}

function SuggestForm() {
  const fetcher = useFetcher<typeof action>();
  const formRef = useRef<HTMLFormElement>(null);
  const sent = fetcher.data && "suggested" in fetcher.data ? fetcher.data.suggested : null;
  const error = fetcher.data && "suggestError" in fetcher.data ? fetcher.data.suggestError : null;
  useEffect(() => {
    if (sent) formRef.current?.reset();
  }, [sent]);
  return (
    <Card className="p-5 sm:p-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <UserPlus className="size-5 text-primary" aria-hidden="true" />
          Someone missing from the class?
        </h2>
        <p className="text-muted-foreground">
          Our roster started from the {SCHOOL.classYear} graduation list, so it misses people who graduated early or late, or who spent most of
          high school with us and finished somewhere else. Tell us who we forgot and an admin will add them.
        </p>
      </div>
      <fetcher.Form method="post" ref={formRef} className="flex flex-col gap-4">
        <input type="hidden" name="intent" value="suggest" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="First name" htmlFor="s-first">
            <Input id="s-first" name="first_name" required maxLength={80} autoComplete="off" />
          </Field>
          <Field label="Last name in school" htmlFor="s-last">
            <Input id="s-last" name="last_name" required maxLength={80} autoComplete="off" />
          </Field>
          <Field label="Last name now, if different" htmlFor="s-current">
            <Input id="s-current" name="current_last_name" maxLength={80} autoComplete="off" />
          </Field>
        </div>
        <Field label="How are they connected to the class?" htmlFor="s-connection">
          <Select id="s-connection" name="connection" required defaultValue="">
            <option value="" disabled>
              Choose one…
            </option>
            {Object.entries(CONNECTIONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Anything else? (optional)" htmlFor="s-details" hint={`Years they were at ${SCHOOL.shortName}, teams or activities, how you knew them.`}>
          <Textarea id="s-details" name="details" maxLength={2000} rows={3} />
        </Field>
        <Field label="How to reach them (optional)" htmlFor="s-contact" hint="An email, phone number, city, or social media profile. Only admins see this.">
          <Input id="s-contact" name="contact" maxLength={500} autoComplete="off" />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        {sent && <Alert tone="success">Thanks! We&apos;ll review {sent} and add them to the roster.</Alert>}
        <div>
          <Button type="submit" disabled={fetcher.state !== "idle"}>
            {fetcher.state !== "idle" ? "Sending…" : "Suggest a classmate"}
          </Button>
        </div>
      </fetcher.Form>
    </Card>
  );
}

export default function Find({ loaderData }: Route.ComponentProps) {
  const { missing, progress } = loaderData;
  return (
    <>
      <PageHeader
        title="Help Us Find"
        description="We don't have any contact info for these classmates. If you know where someone landed, send a tip. Only class admins see what you share."
      />
      <div className="mb-8 flex flex-col gap-6">
        <Progress {...progress} />
        <SuggestForm />
      </div>
      {missing.length === 0 ? (
        <EmptyState title="Everyone's accounted for!">We have at least some contact info for every classmate.</EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {missing.map((m) => (
            <li key={m.id}>
              <Card className="p-5 flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold">{m.name}</h2>
                  {m.tips > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {m.tips} {m.tips === 1 ? "tip" : "tips"} so far
                    </span>
                  )}
                </div>
                <TipForm classmateId={m.id} name={m.name} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
