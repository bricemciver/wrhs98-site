import { describe, expect, it } from "vitest";
import { canonicalStatus, canonicalUrl } from "./canonical";

const SITE = "https://reunion.example.org";

describe("canonicalUrl", () => {
  it("leaves requests on the official address alone", () => {
    expect(canonicalUrl("https://reunion.example.org/photos?x=1", SITE)).toBeNull();
  });

  it("sends other hosts to the same page on the official address", () => {
    expect(canonicalUrl("https://old.example.com/auth/verify?token=abc", SITE)).toBe("https://reunion.example.org/auth/verify?token=abc");
    expect(canonicalUrl("https://www.reunion.example.org/", SITE)).toBe("https://reunion.example.org/");
  });

  it("accepts SITE_URL with a trailing slash", () => {
    expect(canonicalUrl("https://old.example.com/news", `${SITE}/`)).toBe("https://reunion.example.org/news");
  });

  it("never redirects local development or a missing or broken SITE_URL", () => {
    expect(canonicalUrl("http://localhost:5198/", SITE)).toBeNull();
    expect(canonicalUrl("http://127.0.0.1:5198/", SITE)).toBeNull();
    expect(canonicalUrl("https://old.example.com/", undefined)).toBeNull();
    expect(canonicalUrl("https://old.example.com/", "")).toBeNull();
    expect(canonicalUrl("https://old.example.com/", "not a url")).toBeNull();
  });
});

describe("canonicalStatus", () => {
  it("uses 301 for page loads and 308 for form posts", () => {
    expect(canonicalStatus("GET")).toBe(301);
    expect(canonicalStatus("HEAD")).toBe(301);
    expect(canonicalStatus("POST")).toBe(308);
  });
});
