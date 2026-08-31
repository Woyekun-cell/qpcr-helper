import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { analyzeDeltaDeltaCt } from "@qpcr/contracts";
import { Workbench, wellsToText } from "./workbench";
import { createDemoExperiment, createExampleExperiment } from "@/lib/demo";
import type { PlatformAnalysisResult } from "@/lib/result-types";
import { guestProjects } from "@/lib/guest-projects";
import { parseCtText } from "@/lib/import";

describe("qPCR workbench", () => {
  it("loads one of six examples and supports bilingual qPCR Helper branding", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    expect(screen.getByRole("heading", { name: /qPCR Helper/i })).toBeInTheDocument();
    const examples = screen.getByRole("combobox", { name: /示例数据/i });
    expect(examples).toHaveDisplayValue(/选择合成示例/i);
    expect(screen.getAllByRole("option")).toHaveLength(7);
    await user.selectOptions(examples, "multi_gene");
    expect(screen.getByDisplayValue("多基因表达谱演示")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: /目标基因/i })).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: /English/i }));
    expect(screen.getByRole("heading", { name: /qPCR Helper/i })).toBeInTheDocument();
  });

  it("saves and lists a guest project in the project library", async () => {
    await guestProjects.clear();
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getAllByRole("button", { name: /载入演示/i })[0]!);
    await user.click(screen.getByRole("button", { name: /保存项目/i }));
    await user.click(screen.getByRole("button", { name: /^项目$/i }));
    expect(await screen.findByText("八倍表达演示")).toBeInTheDocument();
  });

  it("supports keyboard focus and Escape dismissal for account access", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getByRole("button", { name: /^登录$/i }));
    const dialog = screen.getByRole("dialog", { name: /邮箱登录/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /email/i })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /邮箱登录/i })).not.toBeInTheDocument();
  });

  it("dismisses the modal project library with Escape", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getByRole("button", { name: /^项目$/i }));
    expect(screen.getByRole("dialog", { name: /项目库/i })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /项目库/i })).not.toBeInTheDocument();
  });

  it("lets the researcher confirm alpha and confidence level", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getAllByRole("button", { name: /载入演示/i })[0]!);
    await user.click(screen.getByRole("button", { name: /分析与作图/i }));
    const alpha = screen.getByRole("combobox", { name: /显著性水平/i });
    const confidence = screen.getByRole("combobox", { name: /置信水平/i });
    const method = screen.getByRole("combobox", { name: /统计方法/i });
    await user.selectOptions(alpha, "0.01");
    await user.selectOptions(confidence, "0.9");
    await user.selectOptions(method, "mann_whitney");
    expect(alpha).toHaveValue("0.01");
    expect(confidence).toHaveValue("0.9");
    expect(method).toHaveValue("mann_whitney");
  });

  it("opens the data-and-figure canvas after one-click analysis", async () => {
    const user = userEvent.setup();
    const experiment = createDemoExperiment("zh-CN");
    const result = {
      calculation: analyzeDeltaDeltaCt(experiment),
      statistics: {
        analyses: { GENE1: { method: "Welch t-test" } },
        contrasts: [{
          target_gene: "GENE1",
          contrast: "treated / control",
          fold_change: 8,
          fold_change_ci_low: 7,
          fold_change_ci_high: 9,
          p_adjusted: 0.001
        }]
      },
      figure: {
        svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"><text>figure</text></svg>",
        backend: "R/ggplot2" as const,
        plotType: "bar",
        palette: "nature-muted",
        widthMm: 90,
        heightMm: 70
      }
    } satisfies PlatformAnalysisResult;
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      return url.includes("figure-preview")
        ? { ok: true, json: async () => result.figure }
        : { ok: true, json: async () => ({ id: "job-one-click", result, token: "guest-token" }) };
    }));
    try {
      render(<Workbench />);
      await user.click(screen.getAllByRole("button", { name: /载入演示/i })[0]!);
      await user.click(screen.getByRole("button", { name: /分析与作图/i }));
      await user.click(screen.getAllByRole("button", { name: /运行 R 分析/i })[0]!);
      expect(await screen.findByRole("region", { name: /数据与图/i })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: /图形设置/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /相对表达量/i })).toBeInTheDocument();
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("preserves design metadata when the editable Ct table is serialized", () => {
    const source = createExampleExperiment("paired_response", "zh-CN");
    const roundTripped = parseCtText(wellsToText(source.wells));
    expect(roundTripped).toHaveLength(source.wells.length);
    expect(roundTripped[0]).toMatchObject({
      subjectId: source.wells[0]?.subjectId,
      status: source.wells[0]?.status
    });
  });

  it("clears stale computed values when a statistical setting changes", async () => {
    const user = userEvent.setup();
    const experiment = createDemoExperiment("zh-CN");
    const result = {
      calculation: analyzeDeltaDeltaCt(experiment),
      statistics: { analyses: { GENE1: { method: "Welch t-test" } }, contrasts: [] },
      figure: { svg: "<svg />", backend: "R/ggplot2" as const, widthMm: 90, heightMm: 70 }
    } satisfies PlatformAnalysisResult;
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "job-stale", result }) }));
    try {
      render(<Workbench />);
      await user.click(screen.getAllByRole("button", { name: /载入演示/i })[0]!);
      await user.click(screen.getByRole("button", { name: /分析与作图/i }));
      await user.click(screen.getAllByRole("button", { name: /运行 R 分析/i })[0]!);
      expect(await screen.findByRole("heading", { name: /相对表达量/i })).toBeInTheDocument();
      await user.selectOptions(screen.getByRole("combobox", { name: /置信水平/i }), "0.9");
      expect(screen.queryByRole("heading", { name: /相对表达量/i })).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(/重新运行分析/i);
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("lets researchers choose beta-actin and rename target genes and groups", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getAllByRole("button", { name: /载入演示/i })[0]!);
    const reference = screen.getByRole("combobox", { name: /内参基因/i });
    await user.selectOptions(reference, "β-actin");
    expect(reference).toHaveValue("β-actin");
    expect(screen.getAllByText(/内参|Reference/).length).toBeGreaterThan(0);

    const target = screen.getByRole("textbox", { name: /目标基因 1/i });
    await user.clear(target);
    await user.type(target, "IL6");
    await user.tab();
    expect(target).toHaveValue("IL6");

    const firstGroup = screen.getByRole("textbox", { name: /分组 1/i });
    await user.clear(firstGroup);
    await user.type(firstGroup, "Vehicle");
    await user.tab();
    expect(firstGroup).toHaveValue("Vehicle");
  });

  it("shows a three-column Ct summary and keeps well-level details collapsed", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getAllByRole("button", { name: /载入演示/i })[0]!);
    const summary = screen.getByRole("table", { name: /Ct 数据概览/i });
    expect(within(summary).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "基因名", "重复数", "分组"
    ]);
    const details = screen.getByText(/^QC$/i).closest("details");
    expect(details).not.toHaveAttribute("open");
  });

  it("opens a compact editable raw Ct table with a recompute action", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getAllByRole("button", { name: /载入演示/i })[0]!);

    const edit = screen.getByRole("button", { name: /编辑原始 Ct/i });
    expect(edit).toBeInTheDocument();
    await user.click(edit);

    const table = screen.getByRole("table", { name: /原始 Ct 数据/i });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "基因名", "重复", "分组", "Ct 值"
    ]);
    const ctInput = within(table).getAllByRole("spinbutton")[0]!;
    await user.clear(ctInput);
    await user.type(ctInput, "20.50");
    await user.tab();
    expect(screen.getByRole("button", { name: /重新计算/i })).toBeEnabled();
  });

  it("keeps edited data marked when recompute fails", async () => {
    const user = userEvent.setup();
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "R analysis unavailable" })
    }));
    try {
      render(<Workbench />);
      await user.click(screen.getAllByRole("button", { name: /载入演示/i })[0]!);
      await user.click(screen.getByRole("button", { name: /编辑原始 Ct/i }));
      const ctInput = within(screen.getByRole("table", { name: /原始 Ct 数据/i })).getAllByRole("spinbutton")[0]!;
      await user.clear(ctInput);
      await user.type(ctInput, "20.50");
      await user.click(screen.getByRole("button", { name: /重新计算/i }));
      expect(await screen.findByText(/R analysis unavailable/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /重新计算/i })).toHaveAttribute("data-dirty", "true");
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("paginates raw Ct rows instead of hiding wells after the first page", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.selectOptions(screen.getByRole("combobox", { name: /示例数据/i }), "multi_gene");
    await user.click(screen.getByRole("button", { name: /编辑原始 Ct/i }));
    const next = screen.getByRole("button", { name: /下一页/i });
    expect(next).toBeEnabled();
    await user.click(next);
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("offers sub-90-mm widths, gradient swatches and selectable point shapes", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getByRole("button", { name: /分析与作图/i }));
    const width = screen.getByRole("combobox", { name: /投稿宽度/i });
    expect(within(width).getByRole("option", { name: "60 mm" })).toBeInTheDocument();
    expect(within(width).getByRole("option", { name: "75 mm" })).toBeInTheDocument();
    await user.selectOptions(width, "60");
    expect(width).toHaveValue("60");
    expect(screen.getByRole("button", { name: /圆形点/i })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /三角形点/i }));
    expect(screen.getByRole("button", { name: /三角形点/i })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByText(/选择与编辑配色/i));
    await user.click(screen.getByRole("button", { name: /渐变/i }));
    expect(screen.getByRole("button", { name: "Blue–red" }).querySelector("span"))
      .toHaveStyle({ background: "linear-gradient(90deg, #315B8A 0%, #FFFFFF 50%, #B64F4A 100%)" });
  });

  it("keeps only the data and analysis core views without explanatory workflow copy", async () => {
    render(<Workbench />);
    expect(screen.getByRole("button", { name: /^数据录入$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^分析与作图$/i })).toBeInTheDocument();
    expect(screen.queryByText(/01—07/)).not.toBeInTheDocument();
    expect(screen.queryByText(/统计推荐需人工确认/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\* < 0\.05/)).not.toBeInTheDocument();
  });

  it("provides eight presets in every scientific palette family", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getByRole("button", { name: /分析与作图/i }));
    await user.click(screen.getByText(/选择与编辑配色/i));
    for (const category of ["期刊风格", "莫兰迪", "马卡龙", "通用安全", "渐变", "自定义"]) {
      await user.click(screen.getByRole("button", { name: category }));
      expect(within(screen.getByRole("group", { name: /配色方案/i })).getAllByRole("button")).toHaveLength(8);
    }
  });

  it("keeps categorical palette colors stable beyond the first three groups", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getByRole("button", { name: /分析与作图/i }));
    await user.click(screen.getByText(/选择与编辑配色/i));
    const paletteGroup = screen.getByRole("group", { name: /配色方案/i });
    for (const category of ["期刊风格", "莫兰迪", "马卡龙", "通用安全"]) {
      await user.click(screen.getByRole("button", { name: category }));
      const presets = within(paletteGroup).getAllByRole("button");
      expect(presets.every((preset) => preset.querySelectorAll(".palette-swatch i").length >= 7)).toBe(true);
    }
  });

  it("renders long biological group names as rows instead of breaking metric text", async () => {
    const user = userEvent.setup();
    const experiment = createDemoExperiment("zh-CN");
    const calculation = analyzeDeltaDeltaCt(experiment);
    calculation.groups = calculation.groups.map((group) => ({
      ...group,
      groupId: group.groupId === "control" ? "vehicle_early_morning" : "drug_late_recovery"
    }));
    const result = {
      calculation,
      statistics: {
        analyses: { GENE1: { method: "Welch t-test" } },
        contrasts: [{
          target_gene: "GENE1",
          contrast: "treated / control",
          fold_change: 8,
          fold_change_ci_low: 7,
          fold_change_ci_high: 9,
          p_adjusted: 0.001
        }]
      },
      figure: { svg: "<svg />", backend: "R/ggplot2" as const, widthMm: 90, heightMm: 70 }
    } satisfies PlatformAnalysisResult;
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "job-long-groups", result }) }));
    try {
      render(<Workbench />);
      await user.click(screen.getAllByRole("button", { name: /载入演示/i })[0]!);
      await user.click(screen.getByRole("button", { name: /分析与作图/i }));
      await user.click(screen.getAllByRole("button", { name: /运行 R 分析/i })[0]!);
      const resultRegion = await screen.findByRole("region", { name: /计算后的数据值/i });
      expect(resultRegion.querySelectorAll(".metric-n-row")).toHaveLength(2);
      expect(Array.from(resultRegion.querySelectorAll(".metric-n-row b")).map((node) => node.textContent)).toEqual([
        "vehicle_early_morning", "drug_late_recovery"
      ]);
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("explains when Tukey applies and exposes it for a one-way design", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getAllByRole("button", { name: /载入演示/i })[0]!);
    await user.selectOptions(screen.getByRole("combobox", { name: /实验设计/i }), "one_way");
    await user.click(screen.getByRole("button", { name: /分析与作图/i }));
    expect(within(screen.getByRole("combobox", { name: /统计方法/i })).getByRole("option", { name: /单因素方差分析.*方差近似一致/i })).toBeInTheDocument();
    expect(within(screen.getByRole("combobox", { name: /多重比较/i })).getByRole("option", { name: /Tukey HSD/i })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: /统计方法/i }), "anova");
    expect(screen.getByRole("combobox", { name: /多重比较/i })).toHaveValue("tukey");
    await user.selectOptions(screen.getByRole("combobox", { name: /统计方法/i }), "recommended");
    expect(screen.getByRole("combobox", { name: /多重比较/i })).toHaveValue("games-howell");
    await user.click(screen.getByText(/怎么选择统计方法/i));
    expect(screen.getByText((_, element) => element?.tagName === "P" && Boolean(element.textContent?.match(/单因素多组.*ANOVA.*Tukey HSD.*方差不齐.*Games–Howell/i)))).toBeInTheDocument();
  });

  it("uses one violin-box plot and controls point visibility and size", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getByRole("button", { name: /分析与作图/i }));
    expect(screen.getByRole("button", { name: /小提琴.*箱线/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^箱线$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^小提琴$/i })).not.toBeInTheDocument();
    const points = screen.getByRole("checkbox", { name: /显示独立样本点/i });
    expect(points).toBeChecked();
    await user.click(points);
    expect(points).not.toBeChecked();
    await user.selectOptions(screen.getByRole("combobox", { name: /样本点大小/i }), "2.2");
    expect(screen.getByRole("combobox", { name: /样本点大小/i })).toHaveValue("2.2");
  });

  it("keeps palette choices collapsed and lets every preset expose editable multi-color stops", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getByRole("button", { name: /分析与作图/i }));
    const paletteDetails = screen.getByText(/选择与编辑配色/i).closest("details");
    expect(paletteDetails).not.toHaveAttribute("open");
    await user.click(screen.getByText(/选择与编辑配色/i));
    await user.click(screen.getByRole("button", { name: /渐变/i }));
    const blueSequential = screen.getByRole("button", { name: /Blue sequential/i });
    expect(blueSequential.querySelector("span")).toHaveStyle({
      background: "linear-gradient(90deg, #E8F1F8 0%, #B9D3E6 33%, #6FA6C9 67%, #255F85 100%)"
    });
    await user.click(blueSequential);
    expect(screen.getAllByLabelText(/颜色 \d+/i).length).toBeGreaterThanOrEqual(4);
  });

  it("offers direct figure format and raster DPI controls without requiring a ZIP", async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await user.click(screen.getByRole("button", { name: /分析与作图/i }));
    const format = screen.getByRole("combobox", { name: /文件格式/i });
    expect(within(format).getAllByRole("option").map((option) => option.textContent)).toEqual(["SVG", "PDF", "PNG", "TIFF"]);
    await user.selectOptions(format, "png");
    expect(screen.getByRole("combobox", { name: /下载分辨率/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^下载图形$/i })).toBeInTheDocument();
    expect(screen.getByText(/^科研包$/i).closest("details")).not.toHaveAttribute("open");
  });
});
