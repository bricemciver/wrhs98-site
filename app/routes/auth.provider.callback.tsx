import { redirect } from "react-router";
import { completeLogin, LoginError, safeRedirect } from "~/lib/auth.server";
import { clearCookie, readCookie } from "~/lib/cookies.server";
import { safeEqual } from "~/lib/crypto.server";
import { exchangeCode, isProvider } from "~/lib/oauth.server";
import type { Route } from "./+types/auth.provider.callback";

export async function loader({ request, params }: Route.LoaderArgs) {
  const provider = params.provider;
  if (!isProvider(provider)) throw redirect("/login?error=provider");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const storedState = readCookie(request, "oauth_state");
  const verifier = readCookie(request, "oauth_verifier");
  const redirectTo = safeRedirect(readCookie(request, "oauth_redirect"));

  const headers = new Headers();
  for (const name of ["oauth_state", "oauth_verifier", "oauth_redirect"]) {
    headers.append("Set-Cookie", clearCookie(request, name, "/auth"));
  }
  const fail = (code: string) => {
    headers.set("Location", `/login?error=${code}`);
    return new Response(null, { status: 302, headers });
  };

  if (!code || !state || !storedState || !verifier || !safeEqual(state, storedState)) return fail("state");

  try {
    const identity = await exchangeCode(request, provider, code, verifier);
    const { setCookie, role } = await completeLogin(request, identity);
    headers.append("Set-Cookie", setCookie);
    headers.set("Location", role === "member" || role === "admin" ? redirectTo : "/pending");
    return new Response(null, { status: 302, headers });
  } catch (e) {
    if (e instanceof LoginError) return fail(e.code);
    console.error(`[auth] ${provider} callback failed`, e);
    return fail("provider");
  }
}
