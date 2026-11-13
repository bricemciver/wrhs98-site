import { ExternalLink } from "lucide-react";
import { linkLabel } from "~/lib/social";

/** External profile links, labeled by platform. Opened in a new tab without passing a referrer. */
export function LinkList({ links }: { links: string[] }) {
  if (links.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {links.map((url) => (
        <li key={url}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={url}
            className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm hover:border-primary hover:text-primary"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            {linkLabel(url)}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
