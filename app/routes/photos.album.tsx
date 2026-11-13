import { env } from "cloudflare:workers";
import { ArrowLeft, Play } from "lucide-react";
import { useCallback } from "react";
import { Link, useSearchParams } from "react-router";
import { Lightbox, type LightboxItem } from "~/components/lightbox";
import { EmptyState, PageHeader } from "~/components/ui";
import { Uploader } from "~/components/uploader";
import { memberContext } from "~/context";
import { notFound } from "~/lib/http.server";
import type { Route } from "./+types/photos.album";
import { pageTitle } from "~/lib/school";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return [{ title: data ? pageTitle(data.album.title, "Photos") : pageTitle("Photos") }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const user = context.get(memberContext);
  const isAdmin = user.role === "admin";
  const album = await env.DB.prepare("SELECT id, slug, title, description FROM albums WHERE slug = ?")
    .bind(params.slug)
    .first<{ id: number; slug: string; title: string; description: string | null }>();
  if (!album) notFound();

  const items = await env.DB.prepare(
    `SELECT m.id, m.kind, m.content_type, m.caption, m.has_display, m.has_thumb, m.status, m.uploader_id,
            m.created_at, u.name AS uploader_name
       FROM media m LEFT JOIN users u ON u.id = m.uploader_id
      WHERE m.album_id = ? AND (m.status = 'ready' OR (? AND m.status = 'hidden'))
      ORDER BY m.created_at DESC LIMIT 1000`,
  )
    .bind(album.id, isAdmin ? 1 : 0)
    .all<LightboxItem>();

  return { album, items: items.results, viewerId: user.id, isAdmin };
}

export default function Album({ loaderData }: Route.ComponentProps) {
  const { album, items, viewerId, isAdmin } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = Number(searchParams.get("item"));
  const openIndex = items.findIndex((i) => i.id === openId);

  const navigate = useCallback(
    (index: number | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (index === null || !items[index]) next.delete("item");
          else next.set("item", String(items[index].id));
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [items, setSearchParams],
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link to="/photos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> All albums
        </Link>
        <PageHeader title={album.title} description={album.description ?? undefined} />
      </div>

      <Uploader albumId={album.id} />

      {items.length === 0 ? (
        <EmptyState title="Nothing here yet">Be the first to add something to this album.</EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => navigate(i)}
                className="group relative block aspect-square w-full overflow-hidden rounded-md bg-muted"
              >
                {m.has_thumb ? (
                  <img
                    src={`/media/${m.id}/thumb`}
                    alt={m.caption ?? (m.kind === "video" ? "Video" : "Photo")}
                    loading="lazy"
                    className={`size-full object-cover transition-transform group-hover:scale-105 ${m.status === "hidden" ? "opacity-40" : ""}`}
                  />
                ) : (
                  <span className="size-full flex items-center justify-center text-sm text-muted-foreground">
                    {m.kind === "video" ? "Video" : "Photo"}
                  </span>
                )}
                {m.kind === "video" && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="rounded-full bg-black/60 p-2 text-white">
                      <Play className="size-5" aria-hidden="true" />
                    </span>
                    <span className="sr-only">Video</span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {openIndex >= 0 && (
        <Lightbox items={items} index={openIndex} viewerId={viewerId} isAdmin={isAdmin} onNavigate={navigate} />
      )}
    </div>
  );
}
