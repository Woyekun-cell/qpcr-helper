import { analysisRequestSchema, prepareAnalysis } from "@/lib/analysis-request";
import { guestJobRepository } from "@/lib/guest-repository";
import { persistAuthenticatedResult } from "@/lib/persistence";
import { allowRequest } from "@/lib/rate-limit";
import { hashAnalysisSource } from "@/lib/request-hash";
import { runRAnalysis } from "@/lib/r-client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allowRequest(ip)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 8_000_000) {
    return NextResponse.json({ error: "REQUEST_TOO_LARGE" }, { status: 413 });
  }
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 8_000_000) {
      return NextResponse.json({ error: "REQUEST_TOO_LARGE" }, { status: 413 });
    }
    const input = analysisRequestSchema.parse(JSON.parse(text));
    const prepared = prepareAnalysis(input);
    const rResult = await runRAnalysis(prepared.statisticsPayload, prepared.previewPayload);
    const result = { calculation: prepared.calculation, ...rResult };
    const authenticated = await persistAuthenticatedResult(input, result);
    if (authenticated) {
      return NextResponse.json({ ...authenticated, status: "succeeded", result }, {
        headers: { "Cache-Control": "no-store" }
      });
    }
    const guest = await guestJobRepository.create({ inputHash: hashAnalysisSource(input), result });
    return NextResponse.json({ ...guest, status: "succeeded", result }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: "ANALYSIS_FAILED", message }, { status: 422 });
  }
}
