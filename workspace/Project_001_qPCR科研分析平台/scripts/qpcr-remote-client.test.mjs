import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { analyzeWithHelper, RemoteAnalysisError } from "./lib/qpcr-remote-client.mjs";

const request = {
  experiment: { name: "AI normalized qPCR", wells: [] },
  config: { calibratorGroup: "control", confidenceLevel: 0.95 },
  figure: { plotType: "bar", widthMm: 90, heightMm: 70, dpi: 300 }
};

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function readJson(incoming) {
  const chunks = [];
  for await (const chunk of incoming) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

test("calls Helper analysis, figure, and protected export endpoints with one normalized request", async () => {
  const calls = [];
  await withServer(async (incoming, outgoing) => {
    const body = await readJson(incoming);
    calls.push({ url: incoming.url, token: incoming.headers["x-capability-token"], body });
    if (incoming.url === "/api/analysis-jobs") {
      outgoing.setHeader("content-type", "application/json");
      outgoing.end(JSON.stringify({
        id: "job-1",
        token: "secret-token",
        status: "succeeded",
        result: {
          calculation: { samples: [{ sampleId: "C1", biologicalReplicateId: "C1", groupId: "control", targetGene: "IL6", deltaCt: 5, foldChange: 1 }] },
          statistics: { contrasts: [{ contrast: "treated - control", p_adjusted: 0.004 }] },
          figure: { svg: "<svg/>" }
        }
      }));
      return;
    }
    if (incoming.url === "/api/figure-download") {
      outgoing.end(`figure-${body.format}`);
      return;
    }
    if (incoming.url === "/api/analysis-jobs/job-1/exports") {
      outgoing.end("PK research package");
      return;
    }
    outgoing.writeHead(404).end();
  }, async (baseUrl) => {
    const output = await analyzeWithHelper({
      request,
      baseUrl,
      figureFormats: ["svg", "png"],
      includeResearchPackage: true
    });
    assert.equal(output.analysis.status, "succeeded");
    assert.equal(output.artifacts.get("figure.svg").toString(), "figure-svg");
    assert.equal(output.artifacts.get("figure.png").toString(), "figure-png");
    assert.equal(output.artifacts.get("qpcr-helper-research-package.zip").toString(), "PK research package");
  });

  assert.deepEqual(calls.map((call) => call.url), [
    "/api/analysis-jobs",
    "/api/figure-download",
    "/api/figure-download",
    "/api/analysis-jobs/job-1/exports"
  ]);
  assert.equal(calls[1].body.format, "svg");
  assert.equal(calls[2].body.format, "png");
  assert.equal(calls[3].token, "secret-token");
  assert.deepEqual(calls[3].body, request);
});

test("reports Helper HTTP failures without hiding the server message", async () => {
  await withServer(async (incoming, outgoing) => {
    await readJson(incoming);
    outgoing.writeHead(422, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ error: "ANALYSIS_FAILED", message: "missing reference gene" }));
  }, async (baseUrl) => {
    await assert.rejects(
      analyzeWithHelper({ request, baseUrl }),
      (error) => error instanceof RemoteAnalysisError && error.status === 422 && /missing reference gene/.test(error.message)
    );
  });
});
