import { Pin } from "lucide-react";
import { Link } from "react-router";
import { formatDate } from "~/lib/format";
import { excerpt } from "~/lib/markdown";
import { Badge, Card } from "./ui";

export interface PostSummary {
  slug: string;
  title: string;
  body: string;
  is_pinned: number;
  published_at: number;
}

export function PostCard({ post, linked = true }: { post: PostSummary; linked?: boolean }) {
  return (
    <Card className="p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <time dateTime={new Date(post.published_at * 1000).toISOString()}>{formatDate(post.published_at)}</time>
        {post.is_pinned === 1 && (
          <Badge tone="accent">
            <Pin className="size-3 mr-1" aria-hidden="true" />
            Pinned
          </Badge>
        )}
      </div>
      <h3 className="text-xl font-semibold">
        {linked ? (
          <Link to={`/news/${post.slug}`} className="hover:text-primary">
            {post.title}
          </Link>
        ) : (
          post.title
        )}
      </h3>
      <p className="text-muted-foreground">{excerpt(post.body)}</p>
    </Card>
  );
}
