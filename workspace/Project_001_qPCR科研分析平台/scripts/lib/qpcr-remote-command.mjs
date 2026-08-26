import { analyzeWithHelper } from "./qpcr-remote-client.mjs";
import { loadAnalysisRequest, parseCliArguments, writeAnalysisOutput } from "./qpcr-remote-io.mjs";

export async function runRemoteAnalysisCommand({
  argumentsList,
  stdin = process.stdin,
  analyze = analyzeWithHelper
}) {
  const options = parseCliArguments(argumentsList);
  const request = await loadAnalysisRequest(options.input, stdin);
  const result = await analyze({
    request,
    baseUrl: options.baseUrl,
    figureFormats: options.figureFormats,
    includeResearchPackage: options.includeResearchPackage
  });
  await writeAnalysisOutput(options.output, result);
  return {
    outputDirectory: options.output,
    jobId: result.analysis.id,
    files: ["analysis-result.json", ...result.artifacts.keys()]
  };
}
