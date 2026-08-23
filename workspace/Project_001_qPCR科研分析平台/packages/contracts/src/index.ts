import { z } from "zod";

export const analysisDesignSchema = z.enum([
  "independent_two_group",
  "paired_two_group",
  "one_way",
  "two_way",
  "repeated_time"
]);

export const analysisConfigSchema = z.object({
  design: analysisDesignSchema,
  calibratorGroup: z.string().trim().min(1),
  contrastMode: z.enum(["control", "all_pairs", "selected"]),
  correction: z.enum(["none", "holm", "BH", "tukey", "games-howell", "dunnett"]),
  method: z.enum([
    "recommended",
    "welch_t",
    "paired_t",
    "mann_whitney",
    "wilcoxon",
    "welch_anova",
    "anova",
    "kruskal_wallis",
    "linear_model",
    "mixed_model"
  ]),
  selectedComparisons: z.array(z.object({
    numerator: z.string().trim().min(1),
    denominator: z.string().trim().min(1)
  }).refine((comparison) => comparison.numerator !== comparison.denominator, {
    message: "selected comparison groups must differ"
  })).optional(),
  alpha: z.number().positive().lt(1),
  confidenceLevel: z.number().positive().lt(1)
});

export const qcDecisionSchema = z.object({
  wellId: z.string().trim().min(1),
  decision: z.enum(["accepted", "excluded"]),
  reason: z.string().trim().min(1),
  operator: z.string().trim().min(1),
  decidedAt: z.iso.datetime()
});

export const exportManifestSchema = z.object({
  createdAt: z.iso.datetime(),
  appVersion: z.string().trim().min(1),
  rVersion: z.string().trim().min(1),
  parameters: z.record(z.string(), z.unknown()),
  files: z.array(z.object({
    path: z.string().trim().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().nonnegative()
  }))
});

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

export const experimentInputJsonSchema = z.toJSONSchema(experimentInputSchema, {
  target: "draft-2020-12"
});

export type AnalysisDesign = z.infer<typeof analysisDesignSchema>;
export type AnalysisConfig = z.infer<typeof analysisConfigSchema>;
export type CtWell = z.infer<typeof ctWellSchema>;
export type ExperimentInput = z.infer<typeof experimentInputSchema>;
export type QcDecision = z.infer<typeof qcDecisionSchema>;
export type ExportManifest = z.infer<typeof exportManifestSchema>;

export type QcCode =
  | "TECHNICAL_REPLICATE_DISPERSION"
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
  dispersionCt?: number;
  acceptedTechnicalN?: number;
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

export type DesignIssueCode =
  | "MISSING_SUBJECT_ID"
  | "UNMATCHED_SUBJECT"
  | "MISSING_FACTOR_LEVEL"
  | "MISSING_FACTOR_COMBINATION"
  | "DUPLICATE_WELL_ID"
  | "UNKNOWN_GROUP";

export interface DesignIssue {
  code: DesignIssueCode;
  path: string;
  message: string;
}

export function validateExperimentDesign(input: ExperimentInput): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const wellCounts = new Map<string, number>();
  for (const well of input.wells) {
    wellCounts.set(well.wellId, (wellCounts.get(well.wellId) ?? 0) + 1);
  }

  const duplicateIds = new Set(
    [...wellCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([wellId]) => wellId)
  );
  for (const wellId of duplicateIds) {
    issues.push({
      code: "DUPLICATE_WELL_ID",
      path: "wells",
      message: `Well ID ${wellId} is duplicated.`
    });
  }

  const knownGroups = new Set(input.groups.map((group) => group.id));
  input.wells.forEach((well, index) => {
    if (!knownGroups.has(well.groupId)) {
      issues.push({
        code: "UNKNOWN_GROUP",
        path: `wells[${index}].groupId`,
        message: `Group ${well.groupId} is not defined.`
      });
    }
  });

  if (input.design === "paired_two_group" || input.design === "repeated_time") {
    input.wells.forEach((well, index) => {
      if (!well.subjectId) {
        issues.push({
          code: "MISSING_SUBJECT_ID",
          path: `wells[${index}].subjectId`,
          message: "Paired and repeated designs require subjectId on every well."
        });
      }
    });
    if (input.design === "paired_two_group" && input.wells.every((well) => well.subjectId)) {
      const expectedGroups = new Set(input.groups.map((group) => group.id));
      const subjectIds = unique(input.wells.map((well) => well.subjectId as string));
      for (const subjectId of subjectIds) {
        const observed = new Set(
          input.wells.filter((well) => well.subjectId === subjectId).map((well) => well.groupId)
        );
        if ([...expectedGroups].some((groupId) => !observed.has(groupId))) {
          issues.push({
            code: "UNMATCHED_SUBJECT",
            path: "wells.subjectId",
            message: `Subject ${subjectId} is missing one or more paired groups.`
          });
        }
      }
    }
  }

  if (input.design === "two_way") {
    input.wells.forEach((well, index) => {
      if (!well.factorA || !well.factorB) {
        issues.push({
          code: "MISSING_FACTOR_LEVEL",
          path: `wells[${index}].factorA/factorB`,
          message: "Two-way designs require factorA and factorB on every well."
        });
      }
    });
    if (input.wells.every((well) => well.factorA && well.factorB)) {
      const factorA = unique(input.wells.map((well) => well.factorA as string));
      const factorB = unique(input.wells.map((well) => well.factorB as string));
      const observed = new Set(input.wells.map((well) => `${well.factorA}\u0000${well.factorB}`));
      for (const levelA of factorA) {
        for (const levelB of factorB) {
          if (!observed.has(`${levelA}\u0000${levelB}`)) {
            issues.push({
              code: "MISSING_FACTOR_COMBINATION",
              path: "wells.factorA/factorB",
              message: `Two-way design is missing combination ${levelA} × ${levelB}.`
            });
          }
        }
      }
    }
  }

  return issues;
}

type ImportedRow = Record<string, unknown>;

function requiredText(row: ImportedRow, key: string, rowNumber: number): string {
  const value = row[key];
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`row ${rowNumber} is missing ${key}`);
  }
  const text = String(value).trim();
  if (!text) throw new Error(`row ${rowNumber} is missing ${key}`);
  return text;
}

function optionalText(row: ImportedRow, key: string): string | undefined {
  const value = row[key];
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

export function normalizeImportedWells(rows: ImportedRow[]): CtWell[] {
  const missingMarkers = new Set(["", "na", "n/a", "nd", "undetermined"]);
  return rows.map((row, index) => {
    const rowNumber = index + 1;
    const rawCt = row.ct;
    const ctText = rawCt === null || rawCt === undefined ? "" : String(rawCt).trim();
    const isMissing = missingMarkers.has(ctText.toLowerCase());
    const numericCt = isMissing ? null : Number(ctText);
    if (numericCt !== null && !Number.isFinite(numericCt)) {
      throw new Error(`row ${rowNumber} has invalid Ct "${ctText}"`);
    }
    const role = requiredText(row, "role", rowNumber).toLowerCase();
    if (role !== "target" && role !== "reference") {
      throw new Error(`row ${rowNumber} has invalid role "${role}"`);
    }
    const importedStatus = optionalText(row, "status")?.toLowerCase();
    if (importedStatus && !["accepted", "excluded", "undetermined"].includes(importedStatus)) {
      throw new Error(`row ${rowNumber} has invalid status "${importedStatus}"`);
    }
    const timeText = optionalText(row, "time");
    const time = timeText === undefined ? undefined : Number(timeText);
    if (time !== undefined && !Number.isFinite(time)) {
      throw new Error(`row ${rowNumber} has invalid time "${timeText}"`);
    }

    return {
      wellId: requiredText(row, "well_id", rowNumber),
      sampleId: requiredText(row, "sample_id", rowNumber),
      biologicalReplicateId: requiredText(row, "biological_replicate", rowNumber),
      technicalReplicateId: requiredText(row, "technical_replicate", rowNumber),
      groupId: requiredText(row, "group", rowNumber),
      gene: requiredText(row, "gene", rowNumber),
      geneRole: role,
      ct: numericCt,
      status: (importedStatus ?? (isMissing ? "undetermined" : "accepted")) as CtWell["status"],
      ...(optionalText(row, "subject_id")
        ? { subjectId: optionalText(row, "subject_id") }
        : {}),
      ...(optionalText(row, "factor_a") ? { factorA: optionalText(row, "factor_a") } : {}),
      ...(optionalText(row, "factor_b") ? { factorB: optionalText(row, "factor_b") } : {}),
      ...(time !== undefined ? { time } : {}),
      ...(optionalText(row, "plate_id") ? { plateId: optionalText(row, "plate_id") } : {}),
      ...(optionalText(row, "batch") ? { batch: optionalText(row, "batch") } : {})
    };
  });
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function valueRange(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

function acceptedValues(wells: CtWell[]): number[] {
  return wells
    .filter((well) => well.status === "accepted" && well.ct !== null)
    .map((well) => well.ct as number);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function analysisUnitKey(well: CtWell): string {
  return JSON.stringify([
    well.biologicalReplicateId,
    well.groupId,
    well.subjectId ?? null,
    well.factorA ?? null,
    well.factorB ?? null,
    well.time ?? null
  ]);
}

export function analyzeDeltaDeltaCt(rawInput: ExperimentInput): AnalysisResult {
  const input = experimentInputSchema.parse(rawInput);
  const designIssues = validateExperimentDesign(input);
  if (designIssues.length > 0) {
    throw new Error(designIssues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
  }
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

  const analysisUnitKeys = unique(input.wells.map(analysisUnitKey));
  const provisional: Omit<SampleExpression, "deltaDeltaCt" | "foldChange">[] = [];

  for (const unitKey of analysisUnitKeys) {
    const sampleWells = input.wells.filter((well) => analysisUnitKey(well) === unitKey);
    const biologicalReplicateId = sampleWells[0]?.biologicalReplicateId;
    if (!biologicalReplicateId) throw new Error("analysis unit has no biological replicate ID");
    const sourceSampleIds = unique(sampleWells.map((well) => well.sampleId));
    const sampleId = sourceSampleIds.length === 1 ? sourceSampleIds[0]! : biologicalReplicateId;
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
    if (referenceValues.length > 1) {
      const dispersionCt = valueRange(referenceValues);
      qc.push({
        code: "TECHNICAL_REPLICATE_DISPERSION",
        severity: "info",
        sampleId,
        gene: input.referenceGene,
        dispersionCt,
        acceptedTechnicalN: referenceValues.length,
        message: `${sampleId}/${input.referenceGene} technical Ct range is ${dispersionCt.toFixed(3)}; no automatic exclusion was applied`
      });
    }

    for (const targetGene of input.targetGenes) {
      const targetWells = sampleWells.filter(
        (well) => well.geneRole === "target" && well.gene === targetGene
      );
      const targetValues = acceptedValues(targetWells);
      if (targetValues.length === 0) {
        throw new Error(`${sampleId} has no accepted Ct for ${targetGene}`);
      }

      if (targetValues.length > 1) {
        const dispersionCt = valueRange(targetValues);
        qc.push({
          code: "TECHNICAL_REPLICATE_DISPERSION",
          severity: "info",
          sampleId,
          gene: targetGene,
          dispersionCt,
          acceptedTechnicalN: targetValues.length,
          message: `${sampleId}/${targetGene} technical Ct range is ${dispersionCt.toFixed(3)}; no automatic exclusion was applied`
        });
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
        biologicalReplicateId,
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
