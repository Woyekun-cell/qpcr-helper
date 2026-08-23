import type { AnalysisResult } from "@qpcr/contracts";

export interface RContrast {
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
    backend: "R/ggplot2";
    widthMm: number;
    heightMm: number;
  };
}
