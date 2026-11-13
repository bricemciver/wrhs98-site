import { env } from "cloudflare:workers";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import { Alert, Button, Card, Checkbox, Field, Input, PageHeader, Textarea } from "~/components/ui";
import { memberContext } from "~/context";
import { logActivity } from "~/lib/audit.server";
import { slugify } from "~/lib/format";
import { bool, notFound, str } from "~/lib/http.server";
import { renderMarkdown } from "~/lib/markdown";
import type { Route } from "./+types/news.edit";

interface PostRow {
  id: number;
  slug: string;
  title: string;
  body: string;
  is_public: number;
  is_pinned: number;
  is_published: number;
}

export function meta({ loaderData: data }: Route.MetaArgs) {
  return [{ title: data?.post ? `Edit: ${data.post.title}` : "New announcement" }];
}

export async function loader({ params }: Route.LoaderArgs) {
  if (!params.id) return { post: null };
  const post = await env.DB.prepare("SELECT id, slug, title, body, is_public, is_pinned, is_published FROM posts WHERE id = ?")
    .bind(Number(params.id))
    .first<PostRow>();
  if (!post) notFound();
  return { post };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const user = context.get(memberContext);
  const form = await request.formData();

  const existing = params.id
    ? await env.DB.prepare("SELECT title FROM posts WHERE id = ?").bind(Number(params.id)).first<{ title: string }>()
    : null;
  if (params.id && !existing) return data({ error: "That post no longer exists." }, { status: 404 });
  const postTarget = params.id ? ({ type: "post", id: Number(params.id) } as const) : undefined;

  if (str(form, "intent") === "delete" && params.id) {
    await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(Number(params.id)).run();
    await logActivity(user, "news.delete", `Deleted the news post “${existing!.title}”`, postTarget);
    throw redirect("/admin/news");
  }

  const title = str(form, "title");
  const body = str(form, "body");
  if (!title || !body) return data({ error: "A title and body are required." }, { status: 400 });
  if (title.length > 200 || body.length > 20000) return data({ error: "That's too long." }, { status: 400 });
  const flags = [bool(form, "is_public"), bool(form, "is_pinned"), bool(form, "is_published")];

  if (params.id) {
    await env.DB.prepare(
      "UPDATE posts SET title = ?, body = ?, is_public = ?, is_pinned = ?, is_published = ?, updated_at = unixepoch() WHERE id = ?",
    )
      .bind(title, body, ...flags, Number(params.id))
      .run();
    await logActivity(user, "news.update", `Edited the news post “${title}”`, postTarget);
    return { ok: true };
  }

  // Unique slug: append a short suffix if it's taken.
  let slug = slugify(title);
  const taken = await env.DB.prepare("SELECT 1 FROM posts WHERE slug = ?").bind(slug).first();
  if (taken) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  await env.DB.prepare(
    "INSERT INTO posts (slug, title, body, is_public, is_pinned, is_published, author_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(slug, title, body, ...flags, user.id)
    .run();
  await logActivity(user, "news.create", `${flags[2] ? "Published" : "Drafted"} the news post “${title}”`, { type: "post", id: null });
  throw redirect("/admin/news");
}

export default function NewsEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { post } = loaderData;
  const busy = useNavigation().state === "submitting";
  const [body, setBody] = useState(post?.body ?? "");
  const [preview, setPreview] = useState(false);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <Link to="/admin/news" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Announcements
      </Link>
      <PageHeader title={post ? "Edit announcement" : "New announcement"} />
      {actionData && "ok" in actionData && (
        <Alert tone="success">
          Saved. <Link to={`/news/${post?.slug}`} className="underline">View it</Link>
        </Alert>
      )}
      {actionData && "error" in actionData && <Alert tone="error">{actionData.error}</Alert>}

      <Card className="p-6">
        <Form method="post" className="flex flex-col gap-4">
          <Field label="Title" htmlFor="title">
            <Input id="title" name="title" required maxLength={200} defaultValue={post?.title ?? ""} />
          </Field>
          <Field
            label="Body"
            htmlFor="body"
            hint="Blank line = new paragraph. Supports ## Heading, - bullet lists, **bold**, *italic*, and [link text](https://…)."
          >
            {preview ? (
              <div className="prose-post rounded-md border p-4 min-h-48" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />
            ) : null}
            <Textarea
              id="body"
              name="body"
              required
              rows={14}
              maxLength={20000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className={preview ? "hidden" : undefined}
            />
          </Field>
          <div>
            <Button type="button" variant="secondary" size="sm" onClick={() => setPreview((p) => !p)}>
              {preview ? "Back to editing" : "Preview"}
            </Button>
          </div>
          <fieldset className="flex flex-col gap-2 rounded-md border p-4">
            <legend className="px-1 text-sm font-medium">Options</legend>
            <Checkbox name="is_published" defaultChecked={post ? post.is_published === 1 : true} label="Published (uncheck to save as a draft)" />
            <Checkbox name="is_pinned" defaultChecked={post?.is_pinned === 1} label="Pin to the top" />
            <Checkbox
              name="is_public"
              defaultChecked={post?.is_public === 1}
              label="Also show on the public landing page (for classmates who haven't signed in yet; don't include private details)"
            />
          </fieldset>
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="submit" name="intent" value="save" disabled={busy}>
              {busy ? "Saving…" : post ? "Save changes" : "Publish"}
            </Button>
            {post && (
              <Button
                type="submit"
                name="intent"
                value="delete"
                variant="destructive"
                formNoValidate
                onClick={(e) => !confirm("Delete this announcement?") && e.preventDefault()}
              >
                Delete
              </Button>
            )}
          </div>
        </Form>
      </Card>
    </div>
  );
}
