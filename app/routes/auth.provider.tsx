import { redirect } from "react-router";
import { safeRedirect } from "~/lib/auth.server";
import { serializeCookie } from "~/lib/cookies.server";
import { createAuthorization, enabledProviders, isProvider } from "~/lib/oauth.server";
import type { Route } from "./+types/auth.provider";

const TEN_MINUTES = 600;

export function loader({ request, params }: Route.LoaderArgs) {
  const provider = params.provider;
  if (!isProvider(provider) || !enabledProviders().includes(provider)) throw redirect("/login?error=provider");

  const redirectTo = safeRedirect(new URL(request.url).searchParams.get("redirectTo"));
  const { url, state, codeVerifier } = createAuthorization(request, provider);
  const opts = { maxAge: TEN_MINUTES, path: "/auth" };

  const headers = new Headers({ Location: url.toString() });
  headers.append("Set-Cookie", serializeCookie(request, "oauth_state", state, opts));
  headers.append("Set-Cookie", serializeCookie(request, "oauth_verifier", codeVerifier, opts));
  headers.append("Set-Cookie", serializeCookie(request, "oauth_redirect", redirectTo, opts));
  return new Response(null, { status: 302, headers });
}
