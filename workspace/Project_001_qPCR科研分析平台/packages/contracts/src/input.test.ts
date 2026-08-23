import { describe, expect, test } from "vitest";
import {
  normalizeImportedWells,
  analysisConfigSchema,
  qcDecisionSchema,
  experimentInputJsonSchema,
  validateExperimentDesign,
  type ExperimentInput
} from "./index";

const base: ExperimentInput = {
  projectId: "p1",
  name: "design validation",
  locale: "en",
  referenceGene: "RPLP0",
  targetGenes: ["IL6"],
  design: "paired_two_group",
  groups: [
    { id: "before", name: "Before", isCalibrator: true },
    { id: "after", name: "After", isCalibrator: false }
  ],
  wells: [
    {
      wellId: "A1",
      sampleId: "before-1",
      biologicalReplicateId: "rep-1",
      technicalReplicateId: "tech-1",
      groupId: "before",
      gene: "IL6",
      geneRole: "target",
      ct: 24,
      status: "accepted"
    },
    {
      wellId: "A2",
      sampleId: "before-1",
      biologicalReplicateId: "rep-1",
      technicalReplicateId: "tech-1",
      groupId: "before",
      gene: "RPLP0",
      geneRole: "reference",
      ct: 20,
      status: "accepted"
    }
  ]
};

describe("experiment design validation", () => {
  test("requires subject identifiers for paired analyses", () => {
    expect(validateExperimentDesign(base)).toEqual([
      {
        code: "MISSING_SUBJECT_ID",
        path: "wells[0].subjectId",
        message: "Paired and repeated designs require subjectId on every well."
      },
      {
        code: "MISSING_SUBJECT_ID",
        path: "wells[1].subjectId",
        message: "Paired and repeated designs require subjectId on every well."
      }
    ]);
  });

  test("requires both factor levels for a two-way design", () => {
    const input: ExperimentInput = { ...base, design: "two_way" };

    expect(validateExperimentDesign(input).map((issue) => issue.code)).toEqual([
      "MISSING_FACTOR_LEVEL",
      "MISSING_FACTOR_LEVEL"
    ]);
  });

  test("detects unmatched paired subjects", () => {
    const input: ExperimentInput = {
      ...base,
      wells: base.wells.map((well) => ({ ...well, subjectId: "subject-1" }))
    };
    expect(validateExperimentDesign(input)).toEqual([
      {
        code: "UNMATCHED_SUBJECT",
        path: "wells.subjectId",
        message: "Subject subject-1 is missing one or more paired groups."
      }
    ]);
  });

  test("detects an incomplete two-factor combination", () => {
    const source = base.wells[0]!;
    const input: ExperimentInput = {
      ...base,
      design: "two_way",
      wells: [
        { ...source, wellId: "F1", factorA: "vehicle", factorB: "early" },
        { ...source, wellId: "F2", factorA: "vehicle", factorB: "late" },
        { ...source, wellId: "F3", factorA: "drug", factorB: "early" }
      ]
    };
    expect(validateExperimentDesign(input).map((issue) => issue.code)).toContain("MISSING_FACTOR_COMBINATION");
  });

  test("reports duplicate well identifiers and unknown groups", () => {
    const input: ExperimentInput = {
      ...base,
      design: "independent_two_group",
      wells: [
        base.wells[0]!,
        { ...base.wells[1]!, wellId: "A1", groupId: "not-defined" }
      ]
    };

    expect(validateExperimentDesign(input).map((issue) => issue.code)).toEqual([
      "DUPLICATE_WELL_ID",
      "UNKNOWN_GROUP"
    ]);
  });
});

describe("spreadsheet import normalization", () => {
  test("maps Undetermined to a null Ct without inventing a cutoff", () => {
    const wells = normalizeImportedWells([
      {
        well_id: "A1",
        sample_id: "s1",
        biological_replicate: "bio-1",
        technical_replicate: "tech-1",
        group: "control",
        gene: "IL6",
        role: "target",
        ct: "Undetermined"
      }
    ]);

    expect(wells[0]).toMatchObject({
      wellId: "A1",
      ct: null,
      status: "undetermined"
    });
  });

  test("rejects nonnumeric Ct text other than known missing markers", () => {
    expect(() =>
      normalizeImportedWells([
        {
          well_id: "A1",
          sample_id: "s1",
          biological_replicate: "bio-1",
          technical_replicate: "tech-1",
          group: "control",
          gene: "IL6",
          role: "target",
          ct: "twenty"
        }
      ])
    ).toThrowError('row 1 has invalid Ct "twenty"');
  });
});

test("publishes a JSON Schema with the required analysis fields", () => {
  expect(experimentInputJsonSchema).toMatchObject({
    type: "object",
    required: expect.arrayContaining([
      "projectId",
      "referenceGene",
      "targetGenes",
      "design",
      "groups",
      "wells"
    ])
  });
});

test("validates explicit statistical and QC decisions", () => {
  expect(
    analysisConfigSchema.parse({
      design: "independent_two_group",
      calibratorGroup: "control",
      contrastMode: "selected",
      correction: "holm",
      method: "recommended",
      alpha: 0.05,
      confidenceLevel: 0.95
    })
  ).toMatchObject({ correction: "holm", confidenceLevel: 0.95 });
  expect(() => analysisConfigSchema.parse({
    design: "one_way",
    calibratorGroup: "control",
    contrastMode: "all_pairs",
    correction: "tukey",
    method: "recommended",
    alpha: 0.05,
    confidenceLevel: 1.2
  })).toThrow();
  expect(qcDecisionSchema.parse({
    wellId: "A1",
    decision: "excluded",
    reason: "Manual review",
    operator: "user-1",
    decidedAt: "2026-08-23T10:00:00.000Z"
  }).decision).toBe("excluded");
});
