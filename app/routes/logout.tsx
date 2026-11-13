import { redirect } from "react-router";
import { endPreviewCookie } from "~/lib/preview.server";
import { destroySession } from "~/lib/session.server";
import type { Route } from "./+types/logout";

export async function action({ request }: Route.ActionArgs) {
  const headers = new Headers();
  headers.append("Set-Cookie", await destroySession(request));
  headers.append("Set-Cookie", endPreviewCookie(request));
  return redirect("/", { headers });
}

export function loader() {
  return redirect("/");
}
