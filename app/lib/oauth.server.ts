import { env } from "cloudflare:workers";
import { decodeIdToken, generateCodeVerifier, generateState, Google, MicrosoftEntraId } from "arctic";
import type { VerifiedIdentity } from "./auth.server";

export type Provider = "google" | "microsoft";

// Personal Microsoft accounts (outlook.com, hotmail.com, live.com) live in this
// tenant, and their email claim is verified by Microsoft. Work/school tenants
// let admins set arbitrary email claims, so those are treated as unverified.
const MSA_CONSUMER_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";

export function enabledProviders(): Provider[] {
  const out: Provider[] = [];
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) out.push("google");
  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) out.push("microsoft");
  return out;
}

export function isProvider(p: string | undefined): p is Provider {
  return p === "google" || p === "microsoft";
}

function callbackUrl(request: Request, provider: Provider) {
  return new URL(`/auth/${provider}/callback`, request.url).toString();
}

function client(request: Request, provider: Provider) {
  const redirect = callbackUrl(request, provider);
  if (provider === "google") {
    return new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirect);
  }
  return new MicrosoftEntraId("common", env.MICROSOFT_CLIENT_ID, env.MICROSOFT_CLIENT_SECRET, redirect);
}

export function createAuthorization(request: Request, provider: Provider) {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const scopes = ["openid", "email", "profile"];
  const url = client(request, provider).createAuthorizationURL(state, codeVerifier, scopes);
  if (provider === "google") url.searchParams.set("prompt", "select_account");
  if (provider === "microsoft") url.searchParams.set("prompt", "select_account");
  return { url, state, codeVerifier };
}

interface IdTokenClaims {
  sub: string;
  oid?: string;
  tid?: string;
  email?: string;
  email_verified?: boolean;
  preferred_username?: string;
  name?: string;
  family_name?: string;
}

/**
 * Exchanges the code for tokens. The ID token comes straight from the
 * provider's token endpoint over TLS (authenticated with our client secret),
 * so per OIDC Core §3.1.3.7 its signature does not need separate validation.
 */
export async function exchangeCode(
  request: Request,
  provider: Provider,
  code: string,
  codeVerifier: string,
): Promise<VerifiedIdentity> {
  const tokens = await client(request, provider).validateAuthorizationCode(code, codeVerifier);
  const claims = decodeIdToken(tokens.idToken()) as IdTokenClaims;

  if (provider === "google") {
    if (!claims.email) throw new Error("Google did not return an email address");
    return {
      provider,
      providerUserId: claims.sub,
      email: claims.email.toLowerCase(),
      emailVerified: claims.email_verified === true,
      name: claims.name ?? null,
      familyName: claims.family_name ?? null,
    };
  }

  const email = (claims.email ?? claims.preferred_username ?? "").toLowerCase();
  if (!email.includes("@")) throw new Error("Microsoft did not return an email address");
  return {
    provider,
    // oid+tid uniquely identifies a Microsoft identity across tenants.
    providerUserId: `${claims.tid ?? ""}:${claims.oid ?? claims.sub}`,
    email,
    emailVerified: claims.tid === MSA_CONSUMER_TENANT && !!claims.email,
    name: claims.name ?? null,
    familyName: claims.family_name ?? null,
  };
}
