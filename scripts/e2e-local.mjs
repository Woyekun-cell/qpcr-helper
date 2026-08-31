import { randomUUID } from "node:crypto";

const baseUrl = process.env.QPCR_E2E_URL ?? "http://localhost:3000";
const testSource = `e2e-${randomUUID()}`;

function sampleWells(sampleId, groupId, targetCt, referenceCt) {
  return [
    ...[1, 2].map((replicate) => ({
      wellId: `${sampleId}-T-${replicate}`,
      sampleId,
      biologicalReplicateId: sampleId,
      technicalReplicateId: String(replicate),
      groupId,
      gene: "GENE1",
      geneRole: "target",
      ct: targetCt + (replicate === 1 ? -0.05 : 0.05),
      status: "accepted"
    })),
    ...[1, 2].map((replicate) => ({
      wellId: `${sampleId}-R-${replicate}`,
      sampleId,
      biologicalReplicateId: sampleId,
      technicalReplicateId: String(replicate),
      groupId,
      gene: "GAPDH",
      geneRole: "reference",
      ct: referenceCt + (replicate === 1 ? -0.04 : 0.04),
      status: "accepted"
    }))
  ];
}

const request = {
  experiment: {
    projectId: randomUUID(),
    name: "Eight-fold e2e fixture",
    locale: "en",
    referenceGene: "GAPDH",
    targetGenes: ["GENE1"],
    design: "independent_two_group",
    groups: [
      { id: "control", name: "Control", isCalibrator: true },
      { id: "treated", name: "Treatment", isCalibrator: false }
    ],
    wells: [
      ...sampleWells("C1", "control", 25, 20),
      ...sampleWells("C2", "control", 25.2, 20),
      ...sampleWells("C3", "control", 24.8, 20),
      ...sampleWells("T1", "treated", 22, 20),
      ...sampleWells("T2", "treated", 22.1, 20),
      ...sampleWells("T3", "treated", 21.9, 20)
    ]
  },
  config: {
    design: "independent_two_group",
    calibratorGroup: "control",
    contrastMode: "selected",
    correction: "holm",
    method: "recommended",
    alpha: 0.05,
    confidenceLevel: 0.95
  },
  figure: { plotType: "dot", widthMm: 90, heightMm: 70, dpi: 300 },
  qcDecisions: []
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const createResponse = await fetch(`${baseUrl}/api/analysis-jobs`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-forwarded-for": testSource },
  body: JSON.stringify(request)
});
if (!createResponse.ok) {
  throw new Error(`analysis failed: ${createResponse.status} ${await createResponse.text()}`);
}
const job = await createResponse.json();
assert(job.id && job.token, "guest job did not return an id and capability token");
const treated = job.result.calculation.samples.filter((sample) => sample.groupId === "treated");
const foldChange = Math.exp(treated.reduce((sum, sample) => sum + Math.log(sample.foldChange), 0) / treated.length);
assert(Math.abs(foldChange - 8) < 1e-10, `expected 8-fold expression, got ${foldChange}`);

const authHeaders = { "x-capability-token": job.token, "x-forwarded-for": testSource };
const deniedRead = await fetch(`${baseUrl}/api/analysis-jobs/${job.id}`, {
  headers: { "x-capability-token": `${job.token}invalid` }
});
assert(deniedRead.status === 404, `wrong capability token must return 404, got ${deniedRead.status}`);
const readResponse = await fetch(`${baseUrl}/api/analysis-jobs/${job.id}`, { headers: authHeaders });
assert(readResponse.ok, `job read failed: ${readResponse.status}`);
const stored = await readResponse.json();
assert(!("input" in stored) && !("inputHash" in stored), "guest GET exposed input or request hash");

const changedRequest = structuredClone(request);
changedRequest.experiment.wells[0].ct += 0.5;
const rejectedExport = await fetch(`${baseUrl}/api/analysis-jobs/${job.id}/exports`, {
  method: "POST",
  headers: { ...authHeaders, "Content-Type": "application/json" },
  body: JSON.stringify(changedRequest)
});
assert(rejectedExport.status === 404, `changed input export must return 404, got ${rejectedExport.status}`);

const exportResponse = await fetch(`${baseUrl}/api/analysis-jobs/${job.id}/exports`, {
  method: "POST",
  headers: { ...authHeaders, "Content-Type": "application/json" },
  body: JSON.stringify(request)
});
if (!exportResponse.ok) {
  throw new Error(`export failed: ${exportResponse.status} ${await exportResponse.text()}`);
}
const zip = Buffer.from(await exportResponse.arrayBuffer());
assert(zip.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])), "export is not a ZIP archive");
for (const filename of ["qpcr_roundtrip.xlsx", "figure.svg", "figure.pdf", "methods.txt", "manifest.json"]) {
  assert(zip.includes(Buffer.from(filename)), `ZIP is missing ${filename}`);
}

console.log(JSON.stringify({
  status: "passed",
  foldChange,
  biologicalN: job.result.calculation.groups,
  zipBytes: zip.length,
  rawInputExposed: false,
  wrongTokenRejected: true,
  changedInputRejected: true
}));
