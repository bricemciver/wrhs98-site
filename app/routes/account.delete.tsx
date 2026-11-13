import { env } from "cloudflare:workers";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import { Alert, Button, ButtonLink, Card, Checkbox, Field, Input } from "~/components/ui";
import { userContext } from "~/context";
import { activityStmt } from "~/lib/audit.server";
import { isOwnerEmail } from "~/lib/auth.server";
import { clearCookie } from "~/lib/cookies.server";
import { classmateName } from "~/lib/format";
import { str } from "~/lib/http.server";
import { deleteMedia } from "~/lib/media.server";
import { endPreviewCookie } from "~/lib/preview.server";
import { SESSION_COOKIE } from "~/lib/session.server";
import type { SessionUser } from "~/lib/types";
import type { Route } from "./+types/account.delete";
import { pageTitle } from "~/lib/school";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("Delete my account") }];

const CONFIRM_WORD = "delete";

/**
 * Who may delete their own account. Denied accounts can't: deleting would let
 * them sign in again as a fresh pending account. Owners can't either, because
 * ADMIN_EMAILS would make them an admin again the next time they sign in.
 */
function blockedReason(user: SessionUser): string | null {
  if (user.previewing) return "You're previewing the site as a member. Exit the preview to manage your own account.";
  if (isOwnerEmail(user.email)) {
    return "You're a site owner, so your account can't be deleted here. Remove your address from the ADMIN_EMAILS setting first.";
  }
  return null;
}

async function loadAccount(user: SessionUser) {
  const row = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM media WHERE uploader_id = ?1 AND status != 'uploading') AS uploads,
            (SELECT photo_key FROM profiles WHERE user_id = ?1) AS photo_key,
            c.first_name, c.last_name, c.nickname, c.current_last_name
       FROM users u LEFT JOIN classmates c ON c.id = u.classmate_id WHERE u.id = ?1`,
  )
    .bind(user.id)
    .first<{
      uploads: number;
      photo_key: string | null;
      first_name: string | null;
      last_name: string | null;
      nickname: string | null;
      current_last_name: string | null;
    }>();
  const rosterName =
    row?.first_name && row.last_name ? classmateName({ ...row, first_name: row.first_name, last_name: row.last_name }) : null;
  return { uploads: row?.uploads ?? 0, photoKey: row?.photo_key ?? null, rosterName };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = context.get(userContext);
  if (!user) {
    if (new URL(request.url).searchParams.get("done") === "1") return { done: true as const };
    throw redirect("/login?redirectTo=/account/delete");
  }
  if (user.role === "denied") throw redirect("/pending");
  const { uploads, rosterName } = await loadAccount(user);
  return {
    done: false as const,
    email: user.email,
    member: user.role === "member" || user.role === "admin",
    uploads,
    rosterName,
    blocked: blockedReason(user),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(userContext);
  if (!user) throw redirect("/login");
  if (user.role === "denied") throw redirect("/pending");
  const blocked = blockedReason(user);
  if (blocked) return data({ error: blocked }, { status: 403 });
  const form = await request.formData();
  if (str(form, "confirm").toLowerCase() !== CONFIRM_WORD) {
    return data({ error: `Type “${CONFIRM_WORD}” in the box to confirm.` }, { status: 400 });
  }
  const removeUploads = form.get("delete_uploads") === "on";
  const { uploads, photoKey, rosterName } = await loadAccount(user);

  if (removeUploads) {
    const media = await env.DB.prepare("SELECT id FROM media WHERE uploader_id = ?").bind(user.id).all<{ id: number }>();
    for (const m of media.results) await deleteMedia(m.id);
  }
  if (photoKey) await env.MEDIA.delete(photoKey);

  // The log keeps the name admins knew them by, not their email address.
  const label = user.name?.trim() || rosterName || "A member";
  const details = [
    rosterName ? `${rosterName} stays on the roster, unlinked` : null,
    uploads > 0 ? (removeUploads ? `their ${uploads} uploads were deleted too` : `their ${uploads} uploads were kept`) : null,
  ].filter(Boolean);
  await env.DB.batch([
    activityStmt({ id: user.id, name: label, email: label }, "account.delete", `Deleted their own account${details.length ? ` (${details.join("; ")})` : ""}`, {
      type: "user",
      id: user.id,
    }),
    // access_requests.reviewed_by has no ON DELETE rule; clear it so the delete isn't blocked.
    env.DB.prepare("UPDATE access_requests SET reviewed_by = NULL WHERE reviewed_by = ?").bind(user.id),
    env.DB.prepare("DELETE FROM magic_links WHERE email = ?").bind(user.email),
    // Cascades to sessions, sign-in links, the profile, and their access request.
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
  ]);

  const headers = new Headers();
  headers.append("Set-Cookie", clearCookie(request, SESSION_COOKIE));
  headers.append("Set-Cookie", endPreviewCookie(request));
  return redirect("/account/delete?done=1", { headers });
}

export default function DeleteAccount({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state === "submitting";

  if (loaderData.done) {
    return (
      <Card className="max-w-lg mx-auto p-6 flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Your account is deleted</h1>
        <p className="text-muted-foreground">
          Your profile and sign-in details are gone. If you ever want to come back, just sign in again and we&apos;ll set you up
          from scratch.
        </p>
        <div>
          <ButtonLink to="/" variant="secondary">
            Back to the home page
          </ButtonLink>
        </div>
      </Card>
    );
  }

  const { email, member, uploads, rosterName, blocked } = loaderData;
  const error = actionData && "error" in actionData ? actionData.error : null;
  return (
    <div className="max-w-lg mx-auto flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Delete my account</h1>
        <p className="text-muted-foreground">
          This permanently deletes the account for <strong>{email}</strong>. It can&apos;t be undone.
        </p>
      </div>

      <Card className="p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold">What gets deleted</h2>
          <ul className="list-disc pl-5 text-sm flex flex-col gap-1">
            <li>Your profile: photo, city, contact email, phone, links, and what you&apos;ve been up to</li>
            <li>Your Google, Microsoft, and email sign-ins for this site</li>
            {!member && <li>Your request to join</li>}
          </ul>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold">What stays</h2>
          <ul className="list-disc pl-5 text-sm flex flex-col gap-1">
            {rosterName && (
              <li>
                Your class roster entry, {rosterName}, stays. The roster is our record of who was in the class; it just
                won&apos;t be linked to an account anymore.
              </li>
            )}
            <li>Tips and classmate suggestions you sent, without your name on them</li>
            {uploads > 0 && <li>Your {uploads === 1 ? "photo or video" : `${uploads} photos and videos`}, unless you check the box below</li>}
          </ul>
        </div>

        {blocked ? (
          <Alert>{blocked}</Alert>
        ) : (
          <Form method="post" className="flex flex-col gap-4 border-t pt-4">
            {uploads > 0 && (
              <Checkbox
                name="delete_uploads"
                label={`Also delete the ${uploads === 1 ? "photo or video" : `${uploads} photos and videos`} I uploaded`}
              />
            )}
            <Field label={`Type “${CONFIRM_WORD}” to confirm`} htmlFor="confirm">
              <Input id="confirm" name="confirm" required autoComplete="off" autoCapitalize="none" spellCheck={false} />
            </Field>
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="destructive" disabled={busy}>
                {busy ? "Deleting…" : "Delete my account"}
              </Button>
              <Link to={member ? "/profile" : "/pending"} className="self-center text-sm text-primary underline">
                Never mind
              </Link>
            </div>
          </Form>
        )}
      </Card>
    </div>
  );
}
