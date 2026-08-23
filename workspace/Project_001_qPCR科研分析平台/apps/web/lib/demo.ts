import type { CtWell, ExperimentInput } from "@qpcr/contracts";

function sampleWells(
  sampleId: string,
  groupId: string,
  targetCt: number,
  referenceCt: number
): CtWell[] {
  return [
    ...[1, 2].map((replicate) => ({
      wellId: `${sampleId}-T-${replicate}`,
      sampleId,
      biologicalReplicateId: sampleId,
      technicalReplicateId: String(replicate),
      groupId,
      gene: "GENE1",
      geneRole: "target" as const,
      ct: targetCt + (replicate === 1 ? -0.05 : 0.05),
      status: "accepted" as const
    })),
    ...[1, 2].map((replicate) => ({
      wellId: `${sampleId}-R-${replicate}`,
      sampleId,
      biologicalReplicateId: sampleId,
      technicalReplicateId: String(replicate),
      groupId,
      gene: "GAPDH",
      geneRole: "reference" as const,
      ct: referenceCt + (replicate === 1 ? -0.04 : 0.04),
      status: "accepted" as const
    }))
  ];
}

export function createDemoExperiment(locale: "zh-CN" | "en" = "zh-CN"): ExperimentInput {
  return {
    projectId: crypto.randomUUID(),
    name: locale === "zh-CN" ? "八倍表达演示" : "Eight-fold expression demo",
    locale,
    referenceGene: "GAPDH",
    targetGenes: ["GENE1"],
    design: "independent_two_group",
    groups: [
      { id: "control", name: locale === "zh-CN" ? "对照" : "Control", isCalibrator: true },
      { id: "treated", name: locale === "zh-CN" ? "处理" : "Treatment", isCalibrator: false }
    ],
    wells: [
      ...sampleWells("C1", "control", 25, 20),
      ...sampleWells("C2", "control", 25.2, 20),
      ...sampleWells("C3", "control", 24.8, 20),
      ...sampleWells("T1", "treated", 22, 20),
      ...sampleWells("T2", "treated", 22.1, 20),
      ...sampleWells("T3", "treated", 21.9, 20)
    ]
  };
}
