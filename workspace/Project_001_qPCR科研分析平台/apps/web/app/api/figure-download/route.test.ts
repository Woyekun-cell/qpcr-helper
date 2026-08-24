import { beforeEach, describe, expect, it, vi } from "vitest";

const { runRFigure } = vi.hoisted(() => ({ runRFigure: vi.fn() }));
vi.mock("@/lib/r-client", () => ({ runRFigure }));
vi.mock("@/lib/rate-limit", () => ({ allowRequest: () => true }));

import { POST } from "./route";

const payload = {
  samples: [{ sampleId: "s1", biologicalReplicateId: "b1", groupId: "control", targetGene: "IL6", deltaCt: 5, foldChange: 1 }],
  config: { calibratorGroup: "control", confidenceLevel: 0.95 },
  figure: {
    plotType: "bar", widthMm: 90, heightMm: 70, dpi: 600,
    palette: "nature-muted", pLabelMode: "stars", showPoints: true, pointShape: "circle"
  },
  analysis: { contrasts: [] },
  title: null,
  format: "png"
};

describe("direct figure download", () => {
  beforeEach(() => runRFigure.mockReset());

  it("returns the selected R-rendered format as an attachment", async () => {
    runRFigure.mockResolvedValue(new Uint8Array([137, 80, 78, 71]).buffer);
    const response = await POST(new Request("http://localhost/api/figure-download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toContain("qpcr-helper-figure.png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
  });

  it("rejects unsupported formats before calling R", async () => {
    const response = await POST(new Request("http://localhost/api/figure-download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, format: "jpg" })
    }));
    expect(response.status).toBe(422);
    expect(runRFigure).not.toHaveBeenCalled();
  });
});
