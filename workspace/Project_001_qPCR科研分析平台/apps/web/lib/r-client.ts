const ANALYSIS_TIMEOUT_MS = 60_000;

function serviceUrl(path: string): string {
  const base = process.env.ANALYSIS_R_URL?.replace(/\/$/, "");
  if (!base) throw new Error("ANALYSIS_R_URL is not configured");
  return `${base}${path}`;
}

function serviceHeaders(): HeadersInit {
  const secret = process.env.ANALYSIS_R_SHARED_SECRET;
  if (!secret) throw new Error("ANALYSIS_R_SHARED_SECRET is not configured");
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json"
  };
}

async function post(path: string, payload: unknown): Promise<Response> {
  const response = await fetch(serviceUrl(path), {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`R analysis failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  return response;
}

export async function runRAnalysis(statisticsPayload: unknown, previewPayload: unknown) {
  const [statisticsResponse, previewResponse] = await Promise.all([
    post("/v1/analyze", statisticsPayload),
    post("/v1/preview", previewPayload)
  ]);
  return {
    statistics: await statisticsResponse.json(),
    figure: await previewResponse.json()
  };
}

export async function runRExport(payload: unknown): Promise<ArrayBuffer> {
  return (await post("/v1/export", payload)).arrayBuffer();
}
