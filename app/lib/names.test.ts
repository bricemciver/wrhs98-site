import { describe, expect, it } from "vitest";
import { lastNameFromAccount } from "./names";

const jen = { first_name: "Jennifer", last_name: "Smith" };

describe("lastNameFromAccount", () => {
  it("prefers the provider's family name", () => {
    expect(lastNameFromAccount("Jones", "Jen Somethingelse", jen)).toBe("Jones");
  });

  it("falls back to the last word of a two-word display name", () => {
    expect(lastNameFromAccount(null, "Jen Jones", jen)).toBe("Jones");
    expect(lastNameFromAccount("  ", "Jen Jones", jen)).toBe("Jones");
  });

  it("ignores display names that aren't exactly two words", () => {
    expect(lastNameFromAccount(null, "Jen", jen)).toBeNull();
    expect(lastNameFromAccount(null, "Jennifer Ann Jones", jen)).toBeNull();
  });

  it("returns null when the name hasn't changed since 1998", () => {
    expect(lastNameFromAccount("Smith", null, jen)).toBeNull();
    expect(lastNameFromAccount("SMITH", null, jen)).toBeNull();
  });

  it("drops the 1998 surname from a combined name", () => {
    expect(lastNameFromAccount("Smith Jones", null, jen)).toBe("Jones");
    expect(lastNameFromAccount("Jones Smith", null, jen)).toBe("Jones");
  });

  it("keeps hyphens, apostrophes, and accented letters", () => {
    expect(lastNameFromAccount("Smith-Jones", null, jen)).toBe("Smith-Jones");
    expect(lastNameFromAccount("O'Brien", null, jen)).toBe("O'Brien");
    expect(lastNameFromAccount("Peña", null, jen)).toBe("Peña");
  });

  it("rejects things that don't look like surnames", () => {
    expect(lastNameFromAccount("Jones 🌻", null, jen)).toBeNull();
    expect(lastNameFromAccount("(Jones)", null, jen)).toBeNull();
    expect(lastNameFromAccount("of 3", null, jen)).toBeNull();
    expect(lastNameFromAccount(null, "Mom of 3", jen)).toBeNull();
    expect(lastNameFromAccount(null, "Jen 💕", jen)).toBeNull();
  });

  it("rejects the first name and one-letter results", () => {
    expect(lastNameFromAccount("Jennifer", null, jen)).toBeNull();
    expect(lastNameFromAccount("J", null, jen)).toBeNull();
    expect(lastNameFromAccount("Smith J", null, jen)).toBeNull();
  });

  it("returns null with nothing to go on", () => {
    expect(lastNameFromAccount(null, null, jen)).toBeNull();
    expect(lastNameFromAccount(undefined, "", jen)).toBeNull();
  });
});
