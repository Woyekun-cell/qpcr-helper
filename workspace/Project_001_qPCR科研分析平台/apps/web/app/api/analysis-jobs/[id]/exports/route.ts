import { guestJobRepository } from "@/lib/guest-repository";
import { persistAuthenticatedArtifact, readAuthenticatedExportSource } from "@/lib/persistence";
import { runRExport } from "@/lib/r-client";
import { allowRequest } from "@/lib/rate-limit";
import type { AnalysisRequest } from "@/lib/analysis-request";
import type { PlatformAnalysisResult } from "@/lib/result-types";
import { NextResponse } from "next/server";

function exportPayload(input: AnalysisRequest, result: PlatformAnalysisResult) {
  const analyses = Object.values(result.statistics.analyses);
  return {
    projectName: input.experiment.name,
    rawWells: input.experiment.wells,
    samples: result.calculation.samples,
    qc: [...result.calculation.qc, ...(input.qcDecisions ?? [])],
    analysis: {
      method: analyses.map((item) => item.method).filter(Boolean).join("; ") || "Design-driven model",
      contrasts: result.statistics.contrasts,
      omnibus: analyses.map((item) => item.omnibus).filter(Boolean)
    },
    config: input.config,
    figure: input.figure,
    locale: input.experiment.locale === "zh-CN" ? "zh" : "en"
  };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allowRequest(`export:${ip}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }
  const { id } = await context.params;
  let input: AnalysisRequest | null = null;
  let result: PlatformAnalysisResult | null = null;
  const authenticated = await readAuthenticatedExportSource(id);
  if (authenticated) {
    input = authenticated.input as AnalysisRequest;
    result = authenticated.result as PlatformAnalysisResult;
  }
  if (!authenticated) {
    const guest = await guestJobRepository.read(id, request.headers.get("x-capability-token") ?? "");
    if (guest) {
      input = guest.input as AnalysisRequest;
      result = guest.result as PlatformAnalysisResult;
    }
  }
  if (!input || !result) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  try {
    const zip = await runRExport(exportPayload(input, result));
    if (authenticated) await persistAuthenticatedArtifact(id, zip);
    return new Response(zip, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": "attachment; filename=qpcr-research-package.zip",
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json({
      error: "EXPORT_FAILED",
      message: error instanceof Error ? error.message : "Export failed"
    }, { status: 422 });
  }
}
