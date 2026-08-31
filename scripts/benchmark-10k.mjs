import { performance } from "node:perf_hooks";
import { analyzeDeltaDeltaCt } from "../packages/contracts/dist/index.js";

const wells = [];
for (let index = 0; index < 2500; index += 1) {
  const sampleId = `S${index + 1}`;
  const groupId = index < 1250 ? "control" : "treated";
  for (const [gene, geneRole, baseCt] of [
    ["GENE1", "target", groupId === "control" ? 25 : 22],
    ["GAPDH", "reference", 20]
  ]) {
    for (let technical = 1; technical <= 2; technical += 1) {
      wells.push({
        wellId: `${sampleId}-${gene}-${technical}`,
        sampleId,
        biologicalReplicateId: sampleId,
        technicalReplicateId: String(technical),
        groupId,
        gene,
        geneRole,
        ct: baseCt + technical / 100,
        status: "accepted"
      });
    }
  }
}

const input = {
  projectId: "00000000-0000-4000-8000-000000000001",
  name: "10k benchmark",
  locale: "en",
  referenceGene: "GAPDH",
  targetGenes: ["GENE1"],
  design: "independent_two_group",
  groups: [
    { id: "control", name: "Control", isCalibrator: true },
    { id: "treated", name: "Treatment", isCalibrator: false }
  ],
  wells
};

const started = performance.now();
const result = analyzeDeltaDeltaCt(input);
const elapsedMs = performance.now() - started;
console.log(JSON.stringify({ wells: wells.length, samples: result.samples.length, elapsedMs: Math.round(elapsedMs) }));
if (elapsedMs >= 10_000) process.exitCode = 1;
