import { redirect } from "react-router";
import { userContext } from "~/context";
import { safeRedirect } from "~/lib/auth.server";
import { forbidden, str } from "~/lib/http.server";
import { endPreviewCookie, startPreviewCookie } from "~/lib/preview.server";
import type { Route } from "./+types/preview";

/** Starts or ends "preview as a member" for an admin. */
export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(userContext);
  const form = await request.formData();
  const to = safeRedirect(str(form, "redirectTo"));
  if (str(form, "intent") === "stop") {
    return redirect(to, { headers: { "Set-Cookie": endPreviewCookie(request) } });
  }
  // Only a real admin (not one already previewing) can start a preview.
  if (user?.role !== "admin") forbidden("Admins only.");
  return redirect(to, { headers: { "Set-Cookie": startPreviewCookie(request) } });
}

export function loader() {
  return redirect("/");
}
