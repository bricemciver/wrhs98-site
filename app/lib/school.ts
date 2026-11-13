/**
 * Everything specific to one school and class lives here. To run this site for a different class, change these
 * values, the colors in app/app.css (which should match COLORS below), and the starter albums (Admin → Albums).
 *
 * Facts about Washburn Rural High School come from
 * https://en.wikipedia.org/wiki/Washburn_Rural_High_School (retrieved 2026-11-10).
 */
export const SCHOOL = {
  name: "Washburn Rural High School",
  /** How people usually say it: "State titles won at Washburn Rural". */
  shortName: "Washburn Rural",
  location: "Topeka, Kansas",
  district: "Auburn–Washburn USD 437",
  founded: 1918,
  /** Team name, plural ("Go Junior Blues!"). */
  mascot: "Junior Blues",
  /** One team member ("Once a Junior Blue, always a Junior Blue"). */
  mascotSingular: "Junior Blue",
  classYear: 1998,
  reunionYear: 2028,
  source: "https://en.wikipedia.org/wiki/Washburn_Rural_High_School",
} as const;

/** The site's full name: page header, footer, home page title, and email subjects. */
export const SITE_NAME = `${SCHOOL.shortName} Class of ${SCHOOL.classYear}`;

/** Short name at the end of browser tab titles: "Photos · WRHS '98". */
export const SHORT_SITE_NAME = `WRHS '${String(SCHOOL.classYear).slice(-2)}`;

/** School colors as hex values, for places CSS can't reach (emails, the browser's theme color). Keep in sync with app/app.css. */
export const COLORS = {
  primary: "#1d4e9e",
  accent: "#f2b705",
} as const;

/** "30": which reunion this is. */
export const REUNION_NUMBER = SCHOOL.reunionYear - SCHOOL.classYear;

/** The four years the class was in high school, e.g. "1994–98". */
export const HIGH_SCHOOL_YEARS = `${SCHOOL.classYear - 4}–${String(SCHOOL.classYear).slice(-2)}`;

/** Browser tab title: pageTitle("Roster", "Admin") → "Roster · Admin · WRHS '98". */
export function pageTitle(...parts: string[]): string {
  return [...parts, SHORT_SITE_NAME].join(" · ");
}

/** State championships won while the class was in school. */
export const OUR_YEARS_CHAMPIONSHIPS: { year: number; sport: string }[] = [
  { year: 1995, sport: "Softball" },
  { year: 1996, sport: "Girls' basketball" },
  { year: 1996, sport: "Girls' cross country" },
  { year: 1997, sport: "Boys' golf" },
];
