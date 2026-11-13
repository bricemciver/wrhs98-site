/** Groups shown as filters on the activity page. The action's prefix picks the group. */
export const ACTIVITY_GROUPS = {
  request: "Access requests",
  member: "Members",
  roster: "Roster",
  news: "News",
  album: "Albums",
  media: "Photos & videos",
  lead: "Tips",
  suggestion: "Suggestions",
  account: "Account deletions",
} as const;

export type ActivityGroup = keyof typeof ACTIVITY_GROUPS;

export const isActivityGroup = (v: string): v is ActivityGroup => Object.hasOwn(ACTIVITY_GROUPS, v);
