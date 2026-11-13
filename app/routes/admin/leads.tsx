import { env } from "cloudflare:workers";
import { Link, useFetcher } from "react-router";
import { Button, Card, EmptyState, PageHeader } from "~/components/ui";
import { memberContext } from "~/context";
import { activityStmt } from "~/lib/audit.server";
import { classmateName, formatDate } from "~/lib/format";
import type { Route } from "./+types/leads";
import { pageTitle } from "~/lib/school";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("Tips", "Admin") }];

interface Row {
  id: number;
  info: string;
  resolved: number;
  created_at: number;
  classmate_id: number;
  first_name: string;
  last_name: string;
  nickname: string | null;
  current_last_name: string | null;
  submitter: string | null;
  submitter_email: string | null;
}

export async function loader({ request }: Route.LoaderArgs) {
  const all = new URL(request.url).searchParams.get("all") === "1";
  const rows = await env.DB.prepare(
    `SELECT l.id, l.info, l.resolved, l.created_at, c.id AS classmate_id, c.first_name, c.last_name, c.nickname, c.current_last_name,
            u.name AS submitter, u.email AS submitter_email
       FROM leads l JOIN classmates c ON c.id = l.classmate_id LEFT JOIN users u ON u.id = l.submitted_by
      ${all ? "" : "WHERE l.resolved = 0"}
      ORDER BY l.created_at DESC LIMIT 500`,
  ).all<Row>();
  return { rows: rows.results, all };
}

export async function action({ request, context }: Route.ActionArgs) {
  const me = context.get(memberContext);
  const form = await request.formData();
  const id = Number(form.get("id"));
  const resolved = form.get("resolved") === "1" ? 1 : 0;
  const lead = await env.DB.prepare(
    `SELECT l.resolved, c.first_name, c.last_name, c.nickname, c.current_last_name
       FROM leads l JOIN classmates c ON c.id = l.classmate_id WHERE l.id = ?`,
  )
    .bind(id)
    .first<{ resolved: number; first_name: string; last_name: string; nickname: string | null; current_last_name: string | null }>();
  if (!lead || lead.resolved === resolved) return { ok: true };
  await env.DB.batch([
    env.DB.prepare("UPDATE leads SET resolved = ? WHERE id = ?").bind(resolved, id),
    activityStmt(
      me,
      resolved ? "lead.resolve" : "lead.reopen",
      `${resolved ? "Resolved" : "Reopened"} a tip about ${classmateName(lead)}`,
      { type: "lead", id },
    ),
  ]);
  return { ok: true };
}

function ResolveButton({ row }: { row: Row }) {
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="id" value={row.id} />
      <input type="hidden" name="resolved" value={row.resolved ? "0" : "1"} />
      <Button type="submit" size="sm" variant="secondary" disabled={fetcher.state !== "idle"}>
        {row.resolved ? "Reopen" : "Mark resolved"}
      </Button>
    </fetcher.Form>
  );
}

export default function Leads({ loaderData }: Route.ComponentProps) {
  const { rows, all } = loaderData;
  return (
    <>
      <PageHeader
        title="Tips from Help Us Find"
        description="Update the roster entry with what you learn, then mark the tip resolved."
        actions={
          <Link to={all ? "/admin/leads" : "/admin/leads?all=1"} className="text-sm text-primary underline">
            {all ? "Show unresolved only" : "Show all"}
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="No tips to review" />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Card className={`p-4 flex flex-col gap-2 ${r.resolved ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link to={`/admin/roster/${r.classmate_id}`} className="font-semibold text-primary hover:underline">
                    {classmateName(r)}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {r.submitter ?? r.submitter_email ?? "A member"} · {formatDate(r.created_at)}
                  </span>
                </div>
                <p className="whitespace-pre-line">{r.info}</p>
                <div>
                  <ResolveButton row={r} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
