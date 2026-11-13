import { env } from "cloudflare:workers";
import { PostCard, type PostSummary } from "~/components/post-card";
import { ButtonLink, EmptyState, PageHeader } from "~/components/ui";
import { memberContext } from "~/context";
import type { Route } from "./+types/news";
import { pageTitle } from "~/lib/school";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("News & Announcements") }];

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(memberContext);
  const posts = await env.DB.prepare(
    `SELECT slug, title, body, is_pinned, published_at FROM posts
      WHERE is_published = 1 ORDER BY is_pinned DESC, published_at DESC LIMIT 100`,
  ).all<PostSummary>();
  return { posts: posts.results, isAdmin: user.role === "admin" };
}

export default function News({ loaderData }: Route.ComponentProps) {
  const { posts, isAdmin } = loaderData;
  return (
    <>
      <PageHeader
        title="News & Announcements"
        description="Updates from the reunion committee and class admins."
        actions={isAdmin && <ButtonLink to="/admin/news/new">New announcement</ButtonLink>}
      />
      {posts.length === 0 ? (
        <EmptyState title="No announcements yet">Reunion planning news will be posted here.</EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {posts.map((p) => (
            <PostCard key={p.slug} post={p} />
          ))}
        </div>
      )}
    </>
  );
}
