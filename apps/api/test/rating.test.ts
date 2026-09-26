import { describe, expect, it } from "vitest";

import { RATINGS, ratingToValue, valueToRating } from "../src/lib/rating.js";

describe("verdicts", () => {
  it("round-trip through their stored values 1-4", () => {
    expect(RATINGS.map(ratingToValue)).toEqual([1, 2, 3, 4]);
    for (const rating of RATINGS) expect(valueToRating(ratingToValue(rating))).toBe(rating);
  });

  it("round averages to the nearest verdict, halves up", () => {
    expect(valueToRating(2.49)).toBe("timepass");
    expect(valueToRating(2.5)).toBe("go_for_it");
    expect(valueToRating(3.6)).toBe("perfection");
  });

  it("clamps anything out of range", () => {
    expect(valueToRating(0)).toBe("skip");
    expect(valueToRating(9)).toBe("perfection");
  });
});
