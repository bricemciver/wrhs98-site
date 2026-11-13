export interface CookieOptions {
  maxAge?: number;
  path?: string;
  httpOnly?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
}

function isSecure(request: Request) {
  return new URL(request.url).protocol === "https:";
}

export function serializeCookie(
  request: Request,
  name: string,
  value: string,
  { maxAge, path = "/", httpOnly = true, sameSite = "Lax" }: CookieOptions = {},
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  if (httpOnly) parts.push("HttpOnly");
  if (isSecure(request)) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(request: Request, name: string, path = "/"): string {
  return serializeCookie(request, name, "", { maxAge: 0, path });
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
