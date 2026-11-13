import { Form, redirect } from "react-router";
import { Button, Card } from "~/components/ui";
import { completeLogin, LoginError, safeRedirect } from "~/lib/auth.server";
import { consumeMagicLink } from "~/lib/magic-link.server";
import type { Route } from "./+types/auth.verify";
import { pageTitle } from "~/lib/school";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("Finish signing in") }];

// GET only renders a confirm button: email security scanners often pre-fetch
// links, which would otherwise burn the one-time token.
export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) throw redirect("/login?error=invalid-link");
  return { token, redirectTo: safeRedirect(url.searchParams.get("redirectTo")) };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const redirectTo = safeRedirect(String(form.get("redirectTo") ?? ""));
  const email = await consumeMagicLink(token);
  if (!email) throw redirect("/login?error=invalid-link");

  try {
    const { setCookie, role } = await completeLogin(request, { email, emailVerified: true, name: null });
    const to = role === "member" || role === "admin" ? redirectTo : "/pending";
    return redirect(to, { headers: { "Set-Cookie": setCookie } });
  } catch (e) {
    if (e instanceof LoginError) throw redirect(`/login?error=${e.code}`);
    throw e;
  }
}

export default function Verify({ loaderData }: Route.ComponentProps) {
  return (
    <Card className="max-w-md mx-auto p-6 flex flex-col gap-4 text-center">
      <h1 className="text-2xl font-semibold">Finish signing in</h1>
      <p className="text-muted-foreground">Click the button below to sign in on this device.</p>
      <Form method="post" className="flex flex-col">
        <input type="hidden" name="token" value={loaderData.token} />
        <input type="hidden" name="redirectTo" value={loaderData.redirectTo} />
        <Button type="submit">Sign in</Button>
      </Form>
    </Card>
  );
}
