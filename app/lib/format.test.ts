import { describe, expect, it } from "vitest";
import { changedLastName, classmateInitials, classmateName, formatDate, slugify } from "./format";

describe("classmateName", () => {
  it("shows the 1998 surname in parentheses when it changed", () => {
    expect(classmateName({ first_name: "Jennifer", last_name: "Smith", nickname: "Jen", current_last_name: "Jones" })).toBe(
      'Jennifer "Jen" Jones (Smith)',
    );
  });

  it("ignores a current last name that only differs in case", () => {
    expect(classmateName({ first_name: "Pat", last_name: "McDonald", current_last_name: "Mcdonald" })).toBe("Pat McDonald");
    expect(changedLastName({ first_name: "Pat", last_name: "Lee", current_last_name: "  " })).toBeNull();
  });

  it("uses today's surname for initials", () => {
    expect(classmateInitials({ first_name: "jen", last_name: "Smith", current_last_name: "Jones" })).toBe("JJ");
  });
});

describe("slugify", () => {
  it("makes URL-safe slugs and strips accents", () => {
    expect(slugify("  Café Night: Reunion '28!  ")).toBe("cafe-night-reunion-28");
  });

  it("falls back when nothing usable is left", () => {
    expect(slugify("!!!")).toBe("post");
  });

  it("caps the length", () => {
    expect(slugify("a".repeat(100))).toHaveLength(60);
  });
});

describe("formatDate", () => {
  it("formats in Central time, not UTC", () => {
    // 03:00 UTC on May 18 is still the evening of May 17 in Topeka.
    expect(formatDate(Date.UTC(1998, 4, 18, 3) / 1000)).toBe("May 17, 1998");
  });
});
