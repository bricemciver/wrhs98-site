import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("first_name,last_name\nJen,Smith\n")).toEqual([
      ["first_name", "last_name"],
      ["Jen", "Smith"],
    ]);
  });

  it("handles quoted commas, escaped quotes, and newlines inside quotes", () => {
    expect(parseCsv('a,b\n"Smith, Jr.","She said ""hi"""\n"two\nlines",x')).toEqual([
      ["a", "b"],
      ["Smith, Jr.", 'She said "hi"'],
      ["two\nlines", "x"],
    ]);
  });

  it("accepts CRLF and a final row without a newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("strips a UTF-8 byte order mark from Excel exports", () => {
    expect(parseCsv("﻿first_name\nJen")[0]).toEqual(["first_name"]);
  });

  it("drops blank lines and rows of empty fields", () => {
    expect(parseCsv("a\n\n , \nb\n")).toEqual([["a"], ["b"]]);
  });

  it("keeps empty fields within a row", () => {
    expect(parseCsv("Jen,,Topeka")).toEqual([["Jen", "", "Topeka"]]);
  });
});
