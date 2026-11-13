import { env } from "cloudflare:workers";
import { data, Link, useFetcher } from "react-router";
import { Alert, Badge, Button, Card, PageHeader, Select } from "~/components/ui";
import { memberContext } from "~/context";
import { activityStmt } from "~/lib/audit.server";
import { fillCurrentLastName, isOwnerEmail } from "~/lib/auth.server";
import { classmateName, formatShortDate } from "~/lib/format";
import { str } from "~/lib/http.server";
import { SIGNIN_METHODS, signinLabel } from "~/lib/signin";
import type { Role } from "~/lib/types";
import type { Route } from "./+types/members";
import { pageTitle } from "~/lib/school";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("Members", "Admin") }];

interface Row {
  id: number;
  email: string;
  name: string | null;
  role: Role;
  last_login_at: number | null;
  classmate_id: number | null;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  current_last_name: string | null;
  signup_method: string | null;
  last_login_method: string | null;
  /** Comma-separated providers linked to the account (google, microsoft). */
  providers: string | null;
  owner: boolean;
}

const ROLE_LABELS: Record<Role, string> = { member: "Member", admin: "Admin", pending: "Pending", denied: "Denied" };

interface Unlinked {
  id: number;
  first_name: string;
  last_name: string;
  nickname: string | null;
  current_last_name: string | null;
}

export async function loader({ context }: Route.LoaderArgs) {
  const me = context.get(memberContext);
  const rows = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.last_login_at, u.classmate_id, c.first_name, c.last_name, c.nickname, c.current_last_name,
            u.signup_method, u.last_login_method,
            (SELECT group_concat(o.provider) FROM oauth_accounts o WHERE o.user_id = u.id) AS providers
       FROM users u LEFT JOIN classmates c ON c.id = u.classmate_id
      ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'member' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
               COALESCE(c.current_last_name, c.last_name, u.name, u.email) COLLATE NOCASE`,
  ).all<Omit<Row, "owner">>();
  // Roster entries no account has claimed yet, for the link picker.
  const unlinked = await env.DB.prepare(
    `SELECT c.id, c.first_name, c.last_name, c.nickname, c.current_last_name
       FROM classmates c
      WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.classmate_id = c.id)
      ORDER BY c.last_name COLLATE NOCASE, c.first_name COLLATE NOCASE`,
  ).all<Unlinked>();
  const joined: Record<string, number> = {};
  for (const r of rows.results) {
    const k = r.signup_method ?? "unknown";
    joined[k] = (joined[k] ?? 0) + 1;
  }
  return {
    joined,
    rows: rows.results.map((r): Row => ({ ...r, owner: isOwnerEmail(r.email) })),
    unlinked: unlinked.results,
    meId: me.id,
    meOwner: isOwnerEmail(me.email),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const me = context.get(memberContext);
  const form = await request.formData();
  const userId = Number(form.get("userId"));
  if (!Number.isInteger(userId) || userId <= 0) return data({ error: "Invalid account" }, { status: 400 });
  const target = await env.DB.prepare("SELECT email, name, role, classmate_id FROM users WHERE id = ?")
    .bind(userId)
    .first<{ email: string; name: string | null; role: Role; classmate_id: number | null }>();
  if (!target) return data({ error: "That account no longer exists." }, { status: 404 });
  const meOwner = isOwnerEmail(me.email);
  const targetOwner = isOwnerEmail(target.email);
  const who = target.name?.trim() || target.email;
  const userTarget = { type: "user", id: userId } as const;

  if (str(form, "intent") === "link") {
    if (targetOwner && !meOwner) return data({ error: "Only a site owner can change an owner's roster link." }, { status: 403 });
    const raw = str(form, "classmateId");
    const classmateId = raw ? Number(raw) : null;
    if (classmateId !== null) {
      if (!Number.isInteger(classmateId) || classmateId <= 0) return data({ error: "Invalid roster entry" }, { status: 400 });
      const c = await env.DB.prepare(
        "SELECT (SELECT 1 FROM classmates WHERE id = ?1) AS found, (SELECT id FROM users WHERE classmate_id = ?1) AS taken_by",
      )
        .bind(classmateId)
        .first<{ found: number | null; taken_by: number | null }>();
      if (!c?.found) return data({ error: "That roster entry no longer exists." }, { status: 404 });
      if (c.taken_by !== null && c.taken_by !== userId) {
        return data({ error: "That classmate is already linked to another account." }, { status: 409 });
      }
    }
    if (classmateId === target.classmate_id) return { ok: true };
    const named = await env.DB.prepare("SELECT first_name, last_name, nickname, current_last_name FROM classmates WHERE id = ?")
      .bind(classmateId ?? target.classmate_id ?? 0)
      .first<{ first_name: string; last_name: string; nickname: string | null; current_last_name: string | null }>();
    const entry = named ? classmateName(named) : "a deleted roster entry";
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET classmate_id = ? WHERE id = ?").bind(classmateId, userId),
      classmateId === null
        ? activityStmt(me, "member.unlink", `Unlinked ${who} from ${entry}`, userTarget)
        : activityStmt(me, "member.link", `Linked ${who} to ${entry}`, userTarget),
    ]);
    if (classmateId !== null) await fillCurrentLastName(userId, classmateId);
    return { ok: true };
  }

  const role = str(form, "role") as Role;
  if (!["pending", "member", "admin", "denied"].includes(role)) return data({ error: "Invalid role" }, { status: 400 });
  if (userId === me.id) return data({ error: "You can't change your own role." }, { status: 400 });
  if (targetOwner) return data({ error: "Site owners are always admins." }, { status: 403 });
  if (!meOwner && (target.role === "admin" || role === "admin")) {
    return data({ error: "Only a site owner can grant or remove admin." }, { status: 403 });
  }
  if (role === target.role) return { ok: true };
  const stmts = [
    env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(role, userId),
    activityStmt(me, "member.role", `Changed ${who} from ${ROLE_LABELS[target.role]} to ${ROLE_LABELS[role]}`, userTarget),
  ];
  if (role === "denied" || role === "pending") {
    stmts.push(env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId));
  }
  await env.DB.batch(stmts);
  return { ok: true };
}

function RoleSelect({ row, disabled, canGrantAdmin }: { row: Row; disabled: boolean; canGrantAdmin: boolean }) {
  const fetcher = useFetcher<typeof action>();
  const id = `role-${row.id}`;
  return (
    <fetcher.Form method="post" className="flex flex-col gap-1">
      <input type="hidden" name="userId" value={row.id} />
      <label htmlFor={id} className="sr-only">
        Role for {row.email}
      </label>
      <Select
        id={id}
        name="role"
        defaultValue={row.role}
        disabled={disabled || fetcher.state !== "idle"}
        className="h-9 text-sm"
        onChange={(e) => fetcher.submit(e.currentTarget.form)}
      >
        <option value="member">Member</option>
        {(canGrantAdmin || row.role === "admin") && <option value="admin">{ROLE_LABELS.admin}</option>}
        <option value="pending">Pending</option>
        <option value="denied">Denied (blocked)</option>
      </Select>
      {fetcher.data && "error" in fetcher.data && <span className="text-xs text-destructive">{fetcher.data.error}</span>}
    </fetcher.Form>
  );
}

function SignIn({ row }: { row: Row }) {
  const linked = (row.providers ?? "").split(",").filter(Boolean);
  const others = linked.filter((p) => p !== row.signup_method);
  return (
    <span className="flex flex-col">
      <span>Joined with {signinLabel(row.signup_method)}</span>
      <span className="text-muted-foreground">
        {row.last_login_at ? `Last: ${formatShortDate(row.last_login_at)}` : "Never signed in"}
        {row.last_login_at && row.last_login_method && ` · ${signinLabel(row.last_login_method)}`}
      </span>
      {others.length > 0 && <span className="text-muted-foreground">Also linked: {others.map(signinLabel).join(", ")}</span>}
    </span>
  );
}

function JoinedSummary({ joined }: { joined: Record<string, number> }) {
  const total = Object.values(joined).reduce((a, b) => a + b, 0);
  if (!total) return null;
  const keys = [...Object.keys(SIGNIN_METHODS), ...Object.keys(joined).filter((k) => !Object.hasOwn(SIGNIN_METHODS, k))];
  return (
    <Card className="p-4 mt-4">
      <h2 className="text-sm font-medium mb-2">How people joined</h2>
      <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {keys.map((k) => {
          const n = joined[k] ?? 0;
          return (
            <li key={k}>
              <span className="font-semibold tabular-nums">{n}</span> {signinLabel(k)}{" "}
              <span className="text-muted-foreground">({Math.round((n / total) * 100)}%)</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function RosterLink({ row, unlinked, readOnly }: { row: Row; unlinked: Unlinked[]; readOnly: boolean }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const error = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  if (readOnly) {
    return row.classmate_id && row.first_name && row.last_name ? (
      <Link to={`/admin/roster/${row.classmate_id}`} className="text-primary hover:underline">
        {classmateName({ ...row, first_name: row.first_name, last_name: row.last_name })}
      </Link>
    ) : (
      <Badge>Not linked</Badge>
    );
  }

  if (row.classmate_id && row.first_name && row.last_name) {
    return (
      <fetcher.Form method="post" className="flex flex-col gap-1">
        <input type="hidden" name="intent" value="link" />
        <input type="hidden" name="userId" value={row.id} />
        <input type="hidden" name="classmateId" value="" />
        {/* Name on the left, Unlink pinned right, so the buttons line up down the column. */}
        <div className="flex items-center justify-between gap-3">
          <Link to={`/admin/roster/${row.classmate_id}`} className="min-w-0 text-primary hover:underline">
            {classmateName({ ...row, first_name: row.first_name, last_name: row.last_name })}
          </Link>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="shrink-0"
            disabled={busy}
            aria-label={`Unlink ${row.email} from the roster`}
          >
            {busy ? "Unlinking…" : "Unlink"}
          </Button>
        </div>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </fetcher.Form>
    );
  }

  const id = `link-${row.id}`;
  return (
    <fetcher.Form method="post" className="flex flex-col gap-1">
      <input type="hidden" name="intent" value="link" />
      <input type="hidden" name="userId" value={row.id} />
      <label htmlFor={id} className="sr-only">
        Roster entry for {row.email}
      </label>
      <Select
        id={id}
        name="classmateId"
        defaultValue=""
        disabled={busy || unlinked.length === 0}
        className="h-9 text-sm"
        onChange={(e) => {
          if (e.currentTarget.value) fetcher.submit(e.currentTarget.form);
        }}
      >
        <option value="">{unlinked.length ? "Not linked. Choose a classmate…" : "Not linked (no open roster entries)"}</option>
        {unlinked.map((c) => (
          <option key={c.id} value={c.id}>
            {c.last_name}, {c.first_name}
            {c.current_last_name && c.current_last_name !== c.last_name ? ` (now ${c.current_last_name})` : ""}
            {c.nickname ? ` "${c.nickname}"` : ""}
          </option>
        ))}
      </Select>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </fetcher.Form>
  );
}

export default function Members({ loaderData }: Route.ComponentProps) {
  const { rows, unlinked, meId, meOwner, joined } = loaderData;
  return (
    <>
      <PageHeader
        title="Members"
        description="Everyone who has signed in. Link an account to its roster entry so their profile shows in the directory. Changing someone to Pending or Denied signs them out right away."
      />
      <Alert>
        {meOwner
          ? "As a site owner, you can make other members admins or remove admin. No one can change an owner's role here; owners are set in the ADMIN_EMAILS setting."
          : "Only a site owner can make someone an admin or remove admin. You can approve, link, and manage everyone else."}
      </Alert>
      <JoinedSummary joined={joined} />
      <div className="overflow-x-auto rounded-lg border bg-card mt-4">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Account</th>
              <th scope="col" className="px-3 py-2 font-medium">Roster entry</th>
              <th scope="col" className="px-3 py-2 font-medium">Sign-in</th>
              <th scope="col" className="px-3 py-2 font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 align-top">
                  <span className="flex flex-col min-w-0">
                    <span className="font-medium flex items-center gap-2">
                      {r.name ?? "—"}
                      {r.owner && <Badge>Owner</Badge>}
                    </span>
                    <span className="text-muted-foreground break-words">
                      {/* Let long addresses wrap after the @ instead of mid-word. */}
                      {r.email.split("@")[0]}
                      <wbr />@{r.email.split("@").slice(1).join("@")}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2 align-top min-w-52">
                  <RosterLink row={r} unlinked={unlinked} readOnly={r.owner && !meOwner} />
                </td>
                <td className="px-3 py-2 align-top min-w-40">
                  <SignIn row={r} />
                </td>
                <td className="px-3 py-2 align-top w-36 min-w-36">
                  <RoleSelect
                    row={r}
                    canGrantAdmin={meOwner}
                    disabled={r.id === meId || r.owner || (!meOwner && r.role === "admin")}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
