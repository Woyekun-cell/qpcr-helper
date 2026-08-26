import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_HELPER_URL } from "./qpcr-remote-client.mjs";

export function parseCliArguments(argumentsList) {
  const options = {
    input: null,
    output: "qpcr-helper-output",
    figureFormats: ["svg"],
    includeResearchPackage: false,
    baseUrl: DEFAULT_HELPER_URL
  };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--") continue;
    if (argument === "--package") {
      options.includeResearchPackage = true;
      continue;
    }
    const value = argumentsList[index + 1];
    if (!value) throw new TypeError(`missing value for ${argument}`);
    if (argument === "--input") options.input = value;
    else if (argument === "--output") options.output = value;
    else if (argument === "--formats") options.figureFormats = value.split(",").map((item) => item.trim()).filter(Boolean);
    else if (argument === "--url") options.baseUrl = value;
    else throw new TypeError(`unknown option: ${argument}`);
    index += 1;
  }
  if (!options.input) throw new TypeError("--input is required; use - for stdin");
  return options;
}

async function readStream(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

export async function loadAnalysisRequest(input, stdin = process.stdin) {
  const source = input === "-" ? await readStream(stdin) : await readFile(input, "utf8");
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new SyntaxError(`invalid qPCR Helper JSON: ${error instanceof Error ? error.message : "parse failed"}`);
  }
}

export async function writeAnalysisOutput(directory, output) {
  await mkdir(directory, { recursive: true });
  const { token: _token, ...safeAnalysis } = output.analysis;
  await writeFile(join(directory, "analysis-result.json"), `${JSON.stringify(safeAnalysis, null, 2)}\n`);
  for (const [filename, content] of output.artifacts) {
    await writeFile(join(directory, filename), content);
  }
}
