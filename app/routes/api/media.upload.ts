import { env } from "cloudflare:workers";
import { data } from "react-router";
import { memberContext } from "~/context";
import { intParam } from "~/lib/http.server";
import {
  DERIVED_TYPES,
  getMedia,
  isVariant,
  MAX_DERIVED_BYTES,
  MAX_PHOTO_BYTES,
  MAX_VIDEO_BYTES,
  mediaKey,
} from "~/lib/media.server";
import type { Route } from "./+types/media.upload";

/** Step 2: stream one variant (original | display | thumb) straight into R2. */
export async function action({ request, params, context }: Route.ActionArgs) {
  const user = context.get(memberContext);
  if (request.method !== "PUT") return data({ error: "Method not allowed" }, { status: 405 });

  const id = intParam(params.id);
  const variant = params.variant;
  if (!isVariant(variant)) return data({ error: "Unknown variant" }, { status: 404 });

  const media = await getMedia(id);
  if (!media || media.uploader_id !== user.id || media.status !== "uploading") {
    return data({ error: "Upload not found" }, { status: 404 });
  }
  if (variant === "display" && media.kind !== "photo") return data({ error: "Videos have no display variant" }, { status: 400 });

  const contentType = (request.headers.get("Content-Type") ?? "").split(";")[0].trim();
  const length = Number(request.headers.get("Content-Length"));
  const max = variant === "original" ? (media.kind === "photo" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES) : MAX_DERIVED_BYTES;
  if (!Number.isFinite(length) || length <= 0) return data({ error: "Content-Length required" }, { status: 411 });
  if (length > max) return data({ error: "File too large" }, { status: 413 });
  if (variant === "original" && length !== media.size_bytes) {
    return data({ error: "File size doesn't match the upload request" }, { status: 400 });
  }
  if (variant === "original" ? contentType !== media.content_type : !DERIVED_TYPES.includes(contentType)) {
    return data({ error: "Unexpected content type" }, { status: 415 });
  }
  if (!request.body) return data({ error: "Empty body" }, { status: 400 });

  await env.MEDIA.put(mediaKey(id, variant), request.body, {
    httpMetadata: { contentType },
    customMetadata: { uploader: String(user.id) },
  });
  if (variant !== "original") {
    await env.DB.prepare(`UPDATE media SET ${variant === "display" ? "has_display" : "has_thumb"} = 1 WHERE id = ?`)
      .bind(id)
      .run();
  }
  return { ok: true };
}
