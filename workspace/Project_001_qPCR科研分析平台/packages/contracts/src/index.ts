import { z } from "zod";

export const analysisDesignSchema = z.enum([
  "independent_two_group",
  "paired_two_group",
  "one_way",
  "two_way",
  "repeated_time"
]);

export const groupSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  isCalibrator: z.boolean()
});

export const ctWellSchema = z.object({
  wellId: z.string().trim().min(1),
  sampleId: z.string().trim().min(1),
  biologicalReplicateId: z.string().trim().min(1),
  technicalReplicateId: z.string().trim().min(1),
  groupId: z.string().trim().min(1),
  gene: z.string().trim().min(1),
  geneRole: z.enum(["target", "reference"]),
  ct: z.number().finite().nullable(),
  status: z.enum(["accepted", "excluded", "undetermined"]),
  subjectId: z.string().trim().min(1).optional(),
  factorA: z.string().trim().min(1).optional(),
  factorB: z.string().trim().min(1).optional(),
  time: z.number().finite().optional(),
  plateId: z.string().trim().min(1).optional(),
  batch: z.string().trim().min(1).optional()
});

export const experimentInputSchema = z
  .object({
    projectId: z.string().trim().min(1),
    name: z.string().trim().min(1),
    locale: z.enum(["zh-CN", "en"]),
    referenceGene: z.string().trim().min(1),
    targetGenes: z.array(z.string().trim().min(1)).min(1),
    design: analysisDesignSchema,
    groups: z.array(groupSchema).min(2),
    wells: z.array(ctWellSchema).min(1)
  })
  .superRefine((value, context) => {
    const calibrators = value.groups.filter((group) => group.isCalibrator);
    if (calibrators.length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["groups"],
        message: "exactly one calibrator group is required"
      });
    }
    if (new Set(value.targetGenes).size !== value.targetGenes.length) {
      context.addIssue({
        code: "custom",
        path: ["targetGenes"],
        message: "target genes must be unique"
      });
    }
    for (const well of value.wells) {
      if (well.geneRole === "reference" && well.gene !== value.referenceGene) {
        context.addIssue({
          code: "custom",
          path: ["wells"],
          message: `reference well ${well.wellId} must use ${value.referenceGene}`
        });
      }
      if (well.geneRole === "target" && !value.targetGenes.includes(well.gene)) {
        context.addIssue({
          code: "custom",
          path: ["wells"],
          message: `unknown target gene ${well.gene}`
        });
      }
    }
  });

export type AnalysisDesign = z.infer<typeof analysisDesignSchema>;
export type CtWell = z.infer<typeof ctWellSchema>;
export type ExperimentInput = z.infer<typeof experimentInputSchema>;

export type QcCode =
  | "SINGLE_TECHNICAL_REPLICATE"
  | "UNDETERMINED_WELL"
  | "EXCLUDED_WELL"
  | "SINGLE_REFERENCE_GENE";

export interface QcFinding {
  code: QcCode;
  severity: "info" | "warning";
  sampleId?: string;
  gene?: string;
  wellId?: string;
  message: string;
}

export interface SampleExpression {
  sampleId: string;
  biologicalReplicateId: string;
  groupId: string;
  targetGene: string;
  targetMeanCt: number;
  referenceMeanCt: number;
  targetTechnicalN: number;
  referenceTechnicalN: number;
  deltaCt: number;
  deltaDeltaCt: number;
  foldChange: number;
  subjectId?: string;
  factorA?: string;
  factorB?: string;
  time?: number;
}

export interface GroupExpression {
  groupId: string;
  targetGene: string;
  biologicalN: number;
  meanDeltaCt: number;
  geometricMeanFoldChange: number;
}

export interface AnalysisResult {
  projectId: string;
  referenceGene: string;
  samples: SampleExpression[];
  groups: GroupExpression[];
  qc: QcFinding[];
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function acceptedValues(wells: CtWell[]): number[] {
  return wells
    .filter((well) => well.status === "accepted" && well.ct !== null)
    .map((well) => well.ct as number);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function analyzeDeltaDeltaCt(rawInput: ExperimentInput): AnalysisResult {
  const input = experimentInputSchema.parse(rawInput);
  const calibrator = input.groups.find((group) => group.isCalibrator);
  if (!calibrator) throw new Error("calibrator group is required");

  const qc: QcFinding[] = [
    {
      code: "SINGLE_REFERENCE_GENE",
      severity: "info",
      gene: input.referenceGene,
      message: "Single-reference analysis requires an independently validated stable reference gene."
    }
  ];

  for (const well of input.wells) {
    if (well.status === "undetermined" || well.ct === null) {
      qc.push({
        code: "UNDETERMINED_WELL",
        severity: "warning",
        sampleId: well.sampleId,
        gene: well.gene,
        wellId: well.wellId,
        message: `${well.wellId} has no numeric Ct`
      });
    } else if (well.status === "excluded") {
      qc.push({
        code: "EXCLUDED_WELL",
        severity: "info",
        sampleId: well.sampleId,
        gene: well.gene,
        wellId: well.wellId,
        message: `${well.wellId} was excluded by user decision`
      });
    }
  }

  const sampleIds = unique(input.wells.map((well) => well.sampleId));
  const provisional: Omit<SampleExpression, "deltaDeltaCt" | "foldChange">[] = [];

  for (const sampleId of sampleIds) {
    const sampleWells = input.wells.filter((well) => well.sampleId === sampleId);
    const groupIds = unique(sampleWells.map((well) => well.groupId));
    if (groupIds.length !== 1) throw new Error(`${sampleId} belongs to multiple groups`);
    const groupId = groupIds[0];
    if (!groupId || !input.groups.some((group) => group.id === groupId)) {
      throw new Error(`${sampleId} has an unknown group`);
    }

    const referenceWells = sampleWells.filter((well) => well.geneRole === "reference");
    const referenceValues = acceptedValues(referenceWells);
    if (referenceValues.length === 0) {
      throw new Error(`${sampleId} has no accepted reference Ct`);
    }

    for (const targetGene of input.targetGenes) {
      const targetWells = sampleWells.filter(
        (well) => well.geneRole === "target" && well.gene === targetGene
      );
      const targetValues = acceptedValues(targetWells);
      if (targetValues.length === 0) {
        throw new Error(`${sampleId} has no accepted Ct for ${targetGene}`);
      }

      if (targetValues.length === 1) {
        qc.push({
          code: "SINGLE_TECHNICAL_REPLICATE",
          severity: "warning",
          sampleId,
          gene: targetGene,
          message: `${sampleId}/${targetGene} has one accepted technical replicate`
        });
      }
      if (referenceValues.length === 1) {
        qc.push({
          code: "SINGLE_TECHNICAL_REPLICATE",
          severity: "warning",
          sampleId,
          gene: input.referenceGene,
          message: `${sampleId}/${input.referenceGene} has one accepted technical replicate`
        });
      }

      const targetMeanCt = mean(targetValues);
      const referenceMeanCt = mean(referenceValues);
      const firstTarget = targetWells[0];
      provisional.push({
        sampleId,
        biologicalReplicateId: firstTarget?.biologicalReplicateId ?? sampleId,
        groupId,
        targetGene,
        targetMeanCt,
        referenceMeanCt,
        targetTechnicalN: targetValues.length,
        referenceTechnicalN: referenceValues.length,
        deltaCt: targetMeanCt - referenceMeanCt,
        ...(firstTarget?.subjectId ? { subjectId: firstTarget.subjectId } : {}),
        ...(firstTarget?.factorA ? { factorA: firstTarget.factorA } : {}),
        ...(firstTarget?.factorB ? { factorB: firstTarget.factorB } : {}),
        ...(firstTarget?.time !== undefined ? { time: firstTarget.time } : {})
      });
    }
  }

  const samples: SampleExpression[] = provisional.map((sample) => {
    const calibratorValues = provisional
      .filter(
        (candidate) =>
          candidate.groupId === calibrator.id && candidate.targetGene === sample.targetGene
      )
      .map((candidate) => candidate.deltaCt);
    if (calibratorValues.length === 0) {
      throw new Error(`calibrator has no valid values for ${sample.targetGene}`);
    }
    const deltaDeltaCt = sample.deltaCt - mean(calibratorValues);
    return {
      ...sample,
      deltaDeltaCt,
      foldChange: 2 ** -deltaDeltaCt
    };
  });

  const groups: GroupExpression[] = input.groups.flatMap((group) =>
    input.targetGenes.map((targetGene) => {
      const groupSamples = samples.filter(
        (sample) => sample.groupId === group.id && sample.targetGene === targetGene
      );
      return {
        groupId: group.id,
        targetGene,
        biologicalN: unique(
          groupSamples.map((sample) => sample.biologicalReplicateId)
        ).length,
        meanDeltaCt: mean(groupSamples.map((sample) => sample.deltaCt)),
        geometricMeanFoldChange: Math.exp(
          mean(groupSamples.map((sample) => Math.log(sample.foldChange)))
        )
      };
    })
  );

  return {
    projectId: input.projectId,
    referenceGene: input.referenceGene,
    samples,
    groups,
    qc
  };
}

