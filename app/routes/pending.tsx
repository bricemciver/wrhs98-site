import { env } from "cloudflare:workers";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import { Alert, Button, Card, Field, Input, Textarea } from "~/components/ui";
import { userContext } from "~/context";
import { str } from "~/lib/http.server";
import { isMember } from "~/lib/types";
import type { Route } from "./+types/pending";
import { pageTitle } from "~/lib/school";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("Request access") }];

interface RequestRow {
  name_in_school: string;
  current_name: string | null;
  message: string | null;
  status: "open" | "approved" | "denied";
  created_at: number;
}

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext);
  if (!user) throw redirect("/login");
  if (isMember(user)) throw redirect("/");
  const request = await env.DB.prepare(
    "SELECT name_in_school, current_name, message, status, created_at FROM access_requests WHERE user_id = ?",
  )
    .bind(user.id)
    .first<RequestRow>();
  return { email: user.email, denied: user.role === "denied", request };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(userContext);
  if (!user) throw redirect("/login");
  if (user.role !== "pending") throw redirect("/");
  const form = await request.formData();
  const nameInSchool = str(form, "name_in_school");
  const currentName = str(form, "current_name");
  const message = str(form, "message");
  if (!nameInSchool) return data({ error: "Please tell us the name you went by in high school." }, { status: 400 });
  if (nameInSchool.length > 120 || currentName.length > 120 || message.length > 1000) {
    return data({ error: "That's a bit long. Please shorten your answers." }, { status: 400 });
  }
  await env.DB.prepare(
    `INSERT INTO access_requests (user_id, name_in_school, current_name, message) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET name_in_school = excluded.name_in_school,
       current_name = excluded.current_name, message = excluded.message, status = 'open', created_at = unixepoch()`,
  )
    .bind(user.id, nameInSchool, currentName || null, message || null)
    .run();
  await env.DB.prepare("UPDATE users SET name = COALESCE(name, ?) WHERE id = ?")
    .bind(currentName || nameInSchool, user.id)
    .run();
  return { ok: true };
}

export default function Pending({ loaderData, actionData }: Route.ComponentProps) {
  const { email, denied, request } = loaderData;
  const busy = useNavigation().state === "submitting";
  const error = actionData && "error" in actionData ? actionData.error : null;

  if (denied) {
    return (
      <Card className="max-w-lg mx-auto p-6 flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Access not available</h1>
        <p className="text-muted-foreground">
          The account <strong>{email}</strong> wasn&apos;t approved for the class site. If you think this is a
          mistake, please reach out to a class admin.
        </p>
      </Card>
    );
  }

  return (
    <div className="max-w-lg mx-auto flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Almost there</h1>
        <p className="text-muted-foreground">
          You&apos;re signed in as <strong>{email}</strong>, but we couldn&apos;t automatically match that address to
          the class roster. Tell us who you are, and a class admin will approve you, usually within a day or two.
        </p>
      </div>

      {request?.status === "open" && (
        <Alert tone="success">
          Thanks, {request.name_in_school}! Your request is waiting for an admin. Once it&apos;s approved, just reload
          this page to get in. You can update your request below.
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      <Card className="p-6">
        <Form method="post" className="flex flex-col gap-4">
          <Field label="Your name in high school" htmlFor="name_in_school" hint="First and last name as it appeared in the yearbook.">
            <Input id="name_in_school" name="name_in_school" required maxLength={120} defaultValue={request?.name_in_school ?? ""} />
          </Field>
          <Field label="Your name today (if different)" htmlFor="current_name">
            <Input id="current_name" name="current_name" maxLength={120} defaultValue={request?.current_name ?? ""} />
          </Field>
          <Field
            label="Anything that helps us recognize you"
            htmlFor="message"
            hint="A homeroom teacher, a club or team, or a classmate who can vouch for you."
          >
            <Textarea id="message" name="message" maxLength={1000} defaultValue={request?.message ?? ""} />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? "Sending…" : request ? "Update request" : "Request access"}
          </Button>
        </Form>
      </Card>
      <p className="text-sm text-muted-foreground">
        Changed your mind?{" "}
        <Link to="/account/delete" className="text-primary underline">
          Delete this account
        </Link>
      </p>
    </div>
  );
}
