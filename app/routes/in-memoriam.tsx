import { env } from "cloudflare:workers";
import { Avatar, Card, EmptyState, PageHeader } from "~/components/ui";
import { classmateInitials, classmateName } from "~/lib/format";
import type { Route } from "./+types/in-memoriam";
import { pageTitle } from "~/lib/school";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("In Memoriam") }];

interface Row {
  id: number;
  first_name: string;
  last_name: string;
  nickname: string | null;
  current_last_name: string | null;
  deceased_on: string | null;
  memoriam_text: string | null;
  memoriam_photo_key: string | null;
}

export async function loader() {
  const rows = await env.DB.prepare(
    `SELECT id, first_name, last_name, nickname, current_last_name, deceased_on, memoriam_text, memoriam_photo_key
       FROM classmates WHERE is_deceased = 1
      ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE`,
  ).all<Row>();
  return {
    classmates: rows.results.map((r) => ({
      id: r.id,
      name: classmateName(r),
      initials: classmateInitials(r),
      deceasedOn: r.deceased_on,
      text: r.memoriam_text,
      photo: r.memoriam_photo_key ? `/files/${r.memoriam_photo_key}` : null,
    })),
  };
}

export default function InMemoriam({ loaderData }: Route.ComponentProps) {
  const { classmates } = loaderData;
  return (
    <>
      <PageHeader
        title="In Memoriam"
        description="Remembering the classmates we've lost. If you know of someone who should be listed here, or have a memory or photo to share, please let a class admin know."
      />
      {classmates.length === 0 ? (
        <EmptyState title="No one is listed" />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {classmates.map((c) => (
            <li key={c.id}>
              <Card className="p-6 flex gap-4 h-full">
                <Avatar size="lg" src={c.photo} initials={c.initials} alt={`Photo of ${c.name}`} />
                <div className="flex flex-col gap-2">
                  <h2 className="text-xl font-semibold">{c.name}</h2>
                  {c.deceasedOn && <p className="text-sm text-muted-foreground">{c.deceasedOn}</p>}
                  {c.text && <p className="whitespace-pre-line">{c.text}</p>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
