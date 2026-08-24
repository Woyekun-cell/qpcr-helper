"use client";

import {
  analyzeDeltaDeltaCt,
  analysisConfigSchema,
  experimentInputSchema,
  qcDecisionSchema,
  type AnalysisConfig,
  type AnalysisResult,
  type CtWell,
  type ExperimentInput,
  type QcDecision,
  type SampleExpression
} from "@qpcr/contracts";
import {
  Download,
  FileSpreadsheet,
  FolderOpen,
  FlaskConical,
  Languages,
  Palette,
  Play,
  Save,
  Sparkles,
  Upload
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { defaultAnalysisConfig, type AnalysisRequest } from "@/lib/analysis-request";
import {
  createDemoExperiment,
  createExampleExperiment,
  exampleCatalog,
  type ExampleId
} from "@/lib/demo";
import { guestProjects } from "@/lib/guest-projects";
import type { GuestProject } from "@/lib/guest-projects";
import { parseCtText, parseCtWorkbookBundle } from "@/lib/import";
import type { PlatformAnalysisResult } from "@/lib/result-types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AccountAccess } from "./account-access";
import { ProjectLibrary, type CloudProject } from "./project-library";

type Locale = "zh-CN" | "en";
type FigureType = "bar" | "dot" | "violin_box" | "paired" | "time" | "heatmap";
type FigurePalette =
  | "nature-muted" | "nature-earth" | "cell-bright" | "cell-soft" | "prism" | "nature-cool" | "nature-warm" | "cell-cmy"
  | "morandi-sage" | "morandi-dust" | "morandi-blue" | "morandi-earth" | "morandi-rose" | "morandi-lavender" | "morandi-forest" | "morandi-stone"
  | "macaron-pastel" | "macaron-candy" | "macaron-gelato" | "macaron-mint" | "macaron-peach" | "macaron-sky" | "macaron-lilac" | "macaron-lemon"
  | "okabe-ito" | "tol-bright" | "cool" | "warm" | "tol-muted" | "ibm-safe" | "wong" | "tableau-safe"
  | "gradient-blue-red" | "gradient-purple-green" | "gradient-teal-coral" | "gradient-sunset"
  | "gradient-ocean-multi" | "gradient-berry-multi" | "gradient-forest-multi" | "gradient-sunset-multi"
  | "custom";
type PaletteCategory = "journal" | "morandi" | "macaron" | "accessible" | "gradient" | "custom";
type PLabelMode = "stars" | "exact" | "stars-exact" | "none";
type PointShape = "circle" | "square" | "triangle" | "diamond";
type PointSize = 1.1 | 1.5 | 1.8 | 2.2;
type FigureWidth = 60 | 75 | 90 | 120 | 150 | 180;
type FigureFormat = "svg" | "pdf" | "png" | "tiff";
interface JobReference { id: string; token?: string; expiresAt?: number; exportRequest?: AnalysisRequest }

const copy = {
  "zh-CN": {
    title: "qPCR Helper",
    subtitle: "从 Ct 到可复现结论",
    guest: "游客 · 本地保存",
    signIn: "登录",
    projects: "项目",
    demo: "载入演示",
    examples: "示例数据",
    chooseExample: "选择合成示例",
    save: "保存项目",
    steps: ["数据录入", "分析与作图"],
    next: "继续",
    back: "返回",
    project: "项目名称",
    design: "实验设计",
    reference: "内参基因",
    target: "目标基因",
    calibrator: "对照组",
    importTitle: "粘贴或导入 Ct 表",
    importHint: "接受 CSV、TSV、XLSX。表头模板：well_id, sample_id, biological_replicate, technical_replicate, group, gene, role, ct",
    parse: "解析数据",
    qcTitle: "逐孔审计，不静默排除",
    statsTitle: "统计方法",
    run: "运行 R 分析",
    running: "正在分析…",
    resultTitle: "表达量与统计推断",
    figureTitle: "R 投稿级科研图",
    exportTitle: "完整科研包",
    export: "下载 ZIP 科研包",
    empty: "载入演示或导入 Ct 数据后开始。",
    exactN: "n 仅计生物学重复，技术孔先汇总。",
    wells: "个孔",
    lang: "English"
  },
  en: {
    title: "qPCR Helper",
    subtitle: "From Ct values to reproducible evidence",
    guest: "Guest · saved locally",
    signIn: "Sign in",
    projects: "Projects",
    demo: "Load demo",
    examples: "Example data",
    chooseExample: "Choose synthetic example",
    save: "Save project",
    steps: ["Data", "Analysis & figure"],
    next: "Continue",
    back: "Back",
    project: "Project name",
    design: "Experimental design",
    reference: "Reference gene",
    target: "Target gene",
    calibrator: "Calibrator group",
    importTitle: "Paste or import a Ct table",
    importHint: "Accepts CSV, TSV and XLSX. Template headers: well_id, sample_id, biological_replicate, technical_replicate, group, gene, role, ct",
    parse: "Parse data",
    qcTitle: "Auditable well decisions, no silent exclusion",
    statsTitle: "Statistical method",
    run: "Run R analysis",
    running: "Analyzing…",
    resultTitle: "Expression and statistical inference",
    figureTitle: "R publication figure",
    exportTitle: "Complete research package",
    export: "Download research ZIP",
    empty: "Load the demo or import Ct values to begin.",
    exactN: "n counts biological replicates only; technical wells are aggregated first.",
    wells: "wells",
    lang: "中文"
  }
} as const;

const starterText = "well_id\tsample_id\tbiological_replicate\ttechnical_replicate\tgroup\tgene\trole\tct";
const MAX_IMPORT_BYTES = 10_000_000;

function inferExperiment(wells: CtWell[], locale: Locale, current?: ExperimentInput): ExperimentInput {
  const referenceGene = wells.find((well) => well.geneRole === "reference")?.gene;
  const targetGenes = [...new Set(wells.filter((well) => well.geneRole === "target").map((well) => well.gene))];
  const groupIds = [...new Set(wells.map((well) => well.groupId))];
  if (!referenceGene || targetGenes.length === 0 || groupIds.length < 2) {
    throw new Error(locale === "zh-CN" ? "需至少包含一个内参、一个目标基因和两个组。" : "At least one reference, one target and two groups are required.");
  }
  return {
    projectId: current?.projectId ?? crypto.randomUUID(),
    name: current?.name ?? (locale === "zh-CN" ? "未命名 qPCR 项目" : "Untitled qPCR project"),
    locale,
    referenceGene,
    targetGenes,
    design: current?.design ?? (groupIds.length > 2 ? "one_way" : "independent_two_group"),
    groups: groupIds.map((id, index) => ({ id, name: id, isCalibrator: index === 0 })),
    wells
  };
}

function scientific(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  if (value !== 0 && Math.abs(value) < 0.001) return value.toExponential(2);
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 4 }).format(value);
}

function biologicalNLabel(result: PlatformAnalysisResult): string {
  const unique = new Map<string, number>();
  for (const group of result.calculation.groups) {
    unique.set(group.groupId, Math.max(unique.get(group.groupId) ?? 0, group.biologicalN));
  }
  return [...unique].map(([group, n]) => `${group} ${n}`).join(" · ");
}

function percentLabel(value: number | undefined): string {
  return `${Math.round((value ?? 0.95) * 100)}%`;
}

type PaletteOption = { id?: string; value: FigurePalette; label: string; colors: string[]; whiteCenter?: boolean };
const paletteGroups: Array<{ value: PaletteCategory; label: { "zh-CN": string; en: string }; options: PaletteOption[] }> = [
  { value: "journal", label: { "zh-CN": "期刊风格", en: "Journal" }, options: [
    { value: "nature-muted", label: "Nature muted", colors: ["#4F6B45", "#D98268", "#4C6F91"] },
    { value: "nature-earth", label: "Nature earth", colors: ["#496A4B", "#B7654F", "#4E6F8E"] },
    { value: "cell-bright", label: "Cell bright", colors: ["#3B82B5", "#E0764C", "#50A56C"] },
    { value: "cell-soft", label: "Cell soft", colors: ["#5B7FA3", "#C9826A", "#719477"] },
    { value: "prism", label: "Prism classic", colors: ["#3B75AF", "#E06B65", "#59A14F"] },
    { value: "nature-cool", label: "Nature cool", colors: ["#355F8A", "#5C8D89", "#8A789E"] },
    { value: "nature-warm", label: "Nature warm", colors: ["#A65F46", "#C48B4E", "#7B8061"] },
    { value: "cell-cmy", label: "Cell CMY", colors: ["#2698BA", "#D45C91", "#D7A928"] }
  ] },
  { value: "morandi", label: { "zh-CN": "莫兰迪", en: "Morandi" }, options: [
    { value: "morandi-sage", label: "Sage", colors: ["#7E8B76", "#B8897D", "#8091A0"] },
    { value: "morandi-dust", label: "Dust", colors: ["#9C7F7B", "#B59A8B", "#7D8C91"] },
    { value: "morandi-blue", label: "Blue grey", colors: ["#667C8A", "#8EA0AA", "#9A7E79"] },
    { value: "morandi-earth", label: "Earth", colors: ["#897568", "#A98576", "#6F8179"] },
    { value: "morandi-rose", label: "Rose", colors: ["#A48282", "#C0A0A0", "#7E8E91"] },
    { value: "morandi-lavender", label: "Lavender", colors: ["#817A91", "#A49AAD", "#788B87"] },
    { value: "morandi-forest", label: "Forest", colors: ["#64766B", "#879388", "#9B8274"] },
    { value: "morandi-stone", label: "Stone", colors: ["#777B78", "#9C9990", "#7D8991"] }
  ] },
  { value: "macaron", label: { "zh-CN": "马卡龙", en: "Macaron" }, options: [
    { value: "macaron-pastel", label: "Pastel", colors: ["#8EC5E8", "#F3A6A0", "#9ED9B5"] },
    { value: "macaron-candy", label: "Candy", colors: ["#69B7EB", "#FF8F86", "#76D39B"] },
    { value: "macaron-gelato", label: "Gelato", colors: ["#A7C7E7", "#F4B6A8", "#B7D7B0"] },
    { value: "macaron-mint", label: "Mint", colors: ["#87D8C1", "#A7CFE8", "#F2B4B0"] },
    { value: "macaron-peach", label: "Peach", colors: ["#F3B59D", "#F2CF91", "#9CCDBB"] },
    { value: "macaron-sky", label: "Sky", colors: ["#83C7EA", "#A9BCE8", "#F0A8B8"] },
    { value: "macaron-lilac", label: "Lilac", colors: ["#C4A7E7", "#F0B6D2", "#9FD3CE"] },
    { value: "macaron-lemon", label: "Lemon", colors: ["#EFD675", "#A7D8A2", "#94C8E8"] }
  ] },
  { value: "accessible", label: { "zh-CN": "通用安全", en: "Accessible" }, options: [
    { value: "okabe-ito", label: "Okabe–Ito", colors: ["#0072B2", "#D55E00", "#009E73"] },
    { value: "tol-bright", label: "Tol bright", colors: ["#4477AA", "#EE6677", "#228833"] },
    { value: "cool", label: "Cool", colors: ["#2F5D8A", "#5A8BB5", "#63A7A3"] },
    { value: "warm", label: "Warm", colors: ["#8C4A32", "#C96B4B", "#D99A4E"] },
    { value: "tol-muted", label: "Tol muted", colors: ["#332288", "#88CCEE", "#44AA99"] },
    { value: "ibm-safe", label: "IBM safe", colors: ["#648FFF", "#DC267F", "#785EF0"] },
    { value: "wong", label: "Wong", colors: ["#0072B2", "#D55E00", "#009E73"] },
    { value: "tableau-safe", label: "Tableau", colors: ["#4E79A7", "#E15759", "#59A14F"] }
  ] },
  { value: "gradient", label: { "zh-CN": "渐变", en: "Gradient" }, options: [
    { value: "gradient-blue-red", label: "Blue–red", colors: ["#315B8A", "#B64F4A"], whiteCenter: true },
    { value: "gradient-purple-green", label: "Purple–green", colors: ["#6B4C8A", "#4D8B72"], whiteCenter: true },
    { value: "gradient-teal-coral", label: "Teal–coral", colors: ["#287D7B", "#D66B5D"], whiteCenter: true },
    { value: "gradient-sunset", label: "Sunset diverging", colors: ["#574B90", "#C84A5A"], whiteCenter: true },
    { value: "gradient-ocean-multi", label: "Blue sequential", colors: ["#E8F1F8", "#B9D3E6", "#6FA6C9", "#255F85"] },
    { value: "gradient-berry-multi", label: "Purple sequential", colors: ["#F2EAF6", "#D7BDE2", "#A778BC", "#6A3F86"] },
    { value: "gradient-forest-multi", label: "Green sequential", colors: ["#E8F2EB", "#B9D6C1", "#74AA83", "#3E7050"] },
    { value: "gradient-sunset-multi", label: "Coral sequential", colors: ["#FCEBE4", "#F5C4B2", "#E98768", "#B94F3F"] }
  ] },
  { value: "custom", label: { "zh-CN": "自定义", en: "Custom" }, options: [
    { id: "custom-1", value: "custom", label: "Custom 1", colors: ["#496A4B", "#D98268", "#4C6F91", "#D6A43B"] },
    { id: "custom-2", value: "custom", label: "Custom 2", colors: ["#345B78", "#D47B6A", "#6C936A", "#B38A42"] },
    { id: "custom-3", value: "custom", label: "Custom 3", colors: ["#675A7E", "#B86D82", "#4E8982", "#C59A58"] },
    { id: "custom-4", value: "custom", label: "Custom 4", colors: ["#2F6473", "#C86F4F", "#7A8F55", "#8A6E9D"] },
    { id: "custom-5", value: "custom", label: "Custom 5", colors: ["#3F5D45", "#BD655A", "#537FA0", "#B38F54"] },
    { id: "custom-6", value: "custom", label: "Custom 6", colors: ["#536B8B", "#C97A93", "#5F937E", "#C2A04E"] },
    { id: "custom-7", value: "custom", label: "Custom 7", colors: ["#415F72", "#B85C70", "#74905B", "#9A7298"] },
    { id: "custom-8", value: "custom", label: "Custom 8", colors: ["#586C4F", "#C16B55", "#527B88", "#AD8550"] }
  ] }
];

const referenceGeneOptions = [
  { value: "GAPDH", label: "GAPDH" },
  { value: "β-actin", label: "β-actin" },
  { value: "RPLP0", label: "RPLP0" },
  { value: "HPRT1", label: "HPRT1" },
  { value: "TBP", label: "TBP" },
  { value: "18S rRNA", label: "18S rRNA" }
] as const;

const pointShapes: Array<{ value: PointShape; label: { "zh-CN": string; en: string } }> = [
  { value: "circle", label: { "zh-CN": "圆形点", en: "Circle" } },
  { value: "square", label: { "zh-CN": "方形点", en: "Square" } },
  { value: "triangle", label: { "zh-CN": "三角形点", en: "Triangle" } },
  { value: "diamond", label: { "zh-CN": "菱形点", en: "Diamond" } }
];

function recommendedFigureType(experiment: ExperimentInput): FigureType {
  if (experiment.design === "paired_two_group") return "paired";
  if (experiment.design === "repeated_time") return "time";
  if (experiment.targetGenes.length > 1) return "heatmap";
  return "bar";
}

function methodOptions(design: AnalysisConfig["design"], contrastMode: AnalysisConfig["contrastMode"] | undefined, locale: Locale): Array<{ value: AnalysisConfig["method"]; label: string }> {
  const zh = locale === "zh-CN";
  if (design === "independent_two_group") return [
    { value: "recommended", label: zh ? "Welch t-test（独立两组）" : "Welch t-test" },
    { value: "mann_whitney", label: zh ? "Mann–Whitney（非参数备选）" : "Mann–Whitney" }
  ];
  if (design === "paired_two_group") return [
    { value: "recommended", label: zh ? "配对 t-test" : "Paired t-test" },
    { value: "wilcoxon", label: zh ? "Wilcoxon signed-rank（非参数备选）" : "Wilcoxon signed-rank" }
  ];
  if (design === "one_way") {
    const options: Array<{ value: AnalysisConfig["method"]; label: string }> = [
      { value: "recommended", label: zh ? "按实验设计推荐" : "Design-based recommendation" },
      { value: "welch_anova", label: zh ? "Welch ANOVA（不要求等方差）" : "Welch ANOVA" },
      { value: "anova", label: zh ? "单因素方差分析（方差近似一致）" : "One-way ANOVA (similar variances)" },
      { value: "kruskal_wallis", label: zh ? "Kruskal–Wallis（非参数备选）" : "Kruskal–Wallis" }
    ];
    return options.filter((option) => contrastMode !== "selected" || option.value !== "kruskal_wallis");
  }
  if (design === "two_way") return [
    { value: "recommended", label: zh ? "两因素线性模型（含交互）" : "Factorial linear model" },
    { value: "linear_model", label: zh ? "两因素线性模型（含交互）" : "Factorial linear model" }
  ];
  return [
    { value: "recommended", label: zh ? "随机截距混合模型" : "Mixed model" },
    { value: "mixed_model", label: zh ? "随机截距混合模型" : "Random-intercept mixed model" }
  ];
}

function selectedMethodLabel(config: AnalysisConfig, locale: Locale): string {
  if (config.method !== "recommended") {
    return methodOptions(config.design, config.contrastMode, locale).find((option) => option.value === config.method)?.label.replace(/ · .+$/, "") ?? config.method;
  }
  if (config.design === "independent_two_group") return "Welch t-test";
  if (config.design === "paired_two_group") return "Paired t-test";
  if (config.design === "one_way") {
    if (config.correction === "dunnett") return "ANOVA + Dunnett";
    if (config.correction === "tukey") return "ANOVA + Tukey";
    if (config.contrastMode === "selected") return "Selected Welch contrasts + Holm";
    return "Welch ANOVA + Games–Howell";
  }
  return config.design === "two_way" ? "Linear model + interaction" : "Random-intercept mixed model";
}

function statisticalGuidance(locale: Locale): Array<{ title: string; detail: string }> {
  if (locale === "zh-CN") return [
    { title: "两组独立", detail: "Welch t-test；严重偏态时可复核 Mann–Whitney。" },
    { title: "两组配对", detail: "配对 t-test；非参数备选 Wilcoxon signed-rank。" },
    { title: "单因素多组", detail: "方差近似一致：one-way ANOVA + Tukey HSD；方差不齐：Welch ANOVA + Games–Howell；仅和对照比较：Dunnett。" },
    { title: "两因素", detail: "包含两个主效应及交互项的线性模型。" },
    { title: "重复测量 / 时间", detail: "受试者随机截距混合模型。" }
  ];
  return [
    { title: "Two independent groups", detail: "Welch t-test; Mann–Whitney as a nonparametric sensitivity analysis." },
    { title: "Two paired groups", detail: "Paired t-test; Wilcoxon signed-rank as a nonparametric alternative." },
    { title: "One-way multi-group", detail: "Similar variances: one-way ANOVA + Tukey HSD; unequal variances: Welch ANOVA + Games–Howell; control-only: Dunnett." },
    { title: "Two-factor", detail: "Linear model with both main effects and their interaction." },
    { title: "Repeated / time", detail: "Random-intercept mixed model." }
  ];
}

function collectOmnibusRows(result: PlatformAnalysisResult | null): Array<Record<string, unknown>> {
  if (!result) return [];
  return Object.entries(result.statistics.analyses).flatMap(([gene, analysis]) => {
    const rows = Array.isArray(analysis.omnibus) ? analysis.omnibus : analysis.omnibus ? [analysis.omnibus] : [];
    return rows
      .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
      .map((row) => ({ targetGene: gene, ...row }));
  });
}

export function Workbench() {
  const [locale, setLocale] = useState<Locale>("zh-CN");
  const t = copy[locale];
  const [step, setStep] = useState(0);
  const [experiment, setExperiment] = useState<ExperimentInput | null>(null);
  const [config, setConfig] = useState<AnalysisConfig | null>(null);
  const [figureType, setFigureType] = useState<FigureType>("bar");
  const [figurePalette, setFigurePalette] = useState<FigurePalette>("nature-muted");
  const [paletteCategory, setPaletteCategory] = useState<PaletteCategory>("journal");
  const [customColors, setCustomColors] = useState(["#496A4B", "#D98268", "#4C6F91", "#D6A43B"]);
  const [pLabelMode, setPLabelMode] = useState<PLabelMode>("stars");
  const [showPoints, setShowPoints] = useState(true);
  const [pointShape, setPointShape] = useState<PointShape>("circle");
  const [pointSize, setPointSize] = useState<PointSize>(1.5);
  const [figureWidth, setFigureWidth] = useState<FigureWidth>(90);
  const [figureHeight, setFigureHeight] = useState<60 | 70 | 75 | 90 | 105 | 120>(70);
  const [figureDpi, setFigureDpi] = useState<300 | 600>(300);
  const [figureFormat, setFigureFormat] = useState<FigureFormat>("svg");
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [qcDecisions, setQcDecisions] = useState<QcDecision[]>([]);
  const [paste, setPaste] = useState(starterText);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PlatformAnalysisResult | null>(null);
  const [figurePreview, setFigurePreview] = useState<PlatformAnalysisResult["figure"] | null>(null);
  const [job, setJob] = useState<JobReference | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [userEmail, setUserEmail] = useState<string | undefined>();
  const [localProjects, setLocalProjects] = useState<GuestProject[]>([]);
  const [cloudProjects, setCloudProjects] = useState<CloudProject[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const localCalculation = useMemo<AnalysisResult | null>(() => {
    if (!experiment) return null;
    try { return analyzeDeltaDeltaCt(experiment); } catch { return null; }
  }, [experiment]);

  const activeFigureConfig = useMemo(() => ({
    plotType: figureType,
    widthMm: figureWidth,
    heightMm: figureHeight,
    dpi: figureDpi,
    palette: figurePalette,
    pLabelMode,
    showPoints,
    pointShape,
    pointSize,
    customColors
  }), [customColors, figureDpi, figureHeight, figurePalette, figureType, figureWidth, pLabelMode, pointShape, pointSize, showPoints]);

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    if (!client) return;
    void client.auth.getUser().then(({ data }) => setUserEmail(data.user?.email));
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (step !== 1 || !result || !config) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPreviewing(true);
      setPreviewError("");
      try {
        const response = await fetch("/api/figure-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            samples: result.calculation.samples,
            config: { calibratorGroup: config.calibratorGroup, confidenceLevel: config.confidenceLevel },
            figure: activeFigureConfig,
            analysis: result.statistics,
            title: null
          }),
          signal: controller.signal
        });
        const preview = await response.json();
        if (!response.ok) throw new Error(preview.message ?? "Figure preview failed");
        setFigurePreview(preview as PlatformAnalysisResult["figure"]);
        setJob((current) => current?.exportRequest
          ? { ...current, exportRequest: { ...current.exportRequest, figure: activeFigureConfig } }
          : current);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPreviewError(error instanceof Error ? error.message : "Figure preview failed");
      } finally {
        if (!controller.signal.aborted) setPreviewing(false);
      }
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeFigureConfig, config, result, step]);

  function loadExample(exampleId: ExampleId) {
    const demo = createExampleExperiment(exampleId, locale);
    const example = exampleCatalog.find((item) => item.id === exampleId);
    setExperiment(demo);
    setConfig(defaultAnalysisConfig(demo));
    setFigureType(example?.figureType ?? "bar");
    setResult(null);
    setFigurePreview(null);
    setJob(null);
    setQcDecisions([]);
    setMessage("");
  }

  function loadDemo() {
    const demo = createDemoExperiment(locale);
    setExperiment(demo);
    setConfig(defaultAnalysisConfig(demo));
    setFigureType("bar");
    setResult(null);
    setFigurePreview(null);
    setJob(null);
    setQcDecisions([]);
    setMessage("");
  }

  function changeLocale() {
    const next = locale === "zh-CN" ? "en" : "zh-CN";
    setLocale(next);
    if (experiment) setExperiment({ ...experiment, locale: next });
  }

  function clearComputedResults() {
    setResult(null);
    setFigurePreview(null);
    setJob(null);
  }

  function renameReferenceGene(nextValue: string) {
    if (!experiment) return;
    const nextGene = nextValue.trim();
    if (!nextGene) return;
    setExperiment({
      ...experiment,
      referenceGene: nextGene,
      wells: experiment.wells.map((well) => well.geneRole === "reference" ? { ...well, gene: nextGene } : well)
    });
    clearComputedResults();
  }

  function renameTargetGene(previousGene: string, nextValue: string) {
    if (!experiment) return;
    const nextGene = nextValue.trim();
    if (!nextGene || nextGene === previousGene) return;
    if (experiment.targetGenes.includes(nextGene)) {
      setMessage(locale === "zh-CN" ? "目标基因名不能重复。" : "Target-gene names must be unique.");
      return;
    }
    setExperiment({
      ...experiment,
      targetGenes: experiment.targetGenes.map((gene) => gene === previousGene ? nextGene : gene),
      wells: experiment.wells.map((well) => well.geneRole === "target" && well.gene === previousGene ? { ...well, gene: nextGene } : well)
    });
    setMessage("");
    clearComputedResults();
  }

  function renameGroup(previousGroup: string, nextValue: string) {
    if (!experiment || !config) return;
    const nextGroup = nextValue.trim();
    if (!nextGroup || nextGroup === previousGroup) return;
    if (experiment.groups.some((group) => group.id === nextGroup)) {
      setMessage(locale === "zh-CN" ? "分组名不能重复。" : "Group names must be unique.");
      return;
    }
    const nextExperiment = {
      ...experiment,
      groups: experiment.groups.map((group) => group.id === previousGroup ? { ...group, id: nextGroup, name: nextGroup } : group),
      wells: experiment.wells.map((well) => well.groupId === previousGroup ? { ...well, groupId: nextGroup } : well)
    };
    const nextConfig = {
      ...config,
      calibratorGroup: config.calibratorGroup === previousGroup ? nextGroup : config.calibratorGroup,
      selectedComparisons: config.selectedComparisons?.map((comparison) => ({
        numerator: comparison.numerator === previousGroup ? nextGroup : comparison.numerator,
        denominator: comparison.denominator === previousGroup ? nextGroup : comparison.denominator
      }))
    };
    setExperiment(nextExperiment);
    setConfig(nextConfig);
    setMessage("");
    clearComputedResults();
  }

  function acceptWells(wells: CtWell[], decisions: QcDecision[] = []) {
    const next = inferExperiment(wells, locale, experiment ?? undefined);
    setExperiment(next);
    setConfig(defaultAnalysisConfig(next));
    setFigureType(recommendedFigureType(next));
    setQcDecisions(decisions);
    setResult(null);
    setFigurePreview(null);
    setJob(null);
    setMessage(`${wells.length} ${t.wells}`);
  }

  function parsePaste() {
    try { acceptWells(parseCtText(paste)); } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed");
    }
  }

  async function upload(file: File) {
    try {
      if (file.size > MAX_IMPORT_BYTES) {
        throw new Error(locale === "zh-CN" ? "文件超过 10 MB 限制。" : "The file exceeds the 10 MB limit.");
      }
      if (/\.xlsx?$/i.test(file.name)) {
        const bundle = await parseCtWorkbookBundle(await file.arrayBuffer());
        acceptWells(bundle.wells, bundle.qcDecisions);
      } else {
        acceptWells(parseCtText(await file.text()));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed");
    }
  }

  function updateWell(wellId: string) {
    if (!experiment) return;
    const well = experiment.wells.find((candidate) => candidate.wellId === wellId);
    if (!well) return;
    const decision = well.status === "excluded" ? "accepted" : "excluded";
    const reason = window.prompt(
      locale === "zh-CN" ? "请输入本次 QC 决定原因：" : "Enter the reason for this QC decision:",
      decision === "excluded" ? "Manual review" : "Re-accepted after manual review"
    );
    if (!reason?.trim()) return;
    setExperiment({
      ...experiment,
      wells: experiment.wells.map((well) => well.wellId === wellId
        ? { ...well, status: well.status === "excluded" ? "accepted" : "excluded" }
        : well)
    });
    setQcDecisions((decisions) => [...decisions, {
      wellId,
      decision,
      reason: reason.trim(),
      operator: "guest",
      decidedAt: new Date().toISOString()
    }]);
    setResult(null);
    setFigurePreview(null);
    setJob(null);
  }

  async function saveProject() {
    if (!experiment) return;
    await guestProjects.put({
      id: experiment.projectId,
      name: experiment.name,
      updatedAt: Date.now(),
      payload: { experiment, config, figureType, figurePalette, paletteCategory, customColors, pLabelMode, showPoints, pointShape, pointSize, figureWidth, figureHeight, figureDpi, qcDecisions }
    });
    setMessage(locale === "zh-CN" ? "已保存到本浏览器。" : "Saved in this browser.");
  }

  async function openLibrary() {
    setLocalProjects(await guestProjects.list());
    const client = createSupabaseBrowserClient();
    if (client) {
      const { data } = await client.from("projects").select("id, name, updated_at").order("updated_at", { ascending: false });
      const projectIds = (data ?? []).map((project) => project.id);
      const { data: versions } = projectIds.length > 0
        ? await client.from("experiment_versions").select("id, project_id, version, created_at").in("project_id", projectIds).order("version", { ascending: true })
        : { data: [] };
      setCloudProjects((data ?? []).map((project) => ({
        ...project,
        versions: (versions ?? []).filter((version) => version.project_id === project.id)
      })));
    }
    setShowLibrary(true);
  }

  function applyStoredProject(payload: unknown) {
    const stored = payload as { experiment?: unknown; config?: unknown; figureType?: unknown; figurePalette?: unknown; paletteCategory?: unknown; customColors?: unknown; pLabelMode?: unknown; showPoints?: unknown; pointShape?: unknown; pointSize?: unknown; figureWidth?: unknown; figureHeight?: unknown; figureDpi?: unknown; qcDecisions?: unknown; result?: unknown };
    const parsedExperiment = experimentInputSchema.safeParse(stored.experiment);
    const parsedConfig = analysisConfigSchema.safeParse(stored.config);
    const parsedDecisions = qcDecisionSchema.array().safeParse(stored.qcDecisions ?? []);
    if (!parsedExperiment.success || !parsedConfig.success || !parsedDecisions.success) {
      setMessage(locale === "zh-CN" ? "项目数据已损坏，无法打开。" : "The saved project is invalid.");
      return;
    }
    setExperiment(parsedExperiment.data);
    setConfig(parsedConfig.data);
    if (["bar", "dot", "box", "violin", "violin_box", "paired", "time", "heatmap"].includes(String(stored.figureType))) {
      setFigureType(["box", "violin"].includes(String(stored.figureType)) ? "violin_box" : stored.figureType as FigureType);
    }
    if (paletteGroups.flatMap((group) => group.options.map((item) => item.value)).includes(stored.figurePalette as FigurePalette)) setFigurePalette(stored.figurePalette as FigurePalette);
    if (paletteGroups.some((group) => group.value === stored.paletteCategory)) setPaletteCategory(stored.paletteCategory as PaletteCategory);
    if (Array.isArray(stored.customColors) && stored.customColors.length >= 2 && stored.customColors.every((color) => /^#[0-9A-Fa-f]{6}$/.test(String(color)))) setCustomColors(stored.customColors.map(String));
    if (["stars", "exact", "stars-exact", "none"].includes(String(stored.pLabelMode))) setPLabelMode(stored.pLabelMode as PLabelMode);
    if (typeof stored.showPoints === "boolean") setShowPoints(stored.showPoints);
    if (["circle", "square", "triangle", "diamond"].includes(String(stored.pointShape))) setPointShape(stored.pointShape as PointShape);
    if ([1.1, 1.5, 1.8, 2.2].includes(Number(stored.pointSize))) setPointSize(Number(stored.pointSize) as PointSize);
    if ([60, 75, 90, 120, 150, 180].includes(Number(stored.figureWidth))) setFigureWidth(stored.figureWidth as FigureWidth);
    if ([60, 70, 75, 90, 105, 120].includes(Number(stored.figureHeight))) setFigureHeight(stored.figureHeight as 60 | 70 | 75 | 90 | 105 | 120);
    if (stored.figureDpi === 300 || stored.figureDpi === 600) setFigureDpi(stored.figureDpi);
    setResult(stored.result && typeof stored.result === "object" ? stored.result as PlatformAnalysisResult : null);
    setFigurePreview(null);
    setJob(null);
    setQcDecisions(parsedDecisions.data);
    setStep(0);
    setShowLibrary(false);
  }

  async function openCloudProject(project: CloudProject, versionId?: string) {
    const client = createSupabaseBrowserClient();
    if (!client) return;
    let query = client.from("experiment_versions")
      .select("id, experiment, analysis_config")
      .eq("project_id", project.id);
    query = versionId ? query.eq("id", versionId) : query.order("version", { ascending: false }).limit(1);
    const { data } = await query.maybeSingle();
    if (!data) return;
    const { data: decisions } = await client.from("qc_decisions")
      .select("well_id, decision, reason, user_id, decided_at")
      .eq("version_id", data.id)
      .order("decided_at", { ascending: true });
    const stored = data.analysis_config as Record<string, unknown>;
    applyStoredProject({
      experiment: data.experiment,
      config: stored,
      figureType: (stored.figure as { plotType?: unknown } | undefined)?.plotType,
      qcDecisions: (decisions ?? []).map((decision) => ({
        wellId: decision.well_id,
        decision: decision.decision,
        reason: decision.reason,
        operator: decision.user_id,
        decidedAt: decision.decided_at
      }))
    });
  }

  async function deleteLocalProject(project: GuestProject) {
    if (!window.confirm(locale === "zh-CN" ? `删除“${project.name}”？` : `Delete “${project.name}”?`)) return;
    await guestProjects.delete(project.id);
    setLocalProjects(await guestProjects.list());
  }

  async function deleteCloudProject(project: CloudProject) {
    if (!window.confirm(locale === "zh-CN" ? `删除“${project.name}”及全部版本？` : `Delete “${project.name}” and all versions?`)) return;
    const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (response.ok) setCloudProjects((projects) => projects.filter((item) => item.id !== project.id));
  }

  async function runAnalysis(experimentOverride?: ExperimentInput, configOverride?: AnalysisConfig, destinationStep = 1, figureTypeOverride?: FigureType) {
    const activeExperiment = experimentOverride ?? experiment;
    const activeConfig = configOverride ?? config;
    if (!activeExperiment || !activeConfig) return;
    const activeFigureType = figureTypeOverride ?? figureType;
    setBusy(true);
    setMessage("");
    try {
      const analysisRequest: AnalysisRequest = {
        experiment: activeExperiment,
        config: activeConfig,
        figure: { ...activeFigureConfig, plotType: activeFigureType },
        qcDecisions
      };
      const response = await fetch("/api/analysis-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(analysisRequest)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Analysis failed");
      const completedResult = payload.result as PlatformAnalysisResult;
      setResult(completedResult);
      setFigurePreview(null);
      setJob({
        id: payload.id,
        exportRequest: analysisRequest,
        ...(payload.token ? { token: payload.token } : {}),
        ...(payload.expiresAt ? { expiresAt: payload.expiresAt } : {})
      });
      await guestProjects.appendVersion({
        id: activeExperiment.projectId,
        name: activeExperiment.name,
        payload: { experiment: activeExperiment, config: activeConfig, figureType: activeFigureType, figurePalette, paletteCategory, customColors, pLabelMode, showPoints, pointShape, pointSize, figureWidth, figureHeight, figureDpi, qcDecisions, result: completedResult }
      });
      setStep(destinationStep);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  async function analyzePastedData() {
    try {
      const nextExperiment = inferExperiment(parseCtText(paste), locale, experiment ?? undefined);
      const nextConfig = defaultAnalysisConfig(nextExperiment);
      const nextFigureType = recommendedFigureType(nextExperiment);
      setExperiment(nextExperiment);
      setConfig(nextConfig);
      setFigureType(nextFigureType);
      await runAnalysis(nextExperiment, nextConfig, 1, nextFigureType);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed");
    }
  }

  function updateContrastMode(contrastMode: AnalysisConfig["contrastMode"]) {
    if (!config || !experiment) return;
    if (config.design !== "one_way") {
      setConfig({ ...config, contrastMode });
      return;
    }
    const calibrator = experiment.groups.find((group) => group.isCalibrator)?.id ?? "";
    const treatment = experiment.groups.find((group) => !group.isCalibrator)?.id ?? "";
    if (contrastMode === "control") {
      setConfig({ ...config, contrastMode, correction: "dunnett", method: "recommended" });
    } else if (contrastMode === "all_pairs") {
      setConfig({ ...config, contrastMode, correction: "games-howell", method: "welch_anova" });
    } else {
      setConfig({
        ...config,
        contrastMode,
        correction: "holm",
        method: "welch_anova",
        selectedComparisons: config.selectedComparisons ?? [{ numerator: treatment, denominator: calibrator }]
      });
    }
  }

  function updateCorrection(correction: AnalysisConfig["correction"]) {
    if (!config) return;
    if (correction === "tukey") {
      setConfig({ ...config, correction, contrastMode: "all_pairs", method: "anova" });
    } else if (correction === "games-howell") {
      setConfig({ ...config, correction, contrastMode: "all_pairs", method: "welch_anova" });
    } else if (correction === "dunnett") {
      setConfig({ ...config, correction, contrastMode: "control", method: "recommended" });
    } else {
      setConfig({ ...config, correction });
    }
  }

  function updateMethod(method: AnalysisConfig["method"]) {
    if (!config) return;
    if (config.design === "one_way" && method === "recommended") {
      const correction = config.contrastMode === "control" ? "dunnett" : config.contrastMode === "all_pairs" ? "games-howell" : "holm";
      setConfig({ ...config, method, correction });
    } else if (config.design === "one_way" && method === "anova") {
      setConfig({ ...config, method, contrastMode: "all_pairs", correction: "tukey" });
    } else if (config.design === "one_way" && method === "welch_anova") {
      setConfig({ ...config, method, contrastMode: "all_pairs", correction: "games-howell" });
    } else if (config.design === "one_way" && method === "kruskal_wallis") {
      setConfig({ ...config, method, contrastMode: "all_pairs", correction: "holm" });
    } else {
      setConfig({ ...config, method });
    }
  }

  function updateSelectedComparison(field: "numerator" | "denominator", value: string) {
    if (!config) return;
    const current = config.selectedComparisons?.[0] ?? { numerator: "", denominator: "" };
    setConfig({ ...config, selectedComparisons: [{ ...current, [field]: value }] });
  }

  async function downloadExport() {
    if (!job) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/analysis-jobs/${job.id}/exports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(job.token ? { "x-capability-token": job.token } : {})
        },
        ...(job.exportRequest ? { body: JSON.stringify(job.exportRequest) } : {})
      });
      if (!response.ok) throw new Error((await response.json()).message ?? "Export failed");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "qpcr-helper-research-package.zip";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export failed");
    } finally { setBusy(false); }
  }

  async function downloadFigure() {
    if (!result || !config) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/figure-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          samples: result.calculation.samples,
          config: { calibratorGroup: config.calibratorGroup, confidenceLevel: config.confidenceLevel },
          figure: activeFigureConfig,
          analysis: result.statistics,
          title: null,
          format: figureFormat
        })
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.message ?? "Figure download failed");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `qpcr-helper-figure.${figureFormat}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Figure download failed");
    } finally {
      setBusy(false);
    }
  }

  const contrasts = result?.statistics?.contrasts ?? [];
  const contrast = contrasts.length === 1 ? contrasts[0] : undefined;
  const omnibusRows = collectOmnibusRows(result);
  const fittedMethod = result ? Object.values(result.statistics.analyses)[0]?.method : undefined;
  const diagnostic = result ? Object.values(result.statistics.analyses)[0]?.diagnostics : undefined;
  const displayedFigure = figurePreview ?? result?.figure;
  const svg = displayedFigure?.svg as string | undefined;
  const svgUrl = svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : "";
  const adjustedPValues = contrasts.map((item) => item.p_adjusted_family ?? item.p_adjusted).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const availableFigureTypes: Array<{ value: FigureType; label: string }> = [
    { value: "bar", label: locale === "zh-CN" ? "柱 + 点" : "Bar + points" },
    { value: "dot", label: locale === "zh-CN" ? "散点" : "Dot" },
    { value: "violin_box", label: locale === "zh-CN" ? "小提琴 + 箱线" : "Violin + box" },
    ...(experiment?.design === "paired_two_group" ? [{ value: "paired" as const, label: locale === "zh-CN" ? "配对" : "Paired" }] : []),
    ...(experiment?.design === "repeated_time" ? [{ value: "time" as const, label: locale === "zh-CN" ? "时间曲线" : "Time" }] : []),
    ...((experiment?.targetGenes.length ?? 0) > 1 ? [{ value: "heatmap" as const, label: locale === "zh-CN" ? "热图" : "Heatmap" }] : [])
  ];
  const selectedPalette = paletteGroups.flatMap((group) => group.options).find((item) => item.value === figurePalette);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><FlaskConical size={18} /></span><strong>qPCR Helper</strong></div>
        <div className="top-actions">
          <button className="quiet-button" onClick={openLibrary}><FolderOpen size={15} />{t.projects}</button>
          <button className="quiet-button" onClick={changeLocale}><Languages size={15} />{t.lang}</button>
          <button className="quiet-button" onClick={() => setShowAccount((value) => !value)}>{userEmail ?? t.signIn}</button>
        </div>
        {showAccount && <AccountAccess locale={locale} currentEmail={userEmail} onClose={() => setShowAccount(false)} onSignedOut={() => setUserEmail(undefined)} />}
        {showLibrary && <ProjectLibrary locale={locale} localProjects={localProjects} cloudProjects={cloudProjects} onClose={() => setShowLibrary(false)} onOpenLocal={(project) => applyStoredProject(project.payload)} onOpenCloud={(project, versionId) => void openCloudProject(project, versionId)} onDeleteLocal={(project) => void deleteLocalProject(project)} onDeleteCloud={(project) => void deleteCloudProject(project)} />}
      </header>

      <div className="core-workspace">
        <section className="work-area">
          <div className="page-heading">
            <h1>{t.title}</h1>
            <div className="heading-actions">
              <label className="example-picker">
                <Sparkles size={15} />
                <span className="sr-only">{t.examples}</span>
                <select aria-label={t.examples} value="" onChange={(event) => loadExample(event.target.value as ExampleId)}>
                  <option value="" disabled>{t.chooseExample}</option>
                  {exampleCatalog.map((example) => <option key={example.id} value={example.id}>{example.label[locale]}</option>)}
                </select>
              </label>
              <button className="quiet-button" onClick={saveProject} disabled={!experiment}><Save size={15} />{t.save}</button>
              <button className="primary-button one-click" onClick={() => void runAnalysis()} disabled={busy || !localCalculation}><Play size={15} />{locale === "zh-CN" ? "一键分析出图" : "Analyze & plot"}</button>
            </div>
          </div>

          <nav className="core-tabs" aria-label={locale === "zh-CN" ? "核心功能" : "Core tools"}>
            {t.steps.map((label, index) => <button key={label} className={step === index ? "active" : ""} onClick={() => setStep(index)}>{label}</button>)}
          </nav>

          {step === 0 && <div className="core-stack">
            <section className="panel setup-panel">
              <h2>{locale === "zh-CN" ? "实验信息" : "Experiment"}</h2>
              {!experiment ? <EmptyState text={t.empty} onDemo={loadDemo} label={t.demo} /> : <div className="setup-fields">
                <div className="field-grid setup-primary">
                  <label><span>{t.project}</span><input value={experiment.name} onChange={(event) => setExperiment({ ...experiment, name: event.target.value })} /></label>
                  <label><span>{t.design}</span><select value={experiment.design} onChange={(event) => {
                    const next = { ...experiment, design: event.target.value as ExperimentInput["design"] };
                    setExperiment(next); setConfig(defaultAnalysisConfig(next)); clearComputedResults();
                  }}><option value="independent_two_group">{locale === "zh-CN" ? "两组独立" : "Independent two-group"}</option><option value="paired_two_group">{locale === "zh-CN" ? "两组配对" : "Paired two-group"}</option><option value="one_way">{locale === "zh-CN" ? "单因素多组" : "One-way multi-group"}</option><option value="two_way">{locale === "zh-CN" ? "两因素" : "Two-way"}</option><option value="repeated_time">{locale === "zh-CN" ? "重复测量 / 时间" : "Repeated / time"}</option></select></label>
                </div>
                <ExperimentDesignTable experiment={experiment} locale={locale} onReferenceChange={renameReferenceGene} onTargetChange={renameTargetGene} onGroupChange={renameGroup} />
              </div>}
            </section>

            <section className="panel data-panel">
              <h2>{locale === "zh-CN" ? "Ct 数据" : "Ct data"}</h2>
              <textarea aria-label={locale === "zh-CN" ? "Ct 数据" : "Ct data"} className="data-paste" value={paste} onChange={(event) => setPaste(event.target.value)} spellCheck={false} />
              <div className="inline-actions"><button className="quiet-button" onClick={parsePaste}><FileSpreadsheet size={16} />{t.parse}</button><button className="quiet-button" onClick={() => fileRef.current?.click()}><Upload size={16} />CSV / XLSX</button><button className="primary-button" onClick={() => void analyzePastedData()} disabled={busy}><Play size={16} />{locale === "zh-CN" ? "分析并出图" : "Analyze & plot"}</button><input ref={fileRef} hidden type="file" accept=".csv,.tsv,.txt,.xls,.xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></div>
              {experiment && <><CtSummaryTable experiment={experiment} locale={locale} onReferenceChange={renameReferenceGene} onTargetChange={renameTargetGene} onGroupChange={renameGroup} /><details className="well-details"><summary>{locale === "zh-CN" ? "逐孔 Ct 明细与 QC" : "Well-level Ct details and QC"}</summary><DataTable wells={experiment.wells} onToggle={updateWell} locale={locale} /></details></>}
            </section>
          </div>}

          {step === 1 && <div className="core-stack">
            <section className="panel statistics-panel">
              <div className="compact-title"><h2>{t.statsTitle}</h2>{config && <strong>{selectedMethodLabel(config, locale)}</strong>}</div>
              {config ? <div className="recommendation compact-recommendation">
              <div className="field-grid compact"><label><span>{locale === "zh-CN" ? "统计方法" : "Statistical method"}</span><select value={config.method} onChange={(event) => updateMethod(event.target.value as AnalysisConfig["method"])}>{methodOptions(config.design, config.contrastMode, locale).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label><span>{locale === "zh-CN" ? "比较范围" : "Contrasts"}</span><select value={config.contrastMode} onChange={(event) => updateContrastMode(event.target.value as AnalysisConfig["contrastMode"])}><option value="selected">{locale === "zh-CN" ? "指定比较" : "Selected"}</option><option value="control">{locale === "zh-CN" ? "仅与对照比较" : "Control only"}</option><option value="all_pairs">{locale === "zh-CN" ? "全部两两比较" : "All pairs"}</option></select></label><label><span>{locale === "zh-CN" ? "多重比较" : "Multiple comparisons"}</span><select value={config.correction} onChange={(event) => updateCorrection(event.target.value as AnalysisConfig["correction"])}><option value="holm">Holm</option><option value="BH">BH-FDR</option><option value="none">None</option>{config.design === "one_way" && <><option value="dunnett">ANOVA + Dunnett</option><option value="tukey">ANOVA + Tukey HSD</option><option value="games-howell">Welch ANOVA + Games–Howell</option></>}</select></label><label><span>{locale === "zh-CN" ? "显著性水平 α" : "Significance α"}</span><select value={config.alpha} onChange={(event) => setConfig({ ...config, alpha: Number(event.target.value) })}><option value="0.01">0.01</option><option value="0.05">0.05</option><option value="0.1">0.10</option></select></label><label><span>{locale === "zh-CN" ? "置信水平" : "Confidence level"}</span><select value={config.confidenceLevel} onChange={(event) => setConfig({ ...config, confidenceLevel: Number(event.target.value) })}><option value="0.9">90%</option><option value="0.95">95%</option><option value="0.99">99%</option></select></label>{config.design === "one_way" && config.contrastMode === "selected" && <><label><span>Numerator</span><select value={config.selectedComparisons?.[0]?.numerator ?? ""} onChange={(event) => updateSelectedComparison("numerator", event.target.value)}>{experiment?.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label><span>Denominator</span><select value={config.selectedComparisons?.[0]?.denominator ?? ""} onChange={(event) => updateSelectedComparison("denominator", event.target.value)}>{experiment?.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label></>}</div>
                <details className="statistics-guide"><summary>{locale === "zh-CN" ? "怎么选择统计方法" : "How to choose a statistical method"}</summary><div>{statisticalGuidance(locale).map((item) => <p key={item.title}><strong>{item.title}</strong><span>{item.detail}</span></p>)}</div></details>
                <button className="primary-button run-button" onClick={() => void runAnalysis()} disabled={busy || !localCalculation}><Play size={16} />{busy ? t.running : t.run}</button>
              </div> : <EmptyState text={t.empty} onDemo={loadDemo} label={t.demo} />}
            </section>

            {result && <section className="panel results-panel">
              <h2>{t.resultTitle}</h2>
              {contrast ? <div className="metric-strip"><Metric label={contrast.target_gene ?? "Fold change"} value={`${scientific(contrast.fold_change)}×`} accent /><Metric label={`${percentLabel(config?.confidenceLevel)} CI`} value={`${scientific(contrast.fold_change_ci_low)}–${scientific(contrast.fold_change_ci_high)}`} /><Metric label="adjusted p" value={scientific(contrast.p_adjusted_family ?? contrast.p_adjusted)} /><Metric label="biological n" value={biologicalNLabel(result)} /></div> : <div className="metric-strip"><Metric label={locale === "zh-CN" ? "统计方法" : "Method"} value={fittedMethod ?? "—"} accent /><Metric label={locale === "zh-CN" ? "比较数量" : "Comparisons"} value={String(contrasts.length)} /><Metric label={locale === "zh-CN" ? "最小校正 p" : "Minimum adjusted p"} value={scientific(adjustedPValues.length ? Math.min(...adjustedPValues) : undefined)} /><Metric label="biological n" value={biologicalNLabel(result)} /></div>}
              <details className="analysis-details"><summary>{locale === "zh-CN" ? "完整统计结果" : "Full statistics"}</summary>{diagnostic && <div className="diagnostic-note"><strong>{locale === "zh-CN" ? "模型诊断" : "Model diagnostics"}</strong><span>Shapiro p {scientific(diagnostic.residual_normality_p)} · Fligner p {scientific(diagnostic.variance_homogeneity_p)} · {locale === "zh-CN" ? "离群残差" : "outliers"} {diagnostic.standardized_residual_outlier_count ?? 0}</span></div>}{omnibusRows.length > 0 && <OmnibusTable rows={omnibusRows} locale={locale} />}<ResultsTable samples={result.calculation.samples} /></details>
            </section>}

            <section className="panel figure-panel">
            <h2>{t.figureTitle}</h2>
            <div className="figure-studio">
              <div className="figure-stage">
                {svgUrl ? <div className={`figure-canvas ${previewing ? "updating" : ""}`}><Image src={svgUrl} width={900} height={620} unoptimized alt={locale === "zh-CN" ? "R 生成的相对表达量图" : "R-generated relative expression plot"} />{previewing && <span className="preview-status">{locale === "zh-CN" ? "更新中…" : "Updating…"}</span>}</div> : <EmptyState text={locale === "zh-CN" ? "输入 Ct 后分析出图。" : "Enter Ct values and run analysis."} onDemo={() => runAnalysis()} label={t.run} />}
                {previewError && <p className="preview-error">{previewError}</p>}
              </div>
              <aside className="figure-inspector">
                <div className="inspector-heading"><Palette size={16} /><strong>{locale === "zh-CN" ? "图形设置" : "Figure settings"}</strong></div>
                <fieldset><legend>{locale === "zh-CN" ? "图形类型" : "Plot type"}</legend><div className="plot-tabs">{availableFigureTypes.map((item) => <button key={item.value} className={figureType === item.value ? "selected" : ""} onClick={() => setFigureType(item.value)}>{item.label}</button>)}</div></fieldset>
              <details className="palette-details"><summary><span>{locale === "zh-CN" ? "选择与编辑配色" : "Choose and edit palette"}</span><PaletteSwatch colors={customColors} gradient={figurePalette.startsWith("gradient-")} whiteCenter={Boolean(selectedPalette?.whiteCenter)} /></summary><div className="palette-editor"><div className="palette-categories">{paletteGroups.map((group) => <button key={group.value} className={paletteCategory === group.value ? "selected" : ""} onClick={() => setPaletteCategory(group.value)}>{group.label[locale]}</button>)}</div><div className="palette-grid" role="group" aria-label={locale === "zh-CN" ? "配色方案" : "Palette presets"}>{paletteGroups.find((group) => group.value === paletteCategory)?.options.map((item) => <button key={item.id ?? item.value} aria-label={item.label} className={figurePalette === item.value && (item.value !== "custom" || customColors.join(",") === item.colors.join(",")) ? "selected" : ""} onClick={() => { setFigurePalette(item.value); setCustomColors(item.colors); }}><PaletteSwatch colors={item.colors} gradient={item.value.startsWith("gradient-")} whiteCenter={Boolean(item.whiteCenter)} /><span className="palette-name">{item.label}</span></button>)}</div><div className="custom-colors">{customColors.map((color, index) => <label key={`${index}-${color}`}><span>{locale === "zh-CN" ? `颜色 ${index + 1}` : `Color ${index + 1}`}</span><input aria-label={locale === "zh-CN" ? `颜色 ${index + 1}` : `Color ${index + 1}`} type="color" value={color} onChange={(event) => setCustomColors((colors) => colors.map((item, itemIndex) => itemIndex === index ? event.target.value.toUpperCase() : item))} /></label>)}</div><div className="custom-color-actions"><button disabled={customColors.length >= 8} onClick={() => setCustomColors((colors) => [...colors, "#7A8FA6"])}>{locale === "zh-CN" ? "+ 添加颜色" : "+ Add color"}</button><button disabled={customColors.length <= 2} onClick={() => setCustomColors((colors) => colors.slice(0, -1))}>{locale === "zh-CN" ? "− 减少颜色" : "− Remove"}</button></div></div></details>
                <fieldset><legend>{locale === "zh-CN" ? "样本点形状" : "Point shape"}</legend><div className="shape-options">{pointShapes.map((item) => <button key={item.value} aria-label={item.label[locale]} aria-pressed={pointShape === item.value} className={pointShape === item.value ? "selected" : ""} onClick={() => setPointShape(item.value)}><i className={`shape-${item.value}`} /><span>{item.label[locale]}</span></button>)}</div></fieldset>
                <div className="inspector-grid"><label><span>{locale === "zh-CN" ? "显著性标注" : "P-value label"}</span><select value={pLabelMode} onChange={(event) => setPLabelMode(event.target.value as PLabelMode)}><option value="stars">* / ** / ***</option><option value="stars-exact">Stars + exact p</option><option value="exact">Exact adjusted p</option><option value="none">None</option></select></label><label><span>{locale === "zh-CN" ? "样本点大小" : "Point size"}</span><select value={pointSize} onChange={(event) => setPointSize(Number(event.target.value) as PointSize)}><option value="1.1">{locale === "zh-CN" ? "小" : "Small"}</option><option value="1.5">{locale === "zh-CN" ? "标准" : "Standard"}</option><option value="1.8">{locale === "zh-CN" ? "大" : "Large"}</option><option value="2.2">{locale === "zh-CN" ? "特大" : "Extra large"}</option></select></label><label><span>{locale === "zh-CN" ? "投稿宽度" : "Width"}</span><select value={figureWidth} onChange={(event) => setFigureWidth(Number(event.target.value) as FigureWidth)}><option value="60">60 mm</option><option value="75">75 mm</option><option value="90">90 mm</option><option value="120">120 mm</option><option value="150">150 mm</option><option value="180">180 mm</option></select></label><label><span>{locale === "zh-CN" ? "投稿高度" : "Height"}</span><select value={figureHeight} onChange={(event) => setFigureHeight(Number(event.target.value) as 60 | 70 | 75 | 90 | 105 | 120)}><option value="60">60 mm</option><option value="70">70 mm</option><option value="75">75 mm</option><option value="90">90 mm</option><option value="105">105 mm</option><option value="120">120 mm</option></select></label><label className="check-control"><input type="checkbox" checked={showPoints} onChange={(event) => setShowPoints(event.target.checked)} /><span>{locale === "zh-CN" ? "显示独立样本点" : "Show individual points"}</span></label></div>
                <div className="figure-download"><label><span>{locale === "zh-CN" ? "文件格式" : "File format"}</span><select value={figureFormat} onChange={(event) => setFigureFormat(event.target.value as FigureFormat)}><option value="svg">SVG</option><option value="pdf">PDF</option><option value="png">PNG</option><option value="tiff">TIFF</option></select></label><label><span>{locale === "zh-CN" ? "下载分辨率" : "Download DPI"}</span><select value={figureDpi} disabled={figureFormat === "svg" || figureFormat === "pdf"} onChange={(event) => setFigureDpi(Number(event.target.value) as 300 | 600)}><option value="300">300 dpi</option><option value="600">600 dpi</option></select></label><button className="primary-button" onClick={() => void downloadFigure()} disabled={!result || busy}><Download size={16} />{locale === "zh-CN" ? "下载图形" : "Download figure"}</button></div>
                <details className="package-details"><summary>{locale === "zh-CN" ? "完整科研包（可选）" : "Research package (optional)"}</summary><button className="quiet-button" onClick={downloadExport} disabled={!job || busy}><Download size={15} />{t.export}</button></details>
              </aside>
            </div>
            </section>
          </div>}

          {message && <div className="status-message" role="status">{message}</div>}
        </section>
      </div>
    </main>
  );
}

function EmptyState({ text, onDemo, label }: { text: string; onDemo: () => void | Promise<void>; label: string }) {
  return <div className="empty-state"><FlaskConical size={30} /><p>{text}</p><button className="primary-button" onClick={() => void onDemo()}>{label}</button></div>;
}

function PaletteSwatch({ colors, gradient, whiteCenter = false }: { colors: string[]; gradient: boolean; whiteCenter?: boolean }) {
  if (gradient) {
    const stops = whiteCenter ? [colors[0], "#FFFFFF", colors.at(-1)!] : colors;
    const background = stops.map((color, index) => `${color} ${Math.round(index * 100 / (stops.length - 1))}%`).join(", ");
    return <span className="palette-swatch" style={{ background: `linear-gradient(90deg, ${background})` }} />;
  }
  return <span className="palette-swatch">{colors.map((color) => <i key={color} style={{ background: color }} />)}</span>;
}

function EditableText({ value, ariaLabel, onCommit }: { value: string; ariaLabel: string; onCommit: (value: string) => void }) {
  return <input aria-label={ariaLabel} defaultValue={value} onBlur={(event) => onCommit(event.currentTarget.value)} />;
}

function ExperimentDesignTable({
  experiment,
  locale,
  onReferenceChange,
  onTargetChange,
  onGroupChange
}: {
  experiment: ExperimentInput;
  locale: Locale;
  onReferenceChange: (gene: string) => void;
  onTargetChange: (previous: string, next: string) => void;
  onGroupChange: (previous: string, next: string) => void;
}) {
  const customReference = !referenceGeneOptions.some((option) => option.value === experiment.referenceGene);
  return <div className="design-editor">
    <div className="reference-row">
      <span className="role-tag">Reference</span>
      <label><span>{locale === "zh-CN" ? "内参基因" : "Reference gene"}</span><select aria-label={locale === "zh-CN" ? "内参基因" : "Reference gene"} value={customReference ? "__custom__" : experiment.referenceGene} onChange={(event) => onReferenceChange(event.target.value === "__custom__" ? "ReferenceGene" : event.target.value)}>
        {referenceGeneOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        <option value="__custom__">{locale === "zh-CN" ? "自定义…" : "Custom…"}</option>
      </select></label>
      {customReference && <EditableText value={experiment.referenceGene} ariaLabel={locale === "zh-CN" ? "自定义内参基因" : "Custom reference gene"} onCommit={onReferenceChange} />}
    </div>
    <div className="design-table-wrap"><table className="design-table"><thead><tr>
      <th>{locale === "zh-CN" ? "基因名" : "Gene"}</th>
      <th>{locale === "zh-CN" ? "生物学重复" : "Replicates"}</th>
      <th>{locale === "zh-CN" ? "分组" : "Group"}</th>
    </tr></thead><tbody>{experiment.groups.map((group, groupIndex) => {
      const replicateCount = new Set(experiment.wells.filter((well) => well.groupId === group.id).map((well) => well.biologicalReplicateId)).size;
      return <tr key={group.id}>
        <td><div className="gene-stack">{groupIndex === 0 ? experiment.targetGenes.map((gene, geneIndex) => <EditableText key={gene} value={gene} ariaLabel={`${locale === "zh-CN" ? "目标基因" : "Target gene"} ${geneIndex + 1}`} onCommit={(next) => onTargetChange(gene, next)} />) : experiment.targetGenes.map((gene) => <em key={gene}>{gene}</em>)}</div></td>
        <td><output>{replicateCount}</output></td>
        <td><div className="group-name"><EditableText value={group.id} ariaLabel={`${locale === "zh-CN" ? "分组" : "Group"} ${groupIndex + 1}`} onCommit={(next) => onGroupChange(group.id, next)} />{group.isCalibrator && <span>{locale === "zh-CN" ? "对照" : "Control"}</span>}</div></td>
      </tr>;
    })}</tbody></table></div>
  </div>;
}

function CtSummaryTable({
  experiment,
  locale,
  onReferenceChange,
  onTargetChange,
  onGroupChange
}: {
  experiment: ExperimentInput;
  locale: Locale;
  onReferenceChange: (gene: string) => void;
  onTargetChange: (previous: string, next: string) => void;
  onGroupChange: (previous: string, next: string) => void;
}) {
  const rows = experiment.groups.flatMap((group) => [experiment.referenceGene, ...experiment.targetGenes].flatMap((gene) => {
    const wells = experiment.wells.filter((well) => well.groupId === group.id && well.gene === gene);
    if (wells.length === 0) return [];
    return [{
      gene,
      groupId: group.id,
      reference: gene === experiment.referenceGene,
      replicates: new Set(wells.map((well) => well.biologicalReplicateId)).size
    }];
  }));
  return <div className="table-wrap compact-data-table"><table aria-label={locale === "zh-CN" ? "Ct 数据概览" : "Ct data overview"}><thead><tr>
    <th>{locale === "zh-CN" ? "基因名" : "Gene"}</th>
    <th>{locale === "zh-CN" ? "重复数" : "Replicates"}</th>
    <th>{locale === "zh-CN" ? "分组" : "Group"}</th>
  </tr></thead><tbody>{rows.map((row) => <tr key={`${row.groupId}-${row.gene}`}>
    <td><div className="compact-gene"><EditableText value={row.gene} ariaLabel={`${locale === "zh-CN" ? "基因名" : "Gene"} ${row.gene} ${row.groupId}`} onCommit={(next) => row.reference ? onReferenceChange(next) : onTargetChange(row.gene, next)} />{row.reference && <span>Reference</span>}</div></td>
    <td><output>{row.replicates}</output></td>
    <td><EditableText value={row.groupId} ariaLabel={`${locale === "zh-CN" ? "分组" : "Group"} ${row.groupId} ${row.gene}`} onCommit={(next) => onGroupChange(row.groupId, next)} /></td>
  </tr>)}</tbody></table></div>;
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className={accent ? "metric accent" : "metric"}><span>{label}</span><strong>{value}</strong></div>;
}

function DataTable({ wells, onToggle, locale }: { wells: CtWell[]; onToggle: (id: string) => void; locale: Locale }) {
  return <div className="table-wrap"><table><thead><tr><th>Well</th><th>Sample</th><th>Group</th><th>Gene</th><th>Role</th><th>Ct</th><th>Status</th></tr></thead><tbody>{wells.slice(0, 120).map((well) => <tr key={well.wellId} className={well.status === "excluded" ? "excluded" : ""}><td>{well.wellId}</td><td>{well.sampleId}</td><td>{well.groupId}</td><td>{well.gene}</td><td>{well.geneRole}</td><td>{well.ct ?? "Undetermined"}</td><td><button className="status-button" onClick={() => onToggle(well.wellId)}>{well.status === "excluded" ? (locale === "zh-CN" ? "已排除" : "Excluded") : (locale === "zh-CN" ? "接受" : "Accepted")}</button></td></tr>)}</tbody></table></div>;
}

function ResultsTable({ samples }: { samples: SampleExpression[] }) {
  return <div className="table-wrap"><table><thead><tr><th>Sample</th><th>Group</th><th>Gene</th><th>target Ct</th><th>reference Ct</th><th>ΔCt</th><th>ΔΔCt</th><th>2^-ΔΔCt</th></tr></thead><tbody>{samples.map((sample) => <tr key={`${sample.sampleId}-${sample.targetGene}`}><td>{sample.sampleId}</td><td>{sample.groupId}</td><td>{sample.targetGene}</td><td>{scientific(sample.targetMeanCt)}</td><td>{scientific(sample.referenceMeanCt)}</td><td>{scientific(sample.deltaCt)}</td><td>{scientific(sample.deltaDeltaCt)}</td><td><b>{scientific(sample.foldChange)}</b></td></tr>)}</tbody></table></div>;
}

function OmnibusTable({ rows, locale }: { rows: Array<Record<string, unknown>>; locale: Locale }) {
  const preferred = ["targetGene", "term", "statistic", "numerator_df", "denominator_df", "degrees_freedom", "p_value"];
  const columns = preferred.filter((column) => rows.some((row) => row[column] !== undefined));
  const display = (value: unknown) => typeof value === "number" ? scientific(value) : String(value ?? "—");
  return <div className="table-section"><h3>{locale === "zh-CN" ? "模型总体检验" : "Model omnibus tests"}</h3><div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.targetGene}-${row.term}-${index}`}>{columns.map((column) => <td key={column}>{display(row[column])}</td>)}</tr>)}</tbody></table></div></div>;
}
