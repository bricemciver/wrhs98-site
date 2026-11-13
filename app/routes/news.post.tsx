import { env } from "cloudflare:workers";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { ButtonLink } from "~/components/ui";
import { memberContext } from "~/context";
import { formatDate } from "~/lib/format";
import { notFound } from "~/lib/http.server";
import { renderMarkdown } from "~/lib/markdown";
import type { Route } from "./+types/news.post";
import { pageTitle } from "~/lib/school";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return [{ title: data ? pageTitle(data.post.title) : pageTitle("News") }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const user = context.get(memberContext);
  const post = await env.DB.prepare(
    `SELECT p.id, p.title, p.body, p.published_at, p.updated_at, u.name AS author
       FROM posts p LEFT JOIN users u ON u.id = p.author_id
      WHERE p.slug = ? AND (p.is_published = 1 OR ? = 'admin')`,
  )
    .bind(params.slug, user.role)
    .first<{ id: number; title: string; body: string; published_at: number; updated_at: number; author: string | null }>();
  if (!post) notFound();
  return { post: { ...post, html: renderMarkdown(post.body) }, isAdmin: user.role === "admin" };
}

export default function NewsPost({ loaderData }: Route.ComponentProps) {
  const { post, isAdmin } = loaderData;
  return (
    <article className="max-w-3xl mx-auto flex flex-col gap-6">
      <Link to="/news" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> All news
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl md:text-4xl font-semibold">{post.title}</h1>
        <p className="text-sm text-muted-foreground">
          {formatDate(post.published_at)}
          {post.author && ` · ${post.author}`}
        </p>
      </header>
      <div className="prose-post" dangerouslySetInnerHTML={{ __html: post.html }} />
      {isAdmin && (
        <div>
          <ButtonLink to={`/admin/news/${post.id}`} variant="secondary" size="sm">
            Edit
          </ButtonLink>
        </div>
      )}
    </article>
  );
}
