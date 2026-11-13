import { env } from "cloudflare:workers";
import { data } from "react-router";
import { memberContext } from "~/context";
import { logActivity } from "~/lib/audit.server";
import { randomToken } from "~/lib/crypto.server";
import { classmateName } from "~/lib/format";
import type { Route } from "./+types/profile-photo";

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Accepts a small, client-resized JPEG for either the signed-in member's
 * profile (target=profile) or, for admins, a memorial photo (target=memoriam).
 */
export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(memberContext);
  const form = await request.formData();
  const file = form.get("photo");
  const target = form.get("target") === "memoriam" ? "memoriam" : "profile";

  if (!(file instanceof File) || file.size === 0) return data({ error: "No photo received." }, { status: 400 });
  if (file.size > MAX_BYTES) return data({ error: "Photo is too large." }, { status: 413 });
  if (file.type !== "image/jpeg") return data({ error: "Unexpected file type." }, { status: 415 });

  let oldKey: string | null = null;
  let classmateId = 0;
  let memoriamName = "";
  if (target === "memoriam") {
    if (user.role !== "admin") return data({ error: "Not allowed" }, { status: 403 });
    classmateId = Number(form.get("classmateId"));
    const row = await env.DB.prepare("SELECT memoriam_photo_key, first_name, last_name, nickname, current_last_name FROM classmates WHERE id = ?")
      .bind(classmateId)
      .first<{ memoriam_photo_key: string | null; first_name: string; last_name: string; nickname: string | null; current_last_name: string | null }>();
    if (!row) return data({ error: "Classmate not found" }, { status: 404 });
    oldKey = row.memoriam_photo_key;
    memoriamName = classmateName(row);
  } else {
    const row = await env.DB.prepare("SELECT photo_key FROM profiles WHERE user_id = ?")
      .bind(user.id)
      .first<{ photo_key: string | null }>();
    oldKey = row?.photo_key ?? null;
  }

  const key = `${target === "memoriam" ? "memoriam" : "profiles"}/${randomToken(18)}.jpg`;
  await env.MEDIA.put(key, file, { httpMetadata: { contentType: "image/jpeg" } });

  if (target === "memoriam") {
    await env.DB.prepare("UPDATE classmates SET memoriam_photo_key = ?, updated_at = unixepoch() WHERE id = ?")
      .bind(key, classmateId)
      .run();
    await logActivity(user, "roster.memorial-photo", `Changed the memorial photo for ${memoriamName}`, { type: "classmate", id: classmateId });
  } else {
    await env.DB.prepare(
      `INSERT INTO profiles (user_id, photo_key) VALUES (?, ?)
       ON CONFLICT (user_id) DO UPDATE SET photo_key = excluded.photo_key, updated_at = unixepoch()`,
    )
      .bind(user.id, key)
      .run();
  }
  if (oldKey) await env.MEDIA.delete(oldKey);
  return { ok: true, url: `/files/${key}` };
}
