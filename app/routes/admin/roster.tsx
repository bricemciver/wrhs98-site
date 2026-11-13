import { env } from "cloudflare:workers";
import { Form, Link } from "react-router";
import { Badge, Button, ButtonLink, EmptyState, Input, PageHeader, Select } from "~/components/ui";
import { classmateName } from "~/lib/format";
import { parseLinks } from "~/lib/social";
import type { Route } from "./+types/roster";
import { pageTitle, SCHOOL } from "~/lib/school";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("Roster", "Admin") }];

interface Row {
  id: number;
  first_name: string;
  last_name: string;
  nickname: string | null;
  current_last_name: string | null;
  last_known_email: string | null;
  last_known_phone: string | null;
  last_known_city: string | null;
  last_known_state: string | null;
  found_links: string | null;
  is_deceased: number;
  user_email: string | null;
  tips: number;
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const show = url.searchParams.get("show") ?? "all";
  const where: string[] = [];
  const binds: unknown[] = [];
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    where.push("(c.first_name LIKE ? OR c.last_name LIKE ? OR c.current_last_name LIKE ? OR c.nickname LIKE ? OR c.last_known_email LIKE ?)");
    binds.push(like, like, like, like, like);
  }
  if (show === "joined") where.push("u.id IS NOT NULL");
  if (show === "not-joined") where.push("u.id IS NULL AND c.is_deceased = 0");
  if (show === "missing") where.push("u.id IS NULL AND c.is_deceased = 0 AND c.last_known_email IS NULL AND c.last_known_phone IS NULL");
  if (show === "deceased") where.push("c.is_deceased = 1");

  const rows = await env.DB.prepare(
    `SELECT c.id, c.first_name, c.last_name, c.nickname, c.current_last_name, c.last_known_email, c.last_known_phone,
            c.last_known_city, c.last_known_state, c.found_links, c.is_deceased, u.email AS user_email,
            (SELECT COUNT(*) FROM leads l WHERE l.classmate_id = c.id AND l.resolved = 0) AS tips
       FROM classmates c LEFT JOIN users u ON u.classmate_id = c.id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY c.last_name COLLATE NOCASE, c.first_name COLLATE NOCASE`,
  )
    .bind(...binds)
    .all<Row>();
  return { rows: rows.results, q, show };
}

export default function Roster({ loaderData }: Route.ComponentProps) {
  const { rows, q, show } = loaderData;
  return (
    <>
      <PageHeader
        title="Class roster"
        description="Everyone in the class, joined or not. A sign-in whose verified email matches a roster email is let in automatically."
        actions={
          <>
            <ButtonLink to="/admin/roster/import" variant="secondary">
              Import CSV
            </ButtonLink>
            <ButtonLink to="/admin/roster/new">Add classmate</ButtonLink>
          </>
        }
      />
      <Form method="get" className="flex flex-col gap-3 sm:flex-row mb-6" role="search">
        <label htmlFor="q" className="sr-only">
          Search
        </label>
        <Input id="q" name="q" type="search" defaultValue={q} placeholder={`Name (${SCHOOL.classYear} or current) or email`} className="sm:max-w-sm" />
        <label htmlFor="show" className="sr-only">
          Filter
        </label>
        <Select id="show" name="show" defaultValue={show} className="sm:max-w-56">
          <option value="all">All ({show === "all" ? rows.length : "…"})</option>
          <option value="joined">Joined</option>
          <option value="not-joined">Not joined</option>
          <option value="missing">No contact info</option>
          <option value="deceased">Deceased</option>
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </Form>

      {rows.length === 0 ? (
        <EmptyState title="No classmates match">Add classmates one at a time or import a spreadsheet.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Name</th>
                <th scope="col" className="px-4 py-2 font-medium">Status</th>
                <th scope="col" className="px-4 py-2 font-medium">Last known</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2">
                    <Link to={`/admin/roster/${r.id}`} className="font-medium text-primary hover:underline">
                      {classmateName(r)}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <span className="flex flex-wrap gap-1">
                      {r.is_deceased ? (
                        <Badge>Deceased</Badge>
                      ) : r.user_email ? (
                        <Badge tone="success">Joined</Badge>
                      ) : (
                        <Badge>Not joined</Badge>
                      )}
                      {r.tips > 0 && <Badge tone="accent">{r.tips} tip{r.tips === 1 ? "" : "s"}</Badge>}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {[
                      r.last_known_email,
                      r.last_known_phone,
                      [r.last_known_city, r.last_known_state].filter(Boolean).join(", "),
                      parseLinks(r.found_links).length > 0 && `${parseLinks(r.found_links).length} link(s) found`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
