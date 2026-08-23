import { describe, expect, it } from "vitest";
import { hashCanonicalJson } from "./request-hash";

describe("canonical request hashing", () => {
  it("is stable across object key ordering", () => {
    expect(hashCanonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      hashCanonicalJson({ a: { c: 3, d: 4 }, b: 2 })
    );
  });

  it("changes when a Ct value changes", () => {
    expect(hashCanonicalJson({ wells: [{ ct: 25 }] })).not.toBe(
      hashCanonicalJson({ wells: [{ ct: 26 }] })
    );
  });
});
