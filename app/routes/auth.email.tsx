import { data } from "react-router";
import { z } from "zod";
import { safeRedirect } from "~/lib/auth.server";
import { sendMagicLink } from "~/lib/magic-link.server";
import type { Route } from "./+types/auth.email";

const schema = z.object({ email: z.email().max(254) });

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const parsed = schema.safeParse({ email: String(form.get("email") ?? "").trim().toLowerCase() });
  if (!parsed.success) return data({ error: "Please enter a valid email address." }, { status: 400 });

  const redirectTo = safeRedirect(String(form.get("redirectTo") ?? ""));
  const result = await sendMagicLink(request, parsed.data.email, redirectTo);
  if (result === "rate-limited") {
    return data({ error: "Too many sign-in links requested. Please wait 15 minutes and try again." }, { status: 429 });
  }
  return { sent: true as const };
}
