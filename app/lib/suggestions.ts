import { SCHOOL } from "./school";

/** How a suggested classmate is connected to the class (stored in classmate_suggestions.connection). */
export const CONNECTIONS = {
  early: `Graduated early (${SCHOOL.classYear - 1} or before)`,
  late: `Graduated later (${SCHOOL.classYear + 1} or after)`,
  elsewhere: `Attended ${SCHOOL.shortName} but graduated somewhere else`,
  other: "Something else",
} as const;

export type Connection = keyof typeof CONNECTIONS;

export const isConnection = (v: string): v is Connection => Object.hasOwn(CONNECTIONS, v);

/** Most suggestions one member can send per day, to keep the queue reviewable. */
export const DAILY_SUGGESTION_LIMIT = 15;
