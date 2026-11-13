import { env } from "cloudflare:workers";
import { Form, Link, useLocation } from "react-router";
import { Button, Card, EmptyState, Field, PageHeader, Select } from "~/components/ui";
import { ACTIVITY_GROUPS, isActivityGroup } from "~/lib/activity";
import { formatDateTime } from "~/lib/format";
import type { Route } from "./+types/activity";
import { pageTitle } from "~/lib/school";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("Activity", "Admin") }];

const PAGE_SIZE = 100;

interface Row {
  id: number;
  actor_id: number | null;
  actor_label: string;
  action: string;
  target_type: string | null;
  target_id: number | null;
  summary: string;
  created_at: number;
  /** Whether the target still exists, so the entry can link to it. */
  target_exists: number;
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const groupParam = url.searchParams.get("group") ?? "";
  const group = isActivityGroup(groupParam) ? groupParam : "";
  const actor = Number(url.searchParams.get("actor")) || 0;
  const before = Number(url.searchParams.get("before")) || 0;

  const where: string[] = [];
  const binds: (string | number)[] = [];
  if (group) {
    where.push("a.action LIKE ?");
    binds.push(`${group}.%`);
  }
  if (actor) {
    where.push("a.actor_id = ?");
    binds.push(actor);
  }
  if (before) {
    where.push("a.id < ?");
    binds.push(before);
  }
  const [rows, actors] = await env.DB.batch([
    env.DB.prepare(
      `SELECT a.*,
              CASE a.target_type
                WHEN 'classmate' THEN EXISTS (SELECT 1 FROM classmates WHERE id = a.target_id)
                WHEN 'post' THEN EXISTS (SELECT 1 FROM posts WHERE id = a.target_id)
                ELSE 0 END AS target_exists
         FROM audit_log a
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY a.id DESC LIMIT ${PAGE_SIZE + 1}`,
    ).bind(...binds),
    env.DB.prepare(
      `SELECT a.actor_id AS id, COALESCE(u.name, u.email, MAX(a.actor_label)) AS label
         FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.actor_id IS NOT NULL GROUP BY a.actor_id ORDER BY label COLLATE NOCASE`,
    ),
  ]);
  const list = rows.results as unknown as Row[];
  return {
    rows: list.slice(0, PAGE_SIZE),
    nextBefore: list.length > PAGE_SIZE ? list[PAGE_SIZE - 1].id : null,
    actors: actors.results as unknown as { id: number; label: string }[],
    group,
    actor,
    paged: before > 0,
  };
}

function targetLink(r: Row): string | null {
  if (!r.target_id) return null;
  if (r.target_type === "classmate" && r.target_exists) return `/admin/roster/${r.target_id}`;
  if (r.target_type === "post" && r.target_exists) return `/admin/news/${r.target_id}`;
  return null;
}

export default function Activity({ loaderData }: Route.ComponentProps) {
  const { rows, nextBefore, actors, group, actor, paged } = loaderData;
  const { search } = useLocation();
  const filtered = Boolean(group || actor);
  const older = new URLSearchParams(search);
  if (nextBefore) older.set("before", String(nextBefore));

  return (
    <>
      <PageHeader
        title="Activity"
        description="What admins have changed, newest first, plus members who deleted their accounts. Entries can't be edited or removed. They name people and say which fields changed, but never include contact info."
      />
      <Form method="get" className="flex flex-wrap items-end gap-3 mb-6" key={search}>
        <Field label="Who" htmlFor="actor">
          <Select id="actor" name="actor" defaultValue={actor ? String(actor) : ""} className="h-9 text-sm">
            <option value="">Everyone</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Area" htmlFor="group">
          <Select id="group" name="group" defaultValue={group} className="h-9 text-sm">
            <option value="">All areas</option>
            {Object.entries(ACTIVITY_GROUPS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" size="sm" variant="secondary">
          Filter
        </Button>
        {(filtered || paged) && (
          <Link to="/admin/activity" className="text-sm text-primary underline pb-2">
            {filtered ? "Clear filters" : "Back to newest"}
          </Link>
        )}
      </Form>

      {rows.length === 0 ? (
        <EmptyState title={filtered ? "Nothing matches those filters" : "No activity yet"}>
          {filtered ? "Try everyone or all areas." : "Admin changes will show up here as they happen."}
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <ol className="divide-y">
            {rows.map((r) => {
              const to = targetLink(r);
              const area = r.action.split(".")[0];
              return (
                <li key={r.id} className="px-4 py-3 flex flex-col gap-0.5 sm:flex-row sm:gap-4">
                  <time className="text-sm text-muted-foreground tabular-nums sm:w-44 shrink-0" dateTime={new Date(r.created_at * 1000).toISOString()}>
                    {formatDateTime(r.created_at)}
                  </time>
                  <div className="flex flex-col min-w-0">
                    <p className="break-words">
                      <span className="font-medium">{r.actor_label}</span>{" "}
                      {to ? (
                        <Link to={to} className="hover:underline">
                          {lowerFirst(r.summary)}
                        </Link>
                      ) : (
                        lowerFirst(r.summary)
                      )}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {isActivityGroup(area) ? ACTIVITY_GROUPS[area] : area}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
      {nextBefore && (
        <div className="mt-4">
          <Link to={`/admin/activity?${older}`} className="text-sm text-primary underline">
            Older entries
          </Link>
        </div>
      )}
    </>
  );
}

/** Summaries are written as sentences ("Changed …"); after the actor's name they read better lowercased. */
function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
