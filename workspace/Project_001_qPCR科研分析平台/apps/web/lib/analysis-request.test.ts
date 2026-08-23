import { describe, expect, it } from "vitest";
import { createDemoExperiment } from "./demo";
import { defaultAnalysisConfig, prepareAnalysis } from "./analysis-request";

describe("analysis API preparation", () => {
  it("preserves the validated 8-fold calculation for the R service", () => {
    const experiment = createDemoExperiment("en");
    const prepared = prepareAnalysis({
      experiment,
      config: defaultAnalysisConfig(experiment),
      figure: { plotType: "dot", widthMm: 90, heightMm: 70, dpi: 300 }
    });
    const treated = prepared.calculation.samples.filter((sample) => sample.groupId === "treated");
    const geometricMean = Math.exp(
      treated.reduce((sum, sample) => sum + Math.log(sample.foldChange), 0) / treated.length
    );
    expect(geometricMean).toBeCloseTo(8, 12);
    expect(prepared.statisticsPayload.samples).toHaveLength(6);
  });

  it("rejects a specialized one-way correction for a two-group model", () => {
    const experiment = createDemoExperiment("en");
    expect(() => prepareAnalysis({
      experiment,
      config: { ...defaultAnalysisConfig(experiment), correction: "tukey" },
      figure: { plotType: "dot", widthMm: 90, heightMm: 70, dpi: 300 }
    })).toThrow(/one-way/i);
  });

  it("defaults one-way control comparisons to Dunnett", () => {
    const experiment = { ...createDemoExperiment("en"), design: "one_way" as const };
    expect(defaultAnalysisConfig(experiment)).toMatchObject({
      contrastMode: "control",
      correction: "dunnett"
    });
  });
});
