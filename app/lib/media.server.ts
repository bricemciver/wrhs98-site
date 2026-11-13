import { env } from "cloudflare:workers";

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const DERIVED_TYPES = ["image/jpeg", "image/webp"];

export const MAX_PHOTO_BYTES = 30 * 1024 * 1024;
// Workers on the Free/Pro plans accept request bodies up to 100 MB.
export const MAX_VIDEO_BYTES = 95 * 1024 * 1024;
export const MAX_DERIVED_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOADS_PER_DAY = 300;

/**
 * Hard cap on stored media so R2 stays inside its free tier (10 GB-month).
 * Cloudflare has no spending cap, so the app enforces it. Profile and memorial
 * photos aren't counted here; the gap between the quota and 10 GB covers them.
 */
export function storageQuotaBytes(): number {
  const gb = Number(env.MEDIA_QUOTA_GB);
  return (Number.isFinite(gb) && gb > 0 ? gb : 9) * 1024 ** 3;
}

/** Photos also get a display copy and a thumbnail; reserve room for them up front. */
export const DERIVED_OVERHEAD = 1.25;

/** Bytes stored or reserved by in-progress uploads. */
export async function storageUsedBytes(): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(CASE WHEN status = 'uploading' THEN size_bytes * ? ELSE size_bytes END), 0) AS used FROM media`,
  )
    .bind(DERIVED_OVERHEAD)
    .first<{ used: number }>();
  return row?.used ?? 0;
}

export type Variant = "original" | "display" | "thumb";
export const isVariant = (v: string | undefined): v is Variant => v === "original" || v === "display" || v === "thumb";

export const mediaKey = (id: number, variant: Variant) => `media/${id}/${variant}`;

export interface MediaRow {
  id: number;
  album_id: number;
  uploader_id: number | null;
  kind: "photo" | "video";
  content_type: string;
  original_name: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  has_display: number;
  has_thumb: number;
  status: "uploading" | "ready" | "hidden";
  created_at: number;
}

export function getMedia(id: number) {
  return env.DB.prepare("SELECT * FROM media WHERE id = ?").bind(id).first<MediaRow>();
}

export async function deleteMedia(id: number) {
  await env.MEDIA.delete([mediaKey(id, "original"), mediaKey(id, "display"), mediaKey(id, "thumb")]);
  await env.DB.prepare("DELETE FROM media WHERE id = ?").bind(id).run();
}

/**
 * Serves an R2 object with Range support (needed for video seeking) and
 * headers that stop user uploads from ever executing as active content.
 */
export async function serveObject(request: Request, key: string, contentType?: string): Promise<Response> {
  const etag = request.headers.get("If-None-Match");
  const range = request.headers.get("Range");
  const object = await env.MEDIA.get(key, {
    range: range ? request.headers : undefined,
    onlyIf: etag ? { etagDoesNotMatch: etag.replace(/^W\//, "").replace(/"/g, "") } : undefined,
  });
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (contentType) headers.set("Content-Type", contentType);
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  // Keys are immutable (a new upload gets a new id), so cache aggressively,
  // but only in the viewer's own browser: never in shared caches.
  headers.set("Cache-Control", "private, max-age=31536000, immutable");
  headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
  headers.set("X-Content-Type-Options", "nosniff");

  if (!("body" in object)) return new Response(null, { status: 304, headers });

  if (range && object.range && "offset" in object.range) {
    const offset = object.range.offset ?? 0;
    const length = object.range.length ?? object.size - offset;
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("Content-Length", String(length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { headers });
}
