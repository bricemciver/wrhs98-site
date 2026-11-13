import { env } from "cloudflare:workers";
import { X } from "lucide-react";
import { Form, Link, useLocation, useSearchParams } from "react-router";
import { Avatar, Badge, Button, EmptyState, Input, PageHeader, Select } from "~/components/ui";
import { memberContext } from "~/context";
import { classmateInitials, classmateName } from "~/lib/format";
import type { Route } from "./+types/directory";
import { pageTitle } from "~/lib/school";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("Class Directory") }];

interface Row {
  id: number;
  first_name: string;
  last_name: string;
  nickname: string | null;
  is_deceased: number;
  user_id: number | null;
  current_last_name: string | null;
  city: string | null;
  state: string | null;
  photo_key: string | null;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = context.get(memberContext);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const show = url.searchParams.get("show") ?? "all";

  const where: string[] = [];
  const binds: unknown[] = [];
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    where.push(
      "(c.first_name LIKE ? OR c.last_name LIKE ? OR c.nickname LIKE ? OR c.current_last_name LIKE ? OR (p.share_location = 1 AND p.city LIKE ?))",
    );
    binds.push(like, like, like, like, like);
  }
  if (show === "joined") where.push("u.id IS NOT NULL");
  if (show === "not-joined") where.push("u.id IS NULL AND c.is_deceased = 0");

  const rows = await env.DB.prepare(
    `SELECT c.id, c.first_name, c.last_name, c.nickname, c.is_deceased, u.id AS user_id,
            c.current_last_name,
            CASE WHEN p.share_location = 1 THEN p.city END AS city,
            CASE WHEN p.share_location = 1 THEN p.state END AS state,
            p.photo_key
       FROM classmates c
       LEFT JOIN users u ON u.classmate_id = c.id AND u.role IN ('member', 'admin')
       LEFT JOIN profiles p ON p.user_id = u.id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY c.last_name COLLATE NOCASE, c.first_name COLLATE NOCASE`,
  )
    .bind(...binds)
    .all<Row>();

  return { classmates: rows.results, q, show, isAdmin: user.role === "admin", myClassmateId: user.classmateId };
}

export default function Directory({ loaderData }: Route.ComponentProps) {
  const { classmates, q, show, isAdmin, myClassmateId } = loaderData;
  const [params] = useSearchParams();
  const location = useLocation();
  const filtered = Boolean(q) || show !== "all";
  // Lets the classmate page's "Directory" link come back to these results.
  const backState = { directorySearch: location.search };

  return (
    <>
      <PageHeader
        title="Class Directory"
        description="Classmates who have joined control what they share. Last-known contact details for people who haven't joined yet are only visible to admins."
      />

      <Form key={location.search} method="get" className="flex flex-col gap-3 sm:flex-row mb-6" role="search">
        <label htmlFor="q" className="sr-only">
          Search classmates
        </label>
        <Input id="q" name="q" type="search" defaultValue={q} placeholder="Search by name or city" className="sm:max-w-sm" />
        <label htmlFor="show" className="sr-only">
          Filter
        </label>
        <Select id="show" name="show" defaultValue={show} className="sm:max-w-48">
          <option value="all">Everyone</option>
          <option value="joined">Joined the site</option>
          <option value="not-joined">Not joined yet</option>
        </Select>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {filtered && (
          <Link
            to="/directory"
            className="inline-flex h-11 items-center justify-center gap-1 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
            Clear
          </Link>
        )}
      </Form>

      <p className="text-sm text-muted-foreground mb-4" aria-live="polite">
        {classmates.length} {classmates.length === 1 ? "classmate" : "classmates"}
        {params.get("q") ? ` matching “${q}”` : ""}
        {show === "joined" ? " who have joined" : show === "not-joined" ? " who haven't joined yet" : ""}
      </p>

      {classmates.length === 0 ? (
        <EmptyState title="No classmates found">
          {isAdmin ? (
            <Link to="/admin/roster" className="text-primary underline">
              Add classmates to the roster
            </Link>
          ) : (
            "Try a different search."
          )}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classmates.map((c) => {
            const name = classmateName(c);
            return (
              <li key={c.id}>
                <Link to={`/directory/${c.id}`} state={backState} className="flex items-center gap-4 rounded-lg border bg-card p-4 hover:border-primary">
                  <Avatar src={c.photo_key ? `/files/${c.photo_key}` : null} initials={classmateInitials(c)} alt="" />
                  <span className="flex flex-col gap-1 min-w-0">
                    <span className="font-semibold truncate">{name}</span>
                    <span className="text-sm text-muted-foreground truncate">
                      {[c.city, c.state].filter(Boolean).join(", ") || " "}
                    </span>
                    <span className="flex gap-1">
                      {c.is_deceased ? (
                        <Badge>In memoriam</Badge>
                      ) : c.user_id ? (
                        <Badge tone="success">Joined</Badge>
                      ) : (
                        <Badge>Not joined yet</Badge>
                      )}
                      {c.id === myClassmateId && <Badge tone="accent">You</Badge>}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
