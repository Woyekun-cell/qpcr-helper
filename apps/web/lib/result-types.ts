import type { AnalysisResult } from "@qpcr/contracts";

export interface RContrast {
  target_gene?: string;
  contrast?: string;
  fold_change?: number;
  fold_change_ci_low?: number;
  fold_change_ci_high?: number;
  p_value?: number;
  p_adjusted?: number;
  p_adjusted_family?: number;
}

export interface RGeneAnalysis {
  method?: string;
  omnibus?: unknown;
  diagnostics?: {
    residual_normality_p?: number;
    variance_homogeneity_p?: number;
    standardized_residual_outlier_count?: number;
    minimum_group_n?: number;
    automatic_switch?: boolean;
    recommendation_note?: string;
    alternative?: string;
  };
}

export interface PlatformAnalysisResult {
  calculation: AnalysisResult;
  statistics: {
    analyses: Record<string, RGeneAnalysis>;
    contrasts: RContrast[];
    warnings?: string[];
  };
  figure: {
    svg: string;
    backend: "R/ggplot2" | "R/ComplexHeatmap";
    plotType?: string;
    palette?: string;
    widthMm: number;
    heightMm: number;
  };
}
