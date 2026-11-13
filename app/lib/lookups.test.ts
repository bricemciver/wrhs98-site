import { describe, expect, it } from "vitest";
import { isActivityGroup } from "./activity";
import { signinLabel } from "./signin";
import { isConnection } from "./suggestions";

// These guards take values from forms and URLs, so inherited object keys must not pass.
describe("lookup guards", () => {
  it("accept known keys only", () => {
    expect(isActivityGroup("roster")).toBe(true);
    expect(isConnection("early")).toBe(true);
    for (const bad of ["constructor", "__proto__", "toString", ""]) {
      expect(isActivityGroup(bad)).toBe(false);
      expect(isConnection(bad)).toBe(false);
    }
  });

  it("label sign-in methods, with a fallback", () => {
    expect(signinLabel("google")).toBe("Google");
    expect(signinLabel("email")).toBe("Email link");
    expect(signinLabel(null)).toBe("Unknown");
    expect(signinLabel("constructor")).toBe("Unknown");
  });
});
