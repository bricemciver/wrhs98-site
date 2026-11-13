import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { isOwnerEmail, ownerEmails, safeRedirect } from "./auth.server";

describe("safeRedirect", () => {
  it("allows same-site paths", () => {
    expect(safeRedirect("/directory?q=smith")).toBe("/directory?q=smith");
  });

  it("refuses anything that could leave the site", () => {
    expect(safeRedirect("https://evil.example")).toBe("/");
    expect(safeRedirect("//evil.example")).toBe("/");
    expect(safeRedirect("/\\evil.example")).toBe("/");
    expect(safeRedirect("directory")).toBe("/");
  });

  it("uses the fallback for missing values", () => {
    expect(safeRedirect(null, "/news")).toBe("/news");
    expect(safeRedirect("", "/news")).toBe("/news");
  });
});

// The test stub's env is a plain object; set vars on it directly.
const vars = env as unknown as Record<string, unknown>;

describe("owners", () => {
  afterEach(() => {
    vars.ADMIN_EMAILS = "";
  });

  it("reads ADMIN_EMAILS, ignoring case, spaces, and empty entries", () => {
    vars.ADMIN_EMAILS = " Owner@Example.com, ,second@example.com ";
    expect(ownerEmails()).toEqual(["owner@example.com", "second@example.com"]);
    expect(isOwnerEmail("OWNER@example.com ")).toBe(true);
    expect(isOwnerEmail("someone@example.com")).toBe(false);
  });

  it("has no owners when unset", () => {
    expect(isOwnerEmail("owner@example.com")).toBe(false);
  });
});
