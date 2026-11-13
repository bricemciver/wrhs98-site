import { data } from "react-router";

/** Throw a 404 response from a loader/action. */
export function notFound(message = "Not found"): never {
  throw data(message, { status: 404, statusText: message });
}

export function forbidden(message = "Forbidden"): never {
  throw data(message, { status: 403, statusText: message });
}

export function badRequest<T>(body: T) {
  return data(body, { status: 400 });
}

export function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function optStr(form: FormData, key: string): string | null {
  return str(form, key) || null;
}

export function bool(form: FormData, key: string): number {
  return form.get(key) === "on" || form.get(key) === "1" ? 1 : 0;
}

export function intParam(v: string | undefined): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return n;
}
