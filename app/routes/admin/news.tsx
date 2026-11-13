import { env } from "cloudflare:workers";
import { Link } from "react-router";
import { Badge, ButtonLink, EmptyState, PageHeader } from "~/components/ui";
import { formatDate } from "~/lib/format";
import type { Route } from "./+types/news";
import { pageTitle } from "~/lib/school";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("News", "Admin") }];

export async function loader() {
  const posts = await env.DB.prepare(
    "SELECT id, slug, title, is_public, is_pinned, is_published, published_at FROM posts ORDER BY published_at DESC",
  ).all<{ id: number; slug: string; title: string; is_public: number; is_pinned: number; is_published: number; published_at: number }>();
  return { posts: posts.results };
}

export default function AdminNews({ loaderData }: Route.ComponentProps) {
  const { posts } = loaderData;
  return (
    <>
      <PageHeader title="Announcements" actions={<ButtonLink to="/admin/news/new">New announcement</ButtonLink>} />
      {posts.length === 0 ? (
        <EmptyState title="No announcements yet" />
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border bg-card">
          {posts.map((p) => (
            <li key={p.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex flex-col gap-1">
                <Link to={`/admin/news/${p.id}`} className="font-medium text-primary hover:underline">
                  {p.title}
                </Link>
                <span className="text-sm text-muted-foreground">{formatDate(p.published_at)}</span>
              </span>
              <span className="flex flex-wrap gap-1">
                {!p.is_published && <Badge>Draft</Badge>}
                {p.is_public === 1 && <Badge tone="primary">Public</Badge>}
                {p.is_pinned === 1 && <Badge tone="accent">Pinned</Badge>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
