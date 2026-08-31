import { describe, expect, it } from "vitest";
import { hashAnalysisSource, hashCanonicalJson } from "./request-hash";

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

  it("allows figure styling changes without changing the analysis source identity", () => {
    const source = { experiment: { wells: [{ ct: 25 }] }, config: { method: "welch_t" }, qcDecisions: [] };
    expect(hashAnalysisSource({ ...source, figure: { palette: "nature-muted" } })).toBe(
      hashAnalysisSource({ ...source, figure: { palette: "morandi-sage" } })
    );
    expect(hashAnalysisSource({ ...source, experiment: { wells: [{ ct: 26 }] }, figure: {} })).not.toBe(
      hashAnalysisSource({ ...source, figure: {} })
    );
  });
});
