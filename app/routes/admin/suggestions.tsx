import { env } from "cloudflare:workers";
import { data, Link, useFetcher } from "react-router";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader } from "~/components/ui";
import { memberContext } from "~/context";
import { activityStmt } from "~/lib/audit.server";
import { formatDate } from "~/lib/format";
import { optStr, str } from "~/lib/http.server";
import { CONNECTIONS, isConnection } from "~/lib/suggestions";
import type { Route } from "./+types/suggestions";
import { pageTitle } from "~/lib/school";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("Suggestions", "Admin") }];

interface Row {
  id: number;
  first_name: string;
  last_name: string;
  current_last_name: string | null;
  connection: string;
  details: string | null;
  contact: string | null;
  status: "open" | "added" | "dismissed";
  classmate_id: number | null;
  created_at: number;
  resolved_at: number | null;
  submitter: string | null;
  submitter_email: string | null;
  resolver: string | null;
  /** A roster entry with the same first name and a matching last name, if any. */
  possible_match: number | null;
}

export async function loader({ request }: Route.LoaderArgs) {
  const all = new URL(request.url).searchParams.get("all") === "1";
  const rows = await env.DB.prepare(
    `SELECT s.*, u.name AS submitter, u.email AS submitter_email, COALESCE(r.name, r.email) AS resolver,
            (SELECT c.id FROM classmates c
              WHERE lower(c.first_name) = lower(s.first_name)
                AND (lower(c.last_name) IN (lower(s.last_name), lower(COALESCE(s.current_last_name, '')))
                  OR lower(COALESCE(c.current_last_name, '')) IN (lower(s.last_name), lower(COALESCE(s.current_last_name, ''))))
              LIMIT 1) AS possible_match
       FROM classmate_suggestions s
       LEFT JOIN users u ON u.id = s.submitted_by
       LEFT JOIN users r ON r.id = s.resolved_by
      ${all ? "" : "WHERE s.status = 'open'"}
      ORDER BY s.status = 'open' DESC, s.created_at DESC LIMIT 500`,
  ).all<Row>();
  return { rows: rows.results, all };
}

export async function action({ request, context }: Route.ActionArgs) {
  const me = context.get(memberContext);
  const form = await request.formData();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id <= 0) return data({ error: "Invalid suggestion." }, { status: 400 });
  const s = await env.DB.prepare(
    `SELECT s.*, COALESCE(u.name, u.email) AS submitter FROM classmate_suggestions s
       LEFT JOIN users u ON u.id = s.submitted_by WHERE s.id = ?`,
  )
    .bind(id)
    .first<Row & { submitter: string | null }>();
  if (!s) return data({ error: "That suggestion no longer exists." }, { status: 404 });
  const intent = str(form, "intent");
  const suggested = `${s.first_name} ${s.last_name}`;
  const suggestionTarget = { type: "suggestion", id } as const;

  if (intent === "reopen") {
    if (s.status !== "dismissed") return data({ error: "Only dismissed suggestions can be reopened." }, { status: 400 });
    await env.DB.batch([
      env.DB.prepare("UPDATE classmate_suggestions SET status = 'open', resolved_by = NULL, resolved_at = NULL WHERE id = ?").bind(id),
      activityStmt(me, "suggestion.reopen", `Reopened the suggestion for ${suggested}`, suggestionTarget),
    ]);
    return { ok: true };
  }
  if (s.status !== "open") return data({ error: "Someone already handled this suggestion." }, { status: 409 });

  if (intent === "dismiss") {
    await env.DB.batch([
      env.DB.prepare("UPDATE classmate_suggestions SET status = 'dismissed', resolved_by = ?, resolved_at = unixepoch() WHERE id = ? AND status = 'open'").bind(
        me.id,
        id,
      ),
      activityStmt(me, "suggestion.dismiss", `Dismissed the suggestion for ${suggested}`, suggestionTarget),
    ]);
    return { ok: true };
  }

  if (intent !== "add") return data({ error: "Unknown action." }, { status: 400 });
  const first = str(form, "first_name");
  const last = str(form, "last_name");
  const current = optStr(form, "current_last_name");
  if (!first || !last) return data({ error: "First name and last name in school are required." }, { status: 400 });
  if (first.length > 80 || last.length > 80 || (current?.length ?? 0) > 80) return data({ error: "Names must be under 80 characters." }, { status: 400 });
  const dupe = await env.DB.prepare("SELECT id FROM classmates WHERE lower(first_name) = lower(?) AND lower(last_name) = lower(?)")
    .bind(first, last)
    .first<{ id: number }>();
  if (dupe) return data({ error: `${first} ${last} is already on the roster.`, existingId: dupe.id }, { status: 409 });

  const connection = isConnection(s.connection) ? CONNECTIONS[s.connection] : s.connection;
  const notes = [
    `Suggested by ${s.submitter ?? "a member"} on ${formatDate(s.created_at)}: ${connection}.`,
    s.details && `Details: ${s.details}`,
    s.contact && `Contact info from suggestion: ${s.contact}`,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
  const [inserted] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO classmates (first_name, last_name, current_last_name, admin_notes) VALUES (?, ?, ?, ?) RETURNING id`,
    ).bind(first, last, current && current.toLowerCase() !== last.toLowerCase() ? current : null, notes),
    env.DB.prepare(
      `UPDATE classmate_suggestions SET status = 'added', resolved_by = ?, resolved_at = unixepoch(),
              classmate_id = (SELECT MAX(id) FROM classmates) WHERE id = ? AND status = 'open'`,
    ).bind(me.id, id),
    activityStmt(me, "suggestion.add", `Added suggested classmate ${first} ${last} to the roster`, suggestionTarget),
  ]);
  return { ok: true, addedId: (inserted.results[0] as { id: number }).id };
}

function connectionLabel(c: string) {
  return isConnection(c) ? CONNECTIONS[c] : c;
}

function SuggestionCard({ row }: { row: Row }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const result = fetcher.data;
  const error = result && "error" in result ? result.error : null;
  const existingId = result && "existingId" in result && typeof result.existingId === "number" ? result.existingId : null;
  const p = `s${row.id}`;
  const name = `${row.first_name} ${row.last_name}${row.current_last_name ? ` (now ${row.current_last_name})` : ""}`;

  return (
    <Card className={`p-5 flex flex-col gap-3 ${row.status !== "open" ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{name}</h2>
        <span className="text-sm text-muted-foreground">
          {row.submitter ?? row.submitter_email ?? "A member"} · {formatDate(row.created_at)}
        </span>
      </div>
      <dl className="grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted-foreground">Connection</dt>
        <dd>{connectionLabel(row.connection)}</dd>
        {row.details && (
          <>
            <dt className="text-muted-foreground">Details</dt>
            <dd className="whitespace-pre-line">{row.details}</dd>
          </>
        )}
        {row.contact && (
          <>
            <dt className="text-muted-foreground">How to reach them</dt>
            <dd className="break-words">{row.contact}</dd>
          </>
        )}
      </dl>

      {row.status === "open" && row.possible_match && (
        <Alert>
          There&apos;s already a roster entry with a similar name.{" "}
          <Link to={`/admin/roster/${row.possible_match}`} className="text-primary underline">
            Check it
          </Link>{" "}
          before adding. If it&apos;s the same person, dismiss this suggestion.
        </Alert>
      )}

      {row.status === "added" && (
        <p className="text-sm flex flex-wrap items-center gap-2">
          <Badge>Added</Badge>
          {row.classmate_id ? (
            <Link to={`/admin/roster/${row.classmate_id}`} className="text-primary underline">
              Open roster entry
            </Link>
          ) : (
            "Roster entry since deleted"
          )}
          {row.resolver && <span className="text-muted-foreground">by {row.resolver}</span>}
        </p>
      )}
      {row.status === "dismissed" && (
        <fetcher.Form method="post" className="flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="id" value={row.id} />
          <Badge>Dismissed</Badge>
          {row.resolver && <span className="text-muted-foreground">by {row.resolver}</span>}
          <Button type="submit" name="intent" value="reopen" size="sm" variant="ghost" disabled={busy}>
            Reopen
          </Button>
        </fetcher.Form>
      )}

      {row.status === "open" && (
        <fetcher.Form method="post" className="flex flex-col gap-3 border-t pt-3">
          <input type="hidden" name="id" value={row.id} />
          <p className="text-sm text-muted-foreground">
            Fix the spelling if needed, then add them. Their connection, details, and contact info go into the admin notes.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="First name" htmlFor={`${p}-first`}>
              <Input id={`${p}-first`} name="first_name" defaultValue={row.first_name} required maxLength={80} />
            </Field>
            <Field label="Last name in school" htmlFor={`${p}-last`}>
              <Input id={`${p}-last`} name="last_name" defaultValue={row.last_name} required maxLength={80} />
            </Field>
            <Field label="Current last name" htmlFor={`${p}-current`}>
              <Input id={`${p}-current`} name="current_last_name" defaultValue={row.current_last_name ?? ""} maxLength={80} />
            </Field>
          </div>
          {error && (
            <Alert tone="error">
              {error}
              {existingId && (
                <>
                  {" "}
                  <Link to={`/admin/roster/${existingId}`} className="underline">
                    Open it
                  </Link>
                </>
              )}
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="intent" value="add" size="sm" disabled={busy}>
              Add to roster
            </Button>
            <Button type="submit" name="intent" value="dismiss" size="sm" variant="secondary" disabled={busy}>
              Dismiss
            </Button>
          </div>
        </fetcher.Form>
      )}
    </Card>
  );
}

export default function Suggestions({ loaderData }: Route.ComponentProps) {
  const { rows, all } = loaderData;
  return (
    <>
      <PageHeader
        title="Suggested classmates"
        description="People members think belong on the roster: early or late graduates, and classmates who finished high school somewhere else."
        actions={
          <Link to={all ? "/admin/suggestions" : "/admin/suggestions?all=1"} className="text-sm text-primary underline">
            {all ? "Show open only" : "Show all"}
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="No suggestions to review">Members can suggest classmates from the Help Us Find page.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((r) => (
            <li key={r.id}>
              <SuggestionCard row={r} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
