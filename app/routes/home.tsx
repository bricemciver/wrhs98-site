import { env } from "cloudflare:workers";
import { Camera, ExternalLink, Search, Users } from "lucide-react";
import { Link } from "react-router";
import { PostCard, type PostSummary } from "~/components/post-card";
import { buttonClass, ButtonLink, Card } from "~/components/ui";
import { userContext } from "~/context";
import { formatDate } from "~/lib/format";
import { renderMarkdown } from "~/lib/markdown";
import { normalizeUrl } from "~/lib/social";
import { REUNION_NUMBER, SCHOOL, SITE_NAME } from "~/lib/school";
import { OurYears } from "~/components/our-years";
import { isMember } from "~/lib/types";
import type { Route } from "./+types/home";

export function meta({ loaderData: data }: Route.MetaArgs) {
  const name = data?.siteName ?? SITE_NAME;
  return [
    { title: name },
    {
      name: "description",
      content: `The private class site for the ${SCHOOL.name} (${SCHOOL.location}) Class of ${SCHOOL.classYear}: reunion news, photos, and the class directory.`,
    },
  ];
}

interface RecentMedia {
  id: number;
  kind: "photo" | "video";
  caption: string | null;
  has_thumb: number;
  album_slug: string;
}

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext);
  const db = env.DB;
  const facebookGroupUrl = normalizeUrl(env.CLASS_FACEBOOK_GROUP_URL ?? "");

  if (!user || !isMember(user)) {
    const posts = await db
      .prepare(
        `SELECT slug, title, body, is_pinned, published_at FROM posts
          WHERE is_published = 1 AND is_public = 1 ORDER BY is_pinned DESC, published_at DESC LIMIT 3`,
      )
      .all<PostSummary>();
    return {
      kind: "public" as const,
      siteName: SITE_NAME,
      signedIn: !!user,
      facebookGroupUrl,
      posts: posts.results.map((p) => ({ ...p, html: renderMarkdown(p.body) })),
    };
  }

  const [posts, media, stats, me] = await db.batch([
    db.prepare(
      `SELECT slug, title, body, is_pinned, published_at FROM posts
        WHERE is_published = 1 ORDER BY is_pinned DESC, published_at DESC LIMIT 3`,
    ),
    db.prepare(
      `SELECT m.id, m.kind, m.caption, m.has_thumb, a.slug AS album_slug
         FROM media m JOIN albums a ON a.id = m.album_id
        WHERE m.status = 'ready' ORDER BY m.created_at DESC LIMIT 8`,
    ),
    db.prepare(
      `SELECT (SELECT COUNT(*) FROM classmates WHERE is_deceased = 0) AS classmates,
              (SELECT COUNT(*) FROM users WHERE role IN ('member','admin') AND classmate_id IS NOT NULL) AS joined,
              (SELECT COUNT(*) FROM classmates c WHERE c.is_deceased = 0
                  AND c.last_known_email IS NULL AND c.last_known_phone IS NULL
                  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.classmate_id = c.id)) AS missing`,
    ),
    db.prepare("SELECT 1 AS has_profile FROM profiles WHERE user_id = ?").bind(user.id),
  ]);

  return {
    kind: "member" as const,
    siteName: SITE_NAME,
    name: user.name,
    posts: posts.results as unknown as PostSummary[],
    media: media.results as unknown as RecentMedia[],
    stats: stats.results[0] as { classmates: number; joined: number; missing: number },
    needsProfile: me.results.length === 0 && user.classmateId !== null,
    facebookGroupUrl,
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  if (loaderData.kind === "public") {
    const { posts, signedIn, facebookGroupUrl } = loaderData;
    return (
      <div className="flex flex-col gap-12">
        <section className="flex flex-col gap-6 items-start py-8 md:py-16">
          <p className="text-sm font-semibold tracking-wide uppercase text-primary">
            {SCHOOL.location} · 30 years · {SCHOOL.classYear}–{SCHOOL.reunionYear}
          </p>
          <h1 className="flex flex-col gap-2 max-w-3xl">
            <span className="text-4xl md:text-6xl font-bold">{SCHOOL.name}</span>
            <span className="text-2xl md:text-3xl font-semibold text-primary">Class of {SCHOOL.classYear}</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Once a {SCHOOL.mascotSingular}, always a {SCHOOL.mascotSingular}. This is a private place for our
            class to reconnect: share old photos and new ones, find classmates, and hear about plans for our {REUNION_NUMBER}-year reunion.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink to={signedIn ? "/pending" : "/login"}>{signedIn ? "Check my access" : "Classmates: sign in"}</ButtonLink>
            {facebookGroupUrl && (
              <a href={facebookGroupUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
                <ExternalLink className="size-4" aria-hidden="true" />
                Class Facebook group
              </a>
            )}
          </div>
        </section>

        <OurYears />

        {posts.length > 0 && (
          <section className="flex flex-col gap-4" aria-labelledby="public-news">
            <h2 id="public-news" className="text-2xl font-semibold">
              Announcements
            </h2>
            <div className="flex flex-col gap-4">
              {posts.map((p) => (
                <Card key={p.slug} className="p-6 flex flex-col gap-3">
                  <p className="text-sm text-muted-foreground">{formatDate(p.published_at)}</p>
                  <h3 className="text-2xl font-semibold">{p.title}</h3>
                  <div className="prose-post" dangerouslySetInnerHTML={{ __html: p.html }} />
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  const { name, posts, media, stats, needsProfile, facebookGroupUrl } = loaderData;
  const firstName = name?.split(" ")[0];
  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl md:text-4xl font-semibold">Welcome back{firstName ? `, ${firstName}` : ""}!</h1>
        <p className="text-muted-foreground">
          {stats.joined} of {stats.classmates} classmates have joined so far.
          {stats.missing > 0 && ` We still have no contact info for ${stats.missing}.`}
        </p>
        {needsProfile && (
          <Card className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-accent">
            <p>Add a photo and let everyone know what you&apos;ve been up to since {SCHOOL.classYear}.</p>
            <ButtonLink to="/profile" size="sm">
              Complete my profile
            </ButtonLink>
          </Card>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Quick links">
        {[
          { to: "/photos", icon: Camera, title: "Photos & videos", text: "Browse albums or upload your own." },
          { to: "/directory", icon: Users, title: "Class directory", text: "Find classmates and catch up." },
          { to: "/find", icon: Search, title: "Help us find", text: "Know where someone landed? Tell us." },
        ].map(({ to, icon: Icon, title, text }) => (
          <Link key={to} to={to} className="rounded-lg border bg-card p-5 flex gap-4 hover:border-primary">
            <Icon className="size-6 text-primary shrink-0" aria-hidden="true" />
            <span className="flex flex-col gap-1">
              <span className="font-semibold">{title}</span>
              <span className="text-sm text-muted-foreground">{text}</span>
            </span>
          </Link>
        ))}
        {facebookGroupUrl && (
          <a
            href={facebookGroupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border bg-card p-5 flex gap-4 hover:border-primary"
          >
            <ExternalLink className="size-6 text-primary shrink-0" aria-hidden="true" />
            <span className="flex flex-col gap-1">
              <span className="font-semibold">Facebook group</span>
              <span className="text-sm text-muted-foreground">Join the class group on Facebook.</span>
            </span>
          </a>
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="latest-news">
        <div className="flex items-baseline justify-between">
          <h2 id="latest-news" className="text-2xl font-semibold">
            Latest news
          </h2>
          <Link to="/news" className="text-sm text-primary underline underline-offset-2">
            All news
          </Link>
        </div>
        {posts.length === 0 ? (
          <p className="text-muted-foreground">No announcements yet. Reunion news will show up here.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {posts.map((p) => (
              <PostCard key={p.slug} post={p} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="recent-photos">
        <div className="flex items-baseline justify-between">
          <h2 id="recent-photos" className="text-2xl font-semibold">
            Recently added
          </h2>
          <Link to="/photos" className="text-sm text-primary underline underline-offset-2">
            All albums
          </Link>
        </div>
        {media.length === 0 ? (
          <p className="text-muted-foreground">No photos yet. Be the first to share one!</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {media.map((m) => (
              <li key={m.id}>
                <Link to={`/photos/${m.album_slug}?item=${m.id}`} className="block aspect-square overflow-hidden rounded-md bg-muted">
                  {m.has_thumb ? (
                    <img
                      src={`/media/${m.id}/thumb`}
                      alt={m.caption ?? (m.kind === "video" ? "Video" : "Photo")}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="size-full flex items-center justify-center text-sm text-muted-foreground">
                      {m.kind === "video" ? "Video" : "Photo"}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <OurYears />
    </div>
  );
}
