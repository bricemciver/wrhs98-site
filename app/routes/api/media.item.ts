import { env } from "cloudflare:workers";
import { data } from "react-router";
import { z } from "zod";
import { memberContext } from "~/context";
import { logActivity } from "~/lib/audit.server";
import { intParam } from "~/lib/http.server";
import { deleteMedia, getMedia, mediaKey } from "~/lib/media.server";
import type { Route } from "./+types/media.item";

const schema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("complete") }),
  z.object({ intent: z.literal("delete") }),
  z.object({ intent: z.literal("caption"), caption: z.string().max(500) }),
  z.object({ intent: z.literal("hide") }),
  z.object({ intent: z.literal("unhide") }),
]);

async function readBody(request: Request): Promise<unknown> {
  if ((request.headers.get("Content-Type") ?? "").includes("application/json")) {
    return request.json().catch(() => null);
  }
  return Object.fromEntries(await request.formData());
}

/** Step 3 (complete) plus caption edits, deletion, and admin moderation. */
export async function action({ request, params, context }: Route.ActionArgs) {
  const user = context.get(memberContext);
  const id = intParam(params.id);
  const parsed = schema.safeParse(await readBody(request));
  if (!parsed.success) return data({ error: "Invalid request" }, { status: 400 });

  const media = await getMedia(id);
  if (!media) return data({ error: "Not found" }, { status: 404 });
  const isOwner = media.uploader_id === user.id;
  const isAdmin = user.role === "admin";
  const body = parsed.data;
  /** Records moderation of someone else's upload; members managing their own uploads aren't logged. */
  const logModeration = async (action: "media.delete" | "media.hide" | "media.unhide" | "media.caption", verb: string) => {
    if (isOwner) return;
    const info = await env.DB.prepare(
      `SELECT a.title, COALESCE(u.name, u.email) AS uploader FROM albums a LEFT JOIN users u ON u.id = ? WHERE a.id = ?`,
    )
      .bind(media.uploader_id, media.album_id)
      .first<{ title: string; uploader: string | null }>();
    await logActivity(
      user,
      action,
      `${verb} a ${media.kind} by ${info?.uploader ?? "a former member"} in “${info?.title ?? "an album"}”`,
      { type: "media", id },
    );
  };

  switch (body.intent) {
    case "complete": {
      if (!isOwner || media.status !== "uploading") return data({ error: "Not found" }, { status: 404 });
      const heads = await Promise.all(
        (["original", "display", "thumb"] as const).map((v) => env.MEDIA.head(mediaKey(id, v))),
      );
      if (!heads[0]) return data({ error: "Original file missing" }, { status: 400 });
      // Stored total across all variants, so quota accounting is exact.
      const total = heads.reduce((sum, h) => sum + (h?.size ?? 0), 0);
      await env.DB.prepare("UPDATE media SET status = 'ready', size_bytes = ? WHERE id = ?").bind(total, id).run();
      return { ok: true, id };
    }
    case "delete": {
      if (!isOwner && !isAdmin) return data({ error: "Not allowed" }, { status: 403 });
      await logModeration("media.delete", "Deleted");
      await deleteMedia(id);
      return { ok: true, deleted: id };
    }
    case "caption": {
      if (!isOwner && !isAdmin) return data({ error: "Not allowed" }, { status: 403 });
      await env.DB.prepare("UPDATE media SET caption = ? WHERE id = ?").bind(body.caption.trim() || null, id).run();
      await logModeration("media.caption", "Edited the caption on");
      return { ok: true };
    }
    case "hide":
    case "unhide": {
      if (!isAdmin) return data({ error: "Not allowed" }, { status: 403 });
      if (media.status === "uploading") return data({ error: "Upload not finished" }, { status: 400 });
      await env.DB.prepare("UPDATE media SET status = ? WHERE id = ?")
        .bind(body.intent === "hide" ? "hidden" : "ready", id)
        .run();
      await logModeration(body.intent === "hide" ? "media.hide" : "media.unhide", body.intent === "hide" ? "Hid" : "Unhid");
      return { ok: true };
    }
  }
}
