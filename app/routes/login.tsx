import { Mail } from "lucide-react";
import { redirect, useFetcher } from "react-router";
import { Alert, Button, Card, Field, Input } from "~/components/ui";
import { userContext } from "~/context";
import { safeRedirect } from "~/lib/auth.server";
import { enabledProviders } from "~/lib/oauth.server";
import { isMember } from "~/lib/types";
import type { Route } from "./+types/login";
import type { action as emailAction } from "./auth.email";
import { pageTitle, SITE_NAME } from "~/lib/school";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("Sign in") }];

const ERRORS: Record<string, string> = {
  "email-conflict":
    "That email is already linked to an account, but this provider couldn't confirm you own it. Please sign in the way you did before (or use an email link).",
  denied: "This account isn't able to access the site. If you think that's a mistake, contact a class admin.",
  state: "Your sign-in session expired. Please try again.",
  provider: "Sign-in with that provider failed. Please try again or use an email link.",
  "invalid-link": "That sign-in link is invalid or has expired. Request a new one below.",
};

export function loader({ request, context }: Route.LoaderArgs) {
  const user = context.get(userContext);
  const url = new URL(request.url);
  const redirectTo = safeRedirect(url.searchParams.get("redirectTo"));
  if (isMember(user)) throw redirect(redirectTo);
  if (user) throw redirect("/pending");
  const error = url.searchParams.get("error");
  return {
    providers: enabledProviders(),
    redirectTo,
    error: error ? (ERRORS[error] ?? ERRORS.provider) : null,
  };
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path fill="#F25022" d="M1 1h10.5v10.5H1z" />
      <path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z" />
      <path fill="#00A4EF" d="M1 12.5h10.5V23H1z" />
      <path fill="#FFB900" d="M12.5 12.5H23V23H12.5z" />
    </svg>
  );
}

export default function Login({ loaderData }: Route.ComponentProps) {
  const { providers, redirectTo, error } = loaderData;
  const fetcher = useFetcher<typeof emailAction>();
  const sent = fetcher.data && "sent" in fetcher.data && fetcher.data.sent;
  const formError = fetcher.data && "error" in fetcher.data ? fetcher.data.error : undefined;
  const qs = redirectTo !== "/" ? `?redirectTo=${encodeURIComponent(redirectTo)}` : "";

  return (
    <div className="max-w-md mx-auto flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-semibold">Sign in</h1>
        <p className="text-muted-foreground">
          This site is just for the {SITE_NAME}. Sign in, and if we can&apos;t match you to the class roster automatically,
          a class admin will confirm you.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="p-6 flex flex-col gap-4">
        {providers.includes("google") && (
          <a href={`/auth/google${qs}`} className="inline-flex h-11 items-center justify-center gap-3 rounded-md border border-input bg-card font-medium hover:bg-muted">
            <GoogleIcon />
            Continue with Google
          </a>
        )}
        {providers.includes("microsoft") && (
          <a href={`/auth/microsoft${qs}`} className="inline-flex h-11 items-center justify-center gap-3 rounded-md border border-input bg-card font-medium hover:bg-muted">
            <MicrosoftIcon />
            Continue with Microsoft
          </a>
        )}
        {providers.length > 0 && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
        )}

        {sent ? (
          <Alert tone="success">
            Check your email. If the address is valid, we sent a sign-in link that works for 15 minutes.
          </Alert>
        ) : (
          <fetcher.Form method="post" action="/auth/email" className="flex flex-col gap-3">
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <Field label="Email address" htmlFor="email" error={formError}>
              <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
            </Field>
            <Button type="submit" variant="primary" disabled={fetcher.state !== "idle"}>
              <Mail className="size-5" aria-hidden="true" />
              {fetcher.state !== "idle" ? "Sending…" : "Email me a sign-in link"}
            </Button>
          </fetcher.Form>
        )}
      </Card>
    </div>
  );
}
