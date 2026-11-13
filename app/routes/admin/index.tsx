import { env } from "cloudflare:workers";
import { Link } from "react-router";
import { Eye } from "lucide-react";
import { Button, Card, PageHeader } from "~/components/ui";
import { storageQuotaBytes } from "~/lib/media.server";
import type { Route } from "./+types/index";
import { pageTitle } from "~/lib/school";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("Admin") }];

export async function loader() {
  const stats = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM classmates) AS roster,
       (SELECT COUNT(*) FROM classmates WHERE is_deceased = 1) AS deceased,
       (SELECT COUNT(*) FROM users WHERE role IN ('member','admin')) AS members,
       (SELECT COUNT(*) FROM access_requests r JOIN users u ON u.id = r.user_id
          WHERE r.status = 'open' AND u.role = 'pending') AS open_requests,
       (SELECT COUNT(*) FROM leads WHERE resolved = 0) AS open_leads,
       (SELECT COUNT(*) FROM classmate_suggestions WHERE status = 'open') AS open_suggestions,
       (SELECT COUNT(*) FROM media WHERE status = 'ready') AS media,
       (SELECT COALESCE(SUM(size_bytes), 0) FROM media WHERE status != 'uploading') AS media_bytes`,
  ).first<Record<string, number>>();
  return { stats: stats!, quotaBytes: storageQuotaBytes() };
}

export default function AdminIndex({ loaderData }: Route.ComponentProps) {
  const s = loaderData.stats;
  const gb = (b: number) => (b / 1024 ** 3).toFixed(2);
  const pct = Math.round((s.media_bytes / loaderData.quotaBytes) * 100);
  const tiles = [
    { label: "Open access requests", value: s.open_requests, to: "/admin/requests", highlight: s.open_requests > 0 },
    { label: "Suggested classmates", value: s.open_suggestions, to: "/admin/suggestions", highlight: s.open_suggestions > 0 },
    { label: "Unresolved tips", value: s.open_leads, to: "/admin/leads", highlight: s.open_leads > 0 },
    { label: "Members", value: s.members, to: "/admin/members" },
    { label: "Classmates on roster", value: s.roster, to: "/admin/roster" },
    { label: "In memoriam", value: s.deceased, to: "/admin/roster?show=deceased" },
    { label: "Photos & videos", value: s.media, to: "/photos", sub: `${gb(s.media_bytes)} of ${gb(loaderData.quotaBytes)} GB storage used (${pct}%)`, highlight: pct >= 80 },
  ];
  return (
    <>
      <PageHeader
        title="Admin"
        description="Manage who can get in, the class roster, announcements, and albums."
        actions={
          <form method="post" action="/preview">
            <input type="hidden" name="intent" value="start" />
            <input type="hidden" name="redirectTo" value="/" />
            <Button type="submit" variant="secondary" size="sm">
              <Eye className="size-4" aria-hidden="true" />
              Preview as a member
            </Button>
          </form>
        }
      />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((t) => (
          <li key={t.label}>
            <Link to={t.to}>
              <Card className={`p-5 flex flex-col gap-1 hover:border-primary ${t.highlight ? "border-accent" : ""}`}>
                <span className="text-sm text-muted-foreground">{t.label}</span>
                <span className="text-3xl font-semibold tabular-nums">{t.value}</span>
                {t.sub && <span className="text-sm text-muted-foreground">{t.sub}</span>}
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
