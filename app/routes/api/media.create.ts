import { env } from "cloudflare:workers";
import { data } from "react-router";
import { z } from "zod";
import { memberContext } from "~/context";
import {
  DERIVED_OVERHEAD,
  MAX_PHOTO_BYTES,
  MAX_UPLOADS_PER_DAY,
  MAX_VIDEO_BYTES,
  PHOTO_TYPES,
  storageQuotaBytes,
  storageUsedBytes,
  VIDEO_TYPES,
} from "~/lib/media.server";
import type { Route } from "./+types/media.create";

const schema = z.object({
  albumId: z.number().int().positive(),
  kind: z.enum(["photo", "video"]),
  contentType: z.string().max(100),
  originalName: z.string().max(200).optional(),
  caption: z.string().max(500).optional(),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
  size: z.number().int().positive(),
});

/** Step 1 of an upload: reserve a media row. Then PUT each variant, then POST {intent:"complete"}. */
export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(memberContext);
  if (request.method !== "POST") return data({ error: "Method not allowed" }, { status: 405 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return data({ error: "Invalid upload details." }, { status: 400 });
  const m = parsed.data;

  const allowedTypes = m.kind === "photo" ? PHOTO_TYPES : VIDEO_TYPES;
  if (!allowedTypes.includes(m.contentType)) {
    return data({ error: m.kind === "photo" ? "Use JPEG, PNG, WebP, GIF, or HEIC photos." : "Use MP4, MOV, or WebM videos." }, { status: 400 });
  }
  const max = m.kind === "photo" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
  if (m.size > max) {
    return data({ error: `That file is too large (limit ${Math.round(max / 1024 / 1024)} MB).` }, { status: 413 });
  }

  const [album, recent] = await env.DB.batch<{ n: number }>([
    env.DB.prepare("SELECT 1 AS n FROM albums WHERE id = ?").bind(m.albumId),
    env.DB.prepare("SELECT COUNT(*) AS n FROM media WHERE uploader_id = ? AND created_at > unixepoch() - 86400").bind(user.id),
  ]);
  if (album.results.length === 0) return data({ error: "Album not found." }, { status: 404 });
  if ((recent.results[0]?.n ?? 0) >= MAX_UPLOADS_PER_DAY) {
    return data({ error: "Daily upload limit reached. Please try again tomorrow." }, { status: 429 });
  }
  if ((await storageUsedBytes()) + m.size * DERIVED_OVERHEAD > storageQuotaBytes()) {
    return data(
      { error: "The class photo storage is full. Please let a class admin know so they can make room." },
      { status: 507 },
    );
  }

  const row = await env.DB.prepare(
    `INSERT INTO media (album_id, uploader_id, kind, content_type, original_name, caption, width, height, size_bytes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(m.albumId, user.id, m.kind, m.contentType, m.originalName ?? null, m.caption?.trim() || null, m.width ?? null, m.height ?? null, m.size)
    .first<{ id: number }>();
  return { id: row!.id };
}
