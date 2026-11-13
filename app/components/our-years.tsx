import { Trophy } from "lucide-react";
import { HIGH_SCHOOL_YEARS, OUR_YEARS_CHAMPIONSHIPS, SCHOOL } from "~/lib/school";
import { Card } from "./ui";

/** State titles won while we were in school. */
export function OurYears() {
  return (
    <section aria-labelledby="our-years" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="our-years" className="text-2xl font-semibold">
          {SCHOOL.mascot} state champions, {HIGH_SCHOOL_YEARS}
        </h2>
        <p className="text-muted-foreground">
          State titles won at {SCHOOL.shortName} while we were in the hallways. Were you on one of these teams? Add your
          photos to the {SCHOOL.mascot} Sports album.
        </p>
      </div>
      <ul className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {OUR_YEARS_CHAMPIONSHIPS.map((c) => (
          <li key={`${c.year}-${c.sport}`}>
            <Card className="p-4 flex flex-col gap-2 h-full border-t-4 border-t-accent">
              <Trophy className="size-5 text-primary" aria-hidden="true" />
              <span className="font-semibold">{c.sport}</span>
              <span className="text-sm text-muted-foreground tabular-nums">{c.year} state champions</span>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
