export const DEFAULT_HELPER_URL = "https://qpcr-helper-web-production.up.railway.app";

const supportedFormats = new Set(["svg", "pdf", "png", "tiff"]);

export class RemoteAnalysisError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = "RemoteAnalysisError";
    this.status = status;
    this.details = details;
  }
}

function endpoint(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

async function readFailure(response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    return { message: parsed.message ?? parsed.error ?? text, details: parsed };
  } catch {
    return { message: text || response.statusText, details: text };
  }
}

async function postJson(fetchImpl, url, body, headers = {}) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const failure = await readFailure(response);
    throw new RemoteAnalysisError(`qPCR Helper ${response.status}: ${failure.message}`, response.status, failure.details);
  }
  return response;
}

function figurePayload(request, analysis, format) {
  return {
    samples: analysis.result.calculation.samples,
    config: {
      calibratorGroup: request.config.calibratorGroup,
      confidenceLevel: request.config.confidenceLevel
    },
    figure: request.figure,
    analysis: { contrasts: analysis.result.statistics.contrasts },
    title: request.experiment.name,
    format
  };
}

export async function analyzeWithHelper({
  request,
  baseUrl = DEFAULT_HELPER_URL,
  figureFormats = [],
  includeResearchPackage = false,
  fetchImpl = globalThis.fetch
}) {
  if (!request || typeof request !== "object") {
    throw new TypeError("request must be a qPCR Helper analysis object");
  }
  if (typeof fetchImpl !== "function") throw new TypeError("fetch is unavailable");
  for (const format of figureFormats) {
    if (!supportedFormats.has(format)) throw new TypeError(`unsupported figure format: ${format}`);
  }

  const analysisResponse = await postJson(fetchImpl, endpoint(baseUrl, "/api/analysis-jobs"), request);
  const analysis = await analysisResponse.json();
  if (!analysis?.id || !analysis?.token || !analysis?.result?.calculation || !analysis?.result?.statistics) {
    throw new RemoteAnalysisError("qPCR Helper returned an incomplete analysis response", 502, analysis);
  }

  const artifacts = new Map();
  for (const format of [...new Set(figureFormats)]) {
    const response = await postJson(
      fetchImpl,
      endpoint(baseUrl, "/api/figure-download"),
      figurePayload(request, analysis, format)
    );
    artifacts.set(`figure.${format}`, Buffer.from(await response.arrayBuffer()));
  }

  if (includeResearchPackage) {
    const response = await postJson(
      fetchImpl,
      endpoint(baseUrl, `/api/analysis-jobs/${encodeURIComponent(analysis.id)}/exports`),
      request,
      { "x-capability-token": analysis.token }
    );
    artifacts.set("qpcr-helper-research-package.zip", Buffer.from(await response.arrayBuffer()));
  }

  return { analysis, artifacts };
}
