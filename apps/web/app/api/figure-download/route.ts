import { figureConfigSchema } from "@/lib/analysis-request";
import { allowRequest } from "@/lib/rate-limit";
import { runRFigure } from "@/lib/r-client";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const formatSchema = z.enum(["svg", "pdf", "png", "tiff"]);
const requestSchema = z.object({
  samples: z.array(z.object({
    sampleId: z.string().min(1),
    biologicalReplicateId: z.string().min(1),
    groupId: z.string().min(1),
    targetGene: z.string().min(1),
    deltaCt: z.number().finite(),
    foldChange: z.number().positive().finite()
  }).passthrough()).min(1).max(10_000),
  config: z.object({
    calibratorGroup: z.string().min(1),
    confidenceLevel: z.number().positive().lt(1)
  }),
  figure: figureConfigSchema,
  analysis: z.object({
    contrasts: z.array(z.record(z.string(), z.unknown())).max(5_000)
  }).passthrough(),
  title: z.string().max(200).nullable().optional(),
  format: formatSchema
});

const contentTypes: Record<z.infer<typeof formatSchema>, string> = {
  svg: "image/svg+xml",
  pdf: "application/pdf",
  png: "image/png",
  tiff: "image/tiff"
};

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allowRequest(`figure-download:${ip}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 4_000_000) {
      return NextResponse.json({ error: "REQUEST_TOO_LARGE" }, { status: 413 });
    }
    const payload = requestSchema.parse(JSON.parse(text));
    const file = await runRFigure(payload);
    return new Response(file, {
      status: 200,
      headers: {
        "Content-Type": contentTypes[payload.format],
        "Content-Disposition": `attachment; filename=qpcr-helper-figure.${payload.format}`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json({
      error: "FIGURE_DOWNLOAD_FAILED",
      message: error instanceof Error ? error.message : "Figure download failed"
    }, { status: 422 });
  }
}
