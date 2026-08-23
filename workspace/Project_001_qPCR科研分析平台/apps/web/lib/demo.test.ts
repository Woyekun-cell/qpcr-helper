import {
  analyzeDeltaDeltaCt,
  experimentInputSchema,
  validateExperimentDesign
} from "@qpcr/contracts";
import { describe, expect, it } from "vitest";
import {
  createExampleExperiment,
  exampleCatalog,
  type ExampleId
} from "./demo";

describe("built-in qPCR Helper examples", () => {
  it("publishes six deterministic examples with appropriate figures", () => {
    expect(exampleCatalog.map((example) => example.id)).toEqual([
      "independent_eight_fold",
      "paired_response",
      "dose_response",
      "factorial_interaction",
      "time_course",
      "multi_gene"
    ]);
    expect(exampleCatalog.map((example) => example.figureType)).toEqual([
      "bar",
      "paired",
      "bar",
      "bar",
      "time",
      "heatmap"
    ]);
  });

  it.each<ExampleId>([
    "independent_eight_fold",
    "paired_response",
    "dose_response",
    "factorial_interaction",
    "time_course",
    "multi_gene"
  ])("creates a valid, analyzable %s fixture", (exampleId) => {
    const experiment = createExampleExperiment(exampleId, "en");
    expect(experimentInputSchema.safeParse(experiment).success).toBe(true);
    expect(validateExperimentDesign(experiment)).toEqual([]);
    expect(() => analyzeDeltaDeltaCt(experiment)).not.toThrow();
    expect(new Set(experiment.wells.map((well) => well.wellId)).size).toBe(experiment.wells.length);
  });

  it("keeps the independent reference example at exactly eight-fold", () => {
    const result = analyzeDeltaDeltaCt(createExampleExperiment("independent_eight_fold", "en"));
    const treated = result.groups.find(
      (group) => group.groupId === "treated" && group.targetGene === "GENE1"
    );
    expect(treated?.geometricMeanFoldChange).toBeCloseTo(8, 12);
  });

  it("includes biological and technical replication without inflating n", () => {
    const result = analyzeDeltaDeltaCt(createExampleExperiment("paired_response", "en"));
    expect(result.samples.filter((sample) => sample.groupId === "after")).toHaveLength(6);
    expect(result.samples.every((sample) => sample.targetTechnicalN === 2)).toBe(true);
    expect(result.samples.every((sample) => sample.referenceTechnicalN === 2)).toBe(true);
  });
});
