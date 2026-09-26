import { describe, expect, it } from "vitest";

import { isMonday, mondayOf } from "../src/lib/week.js";

describe("mondayOf", () => {
  it.each([
    ["a Wednesday", "2026-09-23T12:00:00Z", "2026-09-21"],
    ["a Monday", "2026-09-21T12:00:00Z", "2026-09-21"],
    ["a Sunday (end of the week)", "2026-09-27T12:00:00Z", "2026-09-21"],
    ["across a month boundary", "2026-10-02T12:00:00Z", "2026-09-28"],
    ["across a year boundary", "2027-01-01T12:00:00Z", "2026-12-28"],
    ["a leap day", "2028-02-29T12:00:00Z", "2028-02-28"],
  ])("finds the Monday for %s", (_name, instant, expected) => {
    expect(mondayOf(new Date(instant), "Asia/Kolkata")).toBe(expected);
  });

  it("uses the club's timezone, not the server's", () => {
    // Sunday 20:00 UTC is already Monday 01:30 in India, but still Sunday in New York.
    const sundayEveningUtc = new Date("2026-09-27T20:00:00Z");

    expect(mondayOf(sundayEveningUtc, "Asia/Kolkata")).toBe("2026-09-28");
    expect(mondayOf(sundayEveningUtc, "America/New_York")).toBe("2026-09-21");
  });
});

describe("isMonday", () => {
  it.each([
    ["2026-09-21", true],
    ["2026-09-22", false],
    ["2026-02-30", false], // not a real date
    ["2026-9-21", false], // not zero-padded
    ["yesterday", false],
  ])("%s -> %s", (value, expected) => {
    expect(isMonday(value)).toBe(expected);
  });
});
