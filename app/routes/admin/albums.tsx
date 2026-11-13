import { env } from "cloudflare:workers";
import { data, Form, Link, useFetcher, useNavigation } from "react-router";
import { Alert, Button, Card, Field, Input, PageHeader } from "~/components/ui";
import { memberContext } from "~/context";
import { logActivity } from "~/lib/audit.server";
import { slugify } from "~/lib/format";
import { str } from "~/lib/http.server";
import { deleteMedia } from "~/lib/media.server";
import type { Route } from "./+types/albums";
import { pageTitle } from "~/lib/school";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("Albums", "Admin") }];

interface AlbumRow {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  sort_order: number;
  items: number;
}

export async function loader() {
  const rows = await env.DB.prepare(
    `SELECT a.id, a.slug, a.title, a.description, a.sort_order,
            (SELECT COUNT(*) FROM media m WHERE m.album_id = a.id) AS items
       FROM albums a ORDER BY a.sort_order, a.created_at`,
  ).all<AlbumRow>();
  return { albums: rows.results };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(memberContext);
  const form = await request.formData();
  const intent = str(form, "intent");
  const title = str(form, "title");
  const description = str(form, "description") || null;
  const sortOrder = Number(form.get("sort_order")) || 0;

  if (intent === "create" || intent === "update") {
    if (!title || title.length > 120) return data({ error: "Album title is required (120 characters max)." }, { status: 400 });
    if (description && description.length > 500) return data({ error: "Description is too long." }, { status: 400 });
  }

  if (intent === "create") {
    let slug = slugify(title);
    if (await env.DB.prepare("SELECT 1 FROM albums WHERE slug = ?").bind(slug).first()) {
      slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    }
    await env.DB.prepare("INSERT INTO albums (slug, title, description, sort_order, created_by) VALUES (?, ?, ?, ?, ?)")
      .bind(slug, title, description, sortOrder, user.id)
      .run();
    await logActivity(user, "album.create", `Created the album “${title}”`, { type: "album", id: null });
    return { ok: "Album created." };
  }
  const id = Number(form.get("id"));
  const album = await env.DB.prepare("SELECT title FROM albums WHERE id = ?").bind(id).first<{ title: string }>();
  if (!album) return data({ error: "That album no longer exists." }, { status: 404 });
  if (intent === "update") {
    await env.DB.prepare("UPDATE albums SET title = ?, description = ?, sort_order = ? WHERE id = ?")
      .bind(title, description, sortOrder, id)
      .run();
    await logActivity(user, "album.update", album.title === title ? `Edited the album “${title}”` : `Renamed the album “${album.title}” to “${title}”`, {
      type: "album",
      id,
    });
    return { ok: "Album saved." };
  }
  if (intent === "delete") {
    const media = await env.DB.prepare("SELECT id FROM media WHERE album_id = ?").bind(id).all<{ id: number }>();
    for (const m of media.results) await deleteMedia(m.id);
    await env.DB.prepare("DELETE FROM albums WHERE id = ?").bind(id).run();
    await logActivity(
      user,
      "album.delete",
      `Deleted the album “${album.title}”${
        media.results.length === 0
          ? " (it was empty)"
          : media.results.length === 1
            ? " and its 1 photo or video"
            : ` and its ${media.results.length} photos and videos`
      }`,
      { type: "album", id },
    );
    return { ok: "Album deleted." };
  }
  return data({ error: "Unknown action" }, { status: 400 });
}

function AlbumRowEditor({ album }: { album: AlbumRow }) {
  const fetcher = useFetcher<typeof action>();
  return (
    <Card className="p-4">
      <fetcher.Form method="post" className="grid gap-3 md:grid-cols-[1fr_2fr_6rem_auto] md:items-end">
        <input type="hidden" name="id" value={album.id} />
        <Field label="Title" htmlFor={`t-${album.id}`}>
          <Input id={`t-${album.id}`} name="title" defaultValue={album.title} required maxLength={120} />
        </Field>
        <Field label="Description" htmlFor={`d-${album.id}`}>
          <Input id={`d-${album.id}`} name="description" defaultValue={album.description ?? ""} maxLength={500} />
        </Field>
        <Field label="Order" htmlFor={`o-${album.id}`}>
          <Input id={`o-${album.id}`} name="sort_order" type="number" defaultValue={album.sort_order} />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" name="intent" value="update" size="sm" variant="secondary" disabled={fetcher.state !== "idle"}>
            Save
          </Button>
          <Button
            type="submit"
            name="intent"
            value="delete"
            size="sm"
            variant="destructive"
            formNoValidate
            onClick={(e) =>
              !confirm(`Delete “${album.title}” and all ${album.items} photos/videos in it? This can't be undone.`) && e.preventDefault()
            }
          >
            Delete
          </Button>
        </div>
      </fetcher.Form>
      <p className="mt-2 text-sm text-muted-foreground">
        <Link to={`/photos/${album.slug}`} className="text-primary hover:underline">
          View album
        </Link>{" "}
        · {album.items} item{album.items === 1 ? "" : "s"}
        {fetcher.data && "ok" in fetcher.data && ` · ${fetcher.data.ok}`}
      </p>
    </Card>
  );
}

export default function AdminAlbums({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state === "submitting";
  return (
    <>
      <PageHeader title="Albums" description="Members can upload into any album. Lower order numbers appear first." />
      <div className="flex flex-col gap-6">
        <Card className="p-5 flex flex-col gap-3">
          <h2 className="text-lg font-semibold">New album</h2>
          {actionData && "error" in actionData && <Alert tone="error">{actionData.error}</Alert>}
          <Form method="post" className="grid gap-3 md:grid-cols-[1fr_2fr_6rem_auto] md:items-end">
            <input type="hidden" name="intent" value="create" />
            <Field label="Title" htmlFor="new-title">
              <Input id="new-title" name="title" required maxLength={120} />
            </Field>
            <Field label="Description" htmlFor="new-desc">
              <Input id="new-desc" name="description" maxLength={500} />
            </Field>
            <Field label="Order" htmlFor="new-order">
              <Input id="new-order" name="sort_order" type="number" defaultValue={10} />
            </Field>
            <Button type="submit" disabled={busy}>
              Create
            </Button>
          </Form>
        </Card>
        {loaderData.albums.map((a) => (
          <AlbumRowEditor key={a.id} album={a} />
        ))}
      </div>
    </>
  );
}
