import {
  analysisConfigSchema,
  analyzeDeltaDeltaCt,
  experimentInputSchema,
  qcDecisionSchema,
  type AnalysisConfig,
  type ExperimentInput
} from "@qpcr/contracts";
import { z } from "zod";

export const figureConfigSchema = z.object({
  plotType: z.enum(["bar", "dot", "box", "violin", "paired", "time", "heatmap"]),
  widthMm: z.union([z.literal(90), z.literal(180)]),
  heightMm: z.number().min(45).max(240),
  dpi: z.union([z.literal(300), z.literal(600)]),
  palette: z.enum(["nature-muted", "prism", "okabe-ito", "tol-bright", "cool", "warm"]).default("nature-muted"),
  pLabelMode: z.enum(["stars", "exact", "stars-exact", "none"]).default("stars"),
  showPoints: z.boolean().default(true)
});

export const analysisRequestSchema = z.object({
  experiment: experimentInputSchema,
  config: analysisConfigSchema,
  figure: figureConfigSchema,
  qcDecisions: z.array(qcDecisionSchema).optional()
}).superRefine((value, context) => {
  if (value.config.design !== value.experiment.design) {
    context.addIssue({
      code: "custom",
      path: ["config", "design"],
      message: "analysis design must match experiment design"
    });
  }
  const calibrator = value.experiment.groups.find((group) => group.isCalibrator)?.id;
  if (value.config.calibratorGroup !== calibrator) {
    context.addIssue({
      code: "custom",
      path: ["config", "calibratorGroup"],
      message: "calibrator group must match experiment setup"
    });
  }
  const oneWayOnly = new Set(["dunnett", "tukey", "games-howell"]);
  if (value.config.design !== "one_way" && oneWayOnly.has(value.config.correction)) {
    context.addIssue({
      code: "custom",
      path: ["config", "correction"],
      message: "Dunnett, Tukey and Games-Howell corrections require a one-way design"
    });
  }
  if (value.config.design === "one_way" && value.config.contrastMode === "selected" &&
      (!value.config.selectedComparisons || value.config.selectedComparisons.length === 0)) {
    context.addIssue({
      code: "custom",
      path: ["config", "selectedComparisons"],
      message: "selected one-way contrasts require at least one group pair"
    });
  }
  const allowedMethods: Record<AnalysisConfig["design"], Set<AnalysisConfig["method"]>> = {
    independent_two_group: new Set(["recommended", "welch_t", "mann_whitney"]),
    paired_two_group: new Set(["recommended", "paired_t", "wilcoxon"]),
    one_way: new Set(["recommended", "welch_anova", "anova", "kruskal_wallis"]),
    two_way: new Set(["recommended", "linear_model"]),
    repeated_time: new Set(["recommended", "mixed_model"])
  };
  if (!allowedMethods[value.config.design].has(value.config.method)) {
    context.addIssue({
      code: "custom",
      path: ["config", "method"],
      message: "statistical method must match the declared design"
    });
  }
});

export type AnalysisRequest = z.input<typeof analysisRequestSchema>;

export function prepareAnalysis(request: AnalysisRequest) {
  const parsed = analysisRequestSchema.parse(request);
  const calculation = analyzeDeltaDeltaCt(parsed.experiment);
  return {
    calculation,
    statisticsPayload: {
      samples: calculation.samples,
      config: {
        design: parsed.config.design,
        calibratorGroup: parsed.config.calibratorGroup,
        correction: parsed.config.correction,
        contrastMode: parsed.config.contrastMode,
        method: parsed.config.method,
        selectedComparisons: parsed.config.selectedComparisons,
        alpha: parsed.config.alpha,
        confidenceLevel: parsed.config.confidenceLevel
      }
    },
    previewPayload: {
      samples: calculation.samples,
      config: {
        calibratorGroup: parsed.config.calibratorGroup,
        confidenceLevel: parsed.config.confidenceLevel
      },
      figure: parsed.figure,
      title: null
    }
  };
}

export function defaultAnalysisConfig(experiment: ExperimentInput): AnalysisConfig {
  const oneWay = experiment.design === "one_way";
  return {
    design: experiment.design,
    calibratorGroup: experiment.groups.find((group) => group.isCalibrator)?.id ?? "",
    contrastMode: oneWay ? "control" : "selected",
    correction: oneWay ? "dunnett" : "holm",
    method: "recommended",
    alpha: 0.05,
    confidenceLevel: 0.95
  };
}
