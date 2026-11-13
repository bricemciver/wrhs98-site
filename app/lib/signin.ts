/** Ways to sign in, as stored in users.signup_method / last_login_method and oauth_accounts.provider. */
export const SIGNIN_METHODS = {
  google: "Google",
  microsoft: "Microsoft",
  email: "Email link",
} as const;

export type SigninMethod = keyof typeof SIGNIN_METHODS;

export function signinLabel(method: string | null | undefined): string {
  return method && Object.hasOwn(SIGNIN_METHODS, method) ? SIGNIN_METHODS[method as SigninMethod] : "Unknown";
}
