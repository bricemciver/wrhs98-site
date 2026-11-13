import { describe, expect, it } from "vitest";
import { emailButton, renderEmail } from "./email-layout";

const site = { name: "Washburn Rural Class of 1998", url: "https://reunion.example.org", contactName: "Pat Classmate" };
const content = {
  subject: "Your sign-in link",
  preview: "Tap to sign in",
  text: "Hi,\n\nHere's your link.\n",
  html: "<p>Hi,</p>",
  reason: "someone entered you@example.com on the sign-in page",
};

describe("renderEmail", () => {
  it("builds a complete HTML document with the body, preview, and footer", () => {
    const { html } = renderEmail(site, content);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<title>Your sign-in link</title>");
    expect(html).toContain("<p>Hi,</p>");
    expect(html).toContain("Tap to sign in");
    expect(html).toContain("You&#39;re getting this email because someone entered you@example.com on the sign-in page.");
    expect(html).toContain("run by Pat Classmate, a classmate");
    expect(html).toContain("reply to this email");
  });

  it("gives the plain-text part the same footer", () => {
    const { text } = renderEmail(site, content);
    expect(text).toMatch(/^Hi,\n\nHere's your link\.\n\n--\n/);
    expect(text).toContain("You're getting this email because someone entered you@example.com on the sign-in page.");
    expect(text).toContain("This email is from reunion.example.org, a private website for Washburn Rural High School's Class of 1998");
    expect(text).toContain("Questions? Just reply to this email");
  });

  it("falls back to a generic sender when no contact name is set", () => {
    const { text } = renderEmail({ ...site, contactName: undefined }, content);
    expect(text).toContain("run by members of the class.");
  });

  it("escapes the subject, preview, and footer", () => {
    const { html } = renderEmail({ ...site, name: "A <b>Site</b>" }, { ...content, subject: "<x>", preview: '"q"', reason: "of <script>" });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Site</b>");
    expect(html).toContain("<title>&lt;x&gt;</title>");
    expect(html).toContain("&quot;q&quot;");
  });
});

describe("emailButton", () => {
  it("shows the raw link too, escaped", () => {
    const out = emailButton("https://x.test/a?b=1&c=2", "Sign in");
    expect(out).toContain('href="https://x.test/a?b=1&amp;c=2"');
    expect(out).toContain("copy this link");
    expect(out.match(/https:\/\/x\.test/g)).toHaveLength(3);
  });
});
