import { describe, expect, test } from "vitest";
import { analyzeDeltaDeltaCt, type ExperimentInput } from "./index";

function twoGroupExperiment(): ExperimentInput {
  return {
    projectId: "project-1",
    name: "known eight-fold fixture",
    locale: "zh-CN",
    referenceGene: "GAPDH",
    targetGenes: ["GENE1"],
    design: "independent_two_group",
    groups: [
      { id: "control", name: "Control", isCalibrator: true },
      { id: "treated", name: "Treated", isCalibrator: false }
    ],
    wells: [
      ...wellsForSample("c1", "control", "GENE1", [25, 25]),
      ...wellsForSample("c1", "control", "GAPDH", [20, 20], "reference"),
      ...wellsForSample("c2", "control", "GENE1", [25, 25]),
      ...wellsForSample("c2", "control", "GAPDH", [20, 20], "reference"),
      ...wellsForSample("t1", "treated", "GENE1", [22, 22]),
      ...wellsForSample("t1", "treated", "GAPDH", [20, 20], "reference"),
      ...wellsForSample("t2", "treated", "GENE1", [22, 22]),
      ...wellsForSample("t2", "treated", "GAPDH", [20, 20], "reference")
    ]
  };
}

function wellsForSample(
  sampleId: string,
  groupId: string,
  gene: string,
  cts: number[],
  geneRole: "target" | "reference" = "target"
) {
  return cts.map((ct, index) => ({
    wellId: `${sampleId}-${gene}-${index + 1}`,
    sampleId,
    biologicalReplicateId: sampleId,
    technicalReplicateId: `tech-${index + 1}`,
    groupId,
    gene,
    geneRole,
    ct,
    status: "accepted" as const
  }));
}

describe("2^-ΔΔCt analysis", () => {
  test("returns an eight-fold treatment effect for the hand-calculated fixture", () => {
    const result = analyzeDeltaDeltaCt(twoGroupExperiment());
    const treated = result.samples.filter((sample) => sample.groupId === "treated");

    expect(treated).toHaveLength(2);
    expect(treated.map((sample) => sample.deltaCt)).toEqual([2, 2]);
    expect(treated.map((sample) => sample.deltaDeltaCt)).toEqual([-3, -3]);
    expect(treated.map((sample) => sample.foldChange)).toEqual([8, 8]);
  });

  test("keeps expression unchanged when target and reference Ct shift equally", () => {
    const original = twoGroupExperiment();
    const shifted: ExperimentInput = {
      ...original,
      wells: original.wells.map((well) =>
        well.ct === null ? well : { ...well, ct: well.ct + 3 }
      )
    };

    const derived = (input: ExperimentInput) =>
      analyzeDeltaDeltaCt(input).samples.map((sample) => ({
        sampleId: sample.sampleId,
        targetGene: sample.targetGene,
        deltaCt: sample.deltaCt,
        deltaDeltaCt: sample.deltaDeltaCt,
        foldChange: sample.foldChange
      }));

    expect(derived(shifted)).toEqual(derived(original));
  });

  test("makes the calibrator group geometric mean equal to one", () => {
    const input = twoGroupExperiment();
    input.wells = input.wells.map((well) => {
      if (well.sampleId !== "c2" || well.geneRole !== "target" || well.ct === null) {
        return well;
      }
      return { ...well, ct: well.ct + 2 };
    });

    const controls = analyzeDeltaDeltaCt(input).samples.filter(
      (sample) => sample.groupId === "control"
    );
    const geometricMean = Math.exp(
      controls.reduce((sum, sample) => sum + Math.log(sample.foldChange), 0) /
        controls.length
    );

    expect(geometricMean).toBeCloseTo(1, 12);
  });

  test("excludes rejected technical wells without changing biological n", () => {
    const input = twoGroupExperiment();
    const rejected = input.wells.find((well) => well.wellId === "t1-GENE1-2");
    if (!rejected) throw new Error("fixture well missing");
    rejected.status = "excluded";

    const result = analyzeDeltaDeltaCt(input);
    const treatedGene = result.groups.find(
      (group) => group.groupId === "treated" && group.targetGene === "GENE1"
    );
    const t1 = result.samples.find(
      (sample) => sample.sampleId === "t1" && sample.targetGene === "GENE1"
    );

    expect(treatedGene?.biologicalN).toBe(2);
    expect(t1?.targetTechnicalN).toBe(1);
    expect(result.qc.some((item) => item.code === "SINGLE_TECHNICAL_REPLICATE")).toBe(true);
  });

  test("reports technical-replicate dispersion without automatic exclusion", () => {
    const input = twoGroupExperiment();
    const changed = input.wells.find((well) => well.wellId === "t1-GENE1-2");
    if (!changed) throw new Error("fixture well missing");
    changed.ct = 22.4;
    const result = analyzeDeltaDeltaCt(input);
    const finding = result.qc.find(
      (item) => item.code === "TECHNICAL_REPLICATE_DISPERSION" && item.sampleId === "t1" && item.gene === "GENE1"
    );
    expect(finding?.dispersionCt).toBeCloseTo(0.4, 12);
    expect(input.wells.filter((well) => well.sampleId === "t1").every((well) => well.status === "accepted")).toBe(true);
  });

  test("rejects a biological sample without a valid reference Ct", () => {
    const input = twoGroupExperiment();
    input.wells = input.wells.map((well) =>
      well.sampleId === "t2" && well.geneRole === "reference"
        ? { ...well, status: "excluded" as const }
        : well
    );

    expect(() => analyzeDeltaDeltaCt(input)).toThrowError(
      "t2 has no accepted reference Ct"
    );
  });
});
