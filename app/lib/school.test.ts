import { describe, expect, it } from "vitest";
import { HIGH_SCHOOL_YEARS, pageTitle, REUNION_NUMBER, SCHOOL, SHORT_SITE_NAME, SITE_NAME } from "./school";
import { CONNECTIONS } from "./suggestions";

describe("school names and years", () => {
  it("builds the site names from the school and class year", () => {
    expect(SITE_NAME).toBe("Washburn Rural Class of 1998");
    expect(SHORT_SITE_NAME).toBe("WRHS '98");
  });

  it("works out the high school years and which reunion this is", () => {
    expect(HIGH_SCHOOL_YEARS).toBe("1994–98");
    expect(REUNION_NUMBER).toBe(30);
  });

  it("ends tab titles with the short site name", () => {
    expect(pageTitle("Roster", "Admin")).toBe("Roster · Admin · WRHS '98");
    expect(pageTitle()).toBe("WRHS '98");
  });

  it("uses the class year and school in the suggestion choices", () => {
    expect(CONNECTIONS.early).toBe(`Graduated early (${SCHOOL.classYear - 1} or before)`);
    expect(CONNECTIONS.late).toBe("Graduated later (1999 or after)");
    expect(CONNECTIONS.elsewhere).toBe("Attended Washburn Rural but graduated somewhere else");
  });
});
