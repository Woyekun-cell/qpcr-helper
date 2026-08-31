import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { loadAnalysisRequest, parseCliArguments, writeAnalysisOutput } from "./lib/qpcr-remote-io.mjs";
import { runRemoteAnalysisCommand } from "./lib/qpcr-remote-command.mjs";

test("parses stdin, output formats, package, and Helper URL options", () => {
  assert.deepEqual(parseCliArguments([
    "--",
    "--input", "-",
    "--output", "/tmp/qpcr-result",
    "--formats", "svg,pdf,png",
    "--package",
    "--url", "https://example.test"
  ]), {
    input: "-",
    output: "/tmp/qpcr-result",
    figureFormats: ["svg", "pdf", "png"],
    includeResearchPackage: true,
    baseUrl: "https://example.test"
  });
});

test("loads AI-normalized Helper JSON from stdin", async () => {
  const parsed = await loadAnalysisRequest("-", Readable.from([JSON.stringify({ experiment: { name: "chat data" } })]));
  assert.equal(parsed.experiment.name, "chat data");
});

test("writes result and artifacts without persisting the guest capability token", async () => {
  const directory = await mkdtemp(join(tmpdir(), "qpcr-helper-"));
  await writeAnalysisOutput(directory, {
    analysis: {
      id: "job-1",
      token: "do-not-save",
      status: "succeeded",
      result: { calculation: { groups: [] }, statistics: { contrasts: [] } }
    },
    artifacts: new Map([
      ["figure.svg", Buffer.from("<svg/>")],
      ["qpcr-helper-research-package.zip", Buffer.from("PK")]
    ])
  });
  const saved = JSON.parse(await readFile(join(directory, "analysis-result.json"), "utf8"));
  assert.equal(saved.status, "succeeded");
  assert.equal("token" in saved, false);
  assert.equal(await readFile(join(directory, "figure.svg"), "utf8"), "<svg/>");
});

test("runs one command from normalized JSON through analysis to saved output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "qpcr-helper-command-"));
  const input = join(directory, "request.json");
  const output = join(directory, "result");
  await writeFile(input, JSON.stringify({ experiment: { name: "AI data" } }));
  const summary = await runRemoteAnalysisCommand({
    argumentsList: ["--input", input, "--output", output, "--formats", "svg", "--package"],
    analyze: async ({ request, figureFormats, includeResearchPackage }) => {
      assert.equal(request.experiment.name, "AI data");
      assert.deepEqual(figureFormats, ["svg"]);
      assert.equal(includeResearchPackage, true);
      return {
        analysis: { id: "job-2", token: "hidden", status: "succeeded", result: {} },
        artifacts: new Map([["figure.svg", Buffer.from("figure")]])
      };
    }
  });
  assert.deepEqual(summary, { outputDirectory: output, jobId: "job-2", files: ["analysis-result.json", "figure.svg"] });
  assert.equal(await readFile(join(output, "figure.svg"), "utf8"), "figure");
});
