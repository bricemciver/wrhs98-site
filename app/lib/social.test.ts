import { describe, expect, it } from "vitest";
import { cleanLinks, linkLabel, MAX_LINKS, normalizeUrl, parseLinks, serializeLinks } from "./social";

describe("normalizeUrl", () => {
  it("adds https:// to bare hosts", () => {
    expect(normalizeUrl(" facebook.com/jen ")).toBe("https://facebook.com/jen");
  });

  it("keeps http and https URLs", () => {
    expect(normalizeUrl("http://example.com")).toBe("http://example.com/");
    expect(normalizeUrl("https://www.linkedin.com/in/jen")).toBe("https://www.linkedin.com/in/jen");
  });

  it("rejects other schemes so links can't run script", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("data:text/html,hi")).toBeNull();
    expect(normalizeUrl("mailto:jen@example.com")).toBeNull();
  });

  it("rejects hosts without a dot, blanks, and overlong URLs", () => {
    expect(normalizeUrl("localhost")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
    expect(normalizeUrl(`example.com/${"a".repeat(300)}`)).toBeNull();
  });
});

describe("cleanLinks", () => {
  it("skips blanks, removes duplicates, and caps the count", () => {
    const inputs = ["", "a.com", "https://a.com/", ...Array.from({ length: 10 }, (_, i) => `site${i}.com`)];
    const result = cleanLinks(inputs);
    expect("links" in result && result.links.length).toBe(MAX_LINKS);
    expect("links" in result && result.links[0]).toBe("https://a.com/");
  });

  it("reports the first invalid input", () => {
    expect(cleanLinks(["a.com", "not a link", "javascript:x"])).toEqual({ invalid: "not a link" });
  });
});

describe("parseLinks", () => {
  it("round-trips serialized links", () => {
    const links = ["https://a.com/", "https://b.com/x"];
    expect(parseLinks(serializeLinks(links))).toEqual(links);
    expect(serializeLinks([])).toBeNull();
  });

  it("drops unsafe or non-string entries and tolerates bad JSON", () => {
    expect(parseLinks('["https://ok.com/", "javascript:alert(1)", 5, null]')).toEqual(["https://ok.com/"]);
    expect(parseLinks("{not json")).toEqual([]);
    expect(parseLinks('{"a":1}')).toEqual([]);
    expect(parseLinks(null)).toEqual([]);
  });
});

describe("linkLabel", () => {
  it("names known platforms, including mobile and www hosts", () => {
    expect(linkLabel("https://m.facebook.com/jen")).toBe("Facebook");
    expect(linkLabel("https://www.linkedin.com/in/jen")).toBe("LinkedIn");
    expect(linkLabel("https://twitter.com/jen")).toBe("X");
  });

  it("falls back to the hostname", () => {
    expect(linkLabel("https://www.jensmith.com/blog")).toBe("jensmith.com");
  });

  it("doesn't treat look-alike domains as the platform", () => {
    expect(linkLabel("https://notfacebook.com/x")).toBe("notfacebook.com");
  });
});
