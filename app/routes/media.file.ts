import { memberContext } from "~/context";
import { intParam } from "~/lib/http.server";
import { getMedia, isVariant, mediaKey, serveObject } from "~/lib/media.server";
import type { Route } from "./+types/media.file";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = context.get(memberContext);
  const id = intParam(params.id);
  const variant = params.variant;
  if (!isVariant(variant)) return new Response("Not found", { status: 404 });

  const media = await getMedia(id);
  if (!media) return new Response("Not found", { status: 404 });
  const visible =
    media.status === "ready" ||
    user.role === "admin" ||
    (media.status === "uploading" && media.uploader_id === user.id);
  if (!visible) return new Response("Not found", { status: 404 });
  if (variant === "display" && !media.has_display) return new Response("Not found", { status: 404 });
  if (variant === "thumb" && !media.has_thumb) return new Response("Not found", { status: 404 });

  const response = await serveObject(request, mediaKey(id, variant));
  if (variant === "original" && new URL(request.url).searchParams.has("download")) {
    const name = (media.original_name ?? `wrhs98-${id}`).replace(/[^\w.\- ]/g, "_");
    response.headers.set("Content-Disposition", `attachment; filename="${name}"`);
  }
  return response;
}
