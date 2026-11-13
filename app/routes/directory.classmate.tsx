import { env } from "cloudflare:workers";
import { ArrowLeft, Mail, MapPin, Phone } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { LinkList } from "~/components/link-list";
import { Avatar, Badge, ButtonLink, Card } from "~/components/ui";
import { memberContext } from "~/context";
import { classmateInitials, classmateName } from "~/lib/format";
import { intParam, notFound } from "~/lib/http.server";
import { parseLinks } from "~/lib/social";
import type { Route } from "./+types/directory.classmate";
import { pageTitle } from "~/lib/school";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return [{ title: data ? pageTitle(data.name, "Directory") : pageTitle("Directory") }];
}

interface Row {
  id: number;
  first_name: string;
  last_name: string;
  nickname: string | null;
  is_deceased: number;
  deceased_on: string | null;
  last_known_email: string | null;
  last_known_phone: string | null;
  last_known_city: string | null;
  last_known_state: string | null;
  admin_notes: string | null;
  user_id: number | null;
  user_email: string | null;
  current_last_name: string | null;
  city: string | null;
  state: string | null;
  contact_email: string | null;
  phone: string | null;
  links: string | null;
  found_links: string | null;
  bio: string | null;
  photo_key: string | null;
  share_email: number | null;
  share_phone: number | null;
  share_location: number | null;
  share_links: number | null;
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const user = context.get(memberContext);
  const id = intParam(params.id);
  const row = await env.DB.prepare(
    `SELECT c.*, u.id AS user_id, u.email AS user_email,
            p.city, p.state, p.contact_email, p.phone, p.links, p.bio, p.photo_key,
            p.share_email, p.share_phone, p.share_location, p.share_links
       FROM classmates c
       LEFT JOIN users u ON u.classmate_id = c.id AND u.role IN ('member', 'admin')
       LEFT JOIN profiles p ON p.user_id = u.id
      WHERE c.id = ?`,
  )
    .bind(id)
    .first<Row>();
  if (!row) notFound();

  const isAdmin = user.role === "admin";
  const isSelf = row.user_id === user.id;
  const seeAll = isAdmin || isSelf;

  // Only send the browser what this viewer is allowed to see.
  return {
    id: row.id,
    name: classmateName(row),
    initials: classmateInitials(row),
    isDeceased: row.is_deceased === 1,
    deceasedOn: row.deceased_on,
    joined: row.user_id !== null,
    isSelf,
    isAdmin,
    profile: row.user_id
      ? {
          photo: row.photo_key ? `/files/${row.photo_key}` : null,
          bio: row.bio,
          links: seeAll || row.share_links ? parseLinks(row.links) : [],
          location: seeAll || row.share_location ? [row.city, row.state].filter(Boolean).join(", ") || null : null,
          email: seeAll || row.share_email ? row.contact_email || row.user_email : null,
          phone: seeAll || row.share_phone ? row.phone : null,
        }
      : null,
    admin: isAdmin
      ? {
          email: row.last_known_email,
          phone: row.last_known_phone,
          location: [row.last_known_city, row.last_known_state].filter(Boolean).join(", ") || null,
          notes: row.admin_notes,
          foundLinks: parseLinks(row.found_links),
        }
      : null,
  };
}

/** Back to the directory, keeping the search (and scroll position) the member came from. */
function BackToDirectory() {
  const location = useLocation();
  const navigate = useNavigate();
  const raw = (location.state as { directorySearch?: unknown } | null)?.directorySearch;
  const search = typeof raw === "string" && raw.startsWith("?") ? raw : "";
  const cameFromDirectory = typeof raw === "string";
  return (
    <Link
      to={`/directory${search}`}
      onClick={(e) => {
        // The previous history entry is that directory page, so going back also restores the scroll position.
        if (cameFromDirectory && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
          e.preventDefault();
          navigate(-1);
        }
      }}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden="true" /> {search ? "Back to search results" : "Directory"}
    </Link>
  );
}

export default function ClassmateDetail({ loaderData: c }: Route.ComponentProps) {
  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <BackToDirectory />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar size="lg" src={c.profile?.photo} initials={c.initials} alt={`Photo of ${c.name}`} />
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold">{c.name}</h1>
          <div className="flex flex-wrap gap-2">
            {c.isDeceased ? (
              <Badge>In memoriam{c.deceasedOn ? ` · ${c.deceasedOn}` : ""}</Badge>
            ) : c.joined ? (
              <Badge tone="success">Joined</Badge>
            ) : (
              <Badge>Not joined yet</Badge>
            )}
          </div>
        </div>
        <div className="sm:ml-auto flex gap-2">
          {c.isSelf && (
            <ButtonLink to="/profile" variant="secondary" size="sm">
              Edit my profile
            </ButtonLink>
          )}
          {c.isAdmin && (
            <ButtonLink to={`/admin/roster/${c.id}`} variant="secondary" size="sm">
              Edit roster entry
            </ButtonLink>
          )}
        </div>
      </div>

      {c.profile ? (
        <Card className="p-6 flex flex-col gap-4">
          {c.profile.bio ? (
            <p className="whitespace-pre-line">{c.profile.bio}</p>
          ) : (
            <p className="text-muted-foreground">No update shared yet.</p>
          )}
          <ul className="flex flex-col gap-2 text-sm">
            {c.profile.location && (
              <li className="flex items-center gap-2">
                <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
                {c.profile.location}
              </li>
            )}
            {c.profile.email && (
              <li className="flex items-center gap-2">
                <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
                <a href={`mailto:${c.profile.email}`} className="text-primary underline underline-offset-2">
                  {c.profile.email}
                </a>
              </li>
            )}
            {c.profile.phone && (
              <li className="flex items-center gap-2">
                <Phone className="size-4 text-muted-foreground" aria-hidden="true" />
                <a href={`tel:${c.profile.phone}`} className="text-primary underline underline-offset-2">
                  {c.profile.phone}
                </a>
              </li>
            )}
          </ul>
          <LinkList links={c.profile.links} />
        </Card>
      ) : (
        !c.isDeceased && (
          <Card className="p-6 flex flex-col gap-2">
            <p>{c.name.split(" ")[0]} hasn&apos;t joined the site yet.</p>
            <p className="text-sm text-muted-foreground">
              Know how to reach them? <Link to="/find" className="text-primary underline">Send us a tip</Link> or invite them to sign in.
            </p>
          </Card>
        )
      )}

      {c.admin && (
        <Card className="p-6 flex flex-col gap-2 border-dashed">
          <h2 className="text-lg font-semibold">Admin only: last known info</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Email</dt>
            <dd>{c.admin.email ?? "—"}</dd>
            <dt className="text-muted-foreground">Phone</dt>
            <dd>{c.admin.phone ?? "—"}</dd>
            <dt className="text-muted-foreground">Location</dt>
            <dd>{c.admin.location ?? "—"}</dd>
            <dt className="text-muted-foreground">Notes</dt>
            <dd className="whitespace-pre-line">{c.admin.notes ?? "—"}</dd>
          </dl>
          {c.admin.foundLinks.length > 0 && (
            <div className="flex flex-col gap-2 mt-2">
              <p className="text-sm text-muted-foreground">Found online</p>
              <LinkList links={c.admin.foundLinks} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
