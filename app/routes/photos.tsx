import { env } from "cloudflare:workers";
import { Images } from "lucide-react";
import { Link } from "react-router";
import { ButtonLink, EmptyState, PageHeader } from "~/components/ui";
import { memberContext } from "~/context";
import type { Route } from "./+types/photos";
import { pageTitle } from "~/lib/school";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("Photos & Videos") }];

interface AlbumRow {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  item_count: number;
  cover_id: number | null;
}

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(memberContext);
  const albums = await env.DB.prepare(
    `SELECT a.id, a.slug, a.title, a.description,
            (SELECT COUNT(*) FROM media m WHERE m.album_id = a.id AND m.status = 'ready') AS item_count,
            (SELECT m.id FROM media m WHERE m.album_id = a.id AND m.status = 'ready' AND m.has_thumb = 1
              ORDER BY m.created_at DESC LIMIT 1) AS cover_id
       FROM albums a ORDER BY a.sort_order, a.created_at`,
  ).all<AlbumRow>();
  return { albums: albums.results, isAdmin: user.role === "admin" };
}

export default function Photos({ loaderData }: Route.ComponentProps) {
  const { albums, isAdmin } = loaderData;
  return (
    <>
      <PageHeader
        title="Photos & Videos"
        description="Pick an album to browse or add your own photos and short videos."
        actions={isAdmin && <ButtonLink to="/admin/albums" variant="secondary">Manage albums</ButtonLink>}
      />
      {albums.length === 0 ? (
        <EmptyState title="No albums yet" />
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {albums.map((a) => (
            <li key={a.id}>
              <Link to={`/photos/${a.slug}`} className="group flex flex-col gap-3">
                <div className="aspect-[4/3] overflow-hidden rounded-lg bg-muted border">
                  {a.cover_id ? (
                    <img
                      src={`/media/${a.cover_id}/thumb`}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <span className="size-full flex items-center justify-center text-muted-foreground">
                      <Images className="size-10" aria-hidden="true" />
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <h2 className="text-xl font-semibold group-hover:text-primary">{a.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {a.item_count} {a.item_count === 1 ? "item" : "items"}
                    {a.description && ` · ${a.description}`}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
