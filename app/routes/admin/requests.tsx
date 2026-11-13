import { env } from "cloudflare:workers";
import { data, useFetcher } from "react-router";
import { Alert, Button, Card, EmptyState, Field, PageHeader, Select } from "~/components/ui";
import { memberContext } from "~/context";
import { activityStmt } from "~/lib/audit.server";
import { classmateName, formatDate } from "~/lib/format";
import { fillCurrentLastName } from "~/lib/auth.server";
import { str } from "~/lib/http.server";
import type { Route } from "./+types/requests";
import { pageTitle } from "~/lib/school";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("Access requests", "Admin") }];

interface RequestRow {
  id: number;
  user_id: number;
  email: string;
  email_verified: number;
  name_in_school: string;
  current_name: string | null;
  message: string | null;
  created_at: number;
}

interface ClassmateOption {
  id: number;
  first_name: string;
  last_name: string;
  nickname: string | null;
  current_last_name: string | null;
}

export async function loader() {
  const [requests, unclaimed] = await env.DB.batch([
    env.DB.prepare(
      `SELECT r.id, r.user_id, u.email, u.email_verified, r.name_in_school, r.current_name, r.message, r.created_at
         FROM access_requests r JOIN users u ON u.id = r.user_id
        WHERE r.status = 'open' AND u.role = 'pending' ORDER BY r.created_at`,
    ),
    env.DB.prepare(
      `SELECT c.id, c.first_name, c.last_name, c.nickname, c.current_last_name FROM classmates c
        WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.classmate_id = c.id)
        ORDER BY c.last_name COLLATE NOCASE, c.first_name COLLATE NOCASE`,
    ),
  ]);
  const classmates = (unclaimed.results as unknown as ClassmateOption[]).map((c) => ({
    id: c.id,
    name: classmateName(c),
    first: c.first_name.toLowerCase(),
    last: c.last_name.toLowerCase(),
    current: c.current_last_name?.toLowerCase() ?? null,
  }));
  return { requests: requests.results as unknown as RequestRow[], classmates };
}

export async function action({ request, context }: Route.ActionArgs) {
  const admin = context.get(memberContext);
  const form = await request.formData();
  const intent = str(form, "intent");
  const requestId = Number(form.get("requestId"));
  const row = await env.DB.prepare(
    "SELECT r.user_id, r.name_in_school, r.current_name FROM access_requests r WHERE r.id = ? AND r.status = 'open'",
  )
    .bind(requestId)
    .first<{ user_id: number; name_in_school: string; current_name: string | null }>();
  if (!row) return data({ error: "That request was already handled." }, { status: 404 });
  const requestTarget = { type: "request", id: requestId } as const;

  if (intent === "deny") {
    await env.DB.batch([
      env.DB.prepare("UPDATE access_requests SET status = 'denied', reviewed_by = ?, reviewed_at = unixepoch() WHERE id = ?").bind(admin.id, requestId),
      env.DB.prepare("UPDATE users SET role = 'denied' WHERE id = ? AND role = 'pending'").bind(row.user_id),
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.user_id),
      activityStmt(admin, "request.deny", `Denied the access request from ${row.name_in_school}`, requestTarget),
    ]);
    return { ok: true };
  }

  if (intent === "approve") {
    const link = str(form, "classmateId");
    let classmateId: number | null = null;
    if (link === "new") {
      const parts = row.name_in_school.split(/\s+/);
      const last = parts.length > 1 ? parts.pop()! : "";
      // If they gave a different name today, keep its surname as their current last name.
      const currentParts = (row.current_name ?? "").trim().split(/\s+/);
      const currentLast = currentParts.length > 1 ? currentParts.pop()! : null;
      const created = await env.DB.prepare(
        "INSERT INTO classmates (first_name, last_name, current_last_name) VALUES (?, ?, ?) RETURNING id",
      )
        .bind(
          parts.join(" ") || row.name_in_school,
          last,
          currentLast && currentLast.toLowerCase() !== last.toLowerCase() ? currentLast : null,
        )
        .first<{ id: number }>();
      classmateId = created!.id;
    } else if (link) {
      classmateId = Number(link);
      const taken = await env.DB.prepare("SELECT 1 FROM users WHERE classmate_id = ?").bind(classmateId).first();
      if (taken) return data({ error: "That classmate is already linked to another account." }, { status: 409 });
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE access_requests SET status = 'approved', reviewed_by = ?, reviewed_at = unixepoch() WHERE id = ?").bind(admin.id, requestId),
      env.DB.prepare("UPDATE users SET role = 'member', classmate_id = ? WHERE id = ? AND role = 'pending'").bind(classmateId, row.user_id),
      activityStmt(
        admin,
        "request.approve",
        `Approved ${row.name_in_school}${link === "new" ? " and added them to the roster" : classmateId ? " and linked their roster entry" : " without a roster link"}`,
        requestTarget,
      ),
    ]);
    if (classmateId) await fillCurrentLastName(row.user_id, classmateId, row.current_name);
    return { ok: true };
  }
  return data({ error: "Unknown action" }, { status: 400 });
}

function RequestCard({
  r,
  classmates,
}: {
  r: RequestRow;
  classmates: { id: number; name: string; first: string; last: string; current: string | null }[];
}) {
  const fetcher = useFetcher<typeof action>();
  // Suggest a roster match using either their 1998 name or the name they go by now.
  const words = `${r.name_in_school} ${r.current_name ?? ""}`.toLowerCase().split(/\s+/);
  const guess = classmates.find(
    (c) => words.includes(c.first) && (words.includes(c.last) || (c.current !== null && words.includes(c.current))),
  );
  const selectId = `link-${r.id}`;

  return (
    <Card className="p-5 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">
          {r.name_in_school}
          {r.current_name && r.current_name !== r.name_in_school && <span className="text-muted-foreground font-normal"> (now {r.current_name})</span>}
        </h2>
        <p className="text-sm text-muted-foreground">
          {r.email} {r.email_verified ? "· verified email" : "· email not verified by provider"} · requested {formatDate(r.created_at)}
        </p>
        {r.message && <p className="whitespace-pre-line mt-2">{r.message}</p>}
      </div>
      {fetcher.data && "error" in fetcher.data && <Alert tone="error">{fetcher.data.error}</Alert>}
      <fetcher.Form method="post" className="flex flex-col gap-3 md:flex-row md:items-end">
        <input type="hidden" name="requestId" value={r.id} />
        <div className="flex-1">
          <Field label="Link to roster entry" htmlFor={selectId}>
            <Select id={selectId} name="classmateId" defaultValue={guess ? String(guess.id) : ""}>
              <option value="">Don&apos;t link (e.g. a helper who isn&apos;t a classmate)</option>
              <option value="new">Create a new roster entry from this request</option>
              {classmates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex gap-2">
          <Button type="submit" name="intent" value="approve" disabled={fetcher.state !== "idle"}>
            Approve
          </Button>
          <Button
            type="submit"
            name="intent"
            value="deny"
            variant="secondary"
            disabled={fetcher.state !== "idle"}
            onClick={(e) => !confirm(`Deny access for ${r.email}?`) && e.preventDefault()}
          >
            Deny
          </Button>
        </div>
      </fetcher.Form>
    </Card>
  );
}

export default function Requests({ loaderData }: Route.ComponentProps) {
  const { requests, classmates } = loaderData;
  return (
    <>
      <PageHeader
        title="Access requests"
        description="People who signed in with an email that isn't on the roster. Approving lets them in on their next page load."
      />
      {requests.length === 0 ? (
        <EmptyState title="No pending requests" />
      ) : (
        <div className="flex flex-col gap-4">
          {requests.map((r) => (
            <RequestCard key={r.id} r={r} classmates={classmates} />
          ))}
        </div>
      )}
    </>
  );
}
