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
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  FileSpreadsheet,
  FolderOpen,
  FlaskConical,
  Languages,
  LockKeyhole,
  Palette,
  Play,
  Save,
  ShieldCheck,
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
import type { PlatformAnalysisResult, RGeneAnalysis } from "@/lib/result-types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AccountAccess } from "./account-access";
import { ProjectLibrary, type CloudProject } from "./project-library";

type Locale = "zh-CN" | "en";
type FigureType = "bar" | "dot" | "box" | "violin" | "paired" | "time" | "heatmap";
type FigurePalette = "nature-muted" | "prism" | "okabe-ito" | "tol-bright" | "cool" | "warm";
type PLabelMode = "stars" | "exact" | "stars-exact" | "none";
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
    steps: ["实验设置", "Ct 数据", "质量控制", "统计方案", "分析结果", "科研绘图", "导出归档"],
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
    statsTitle: "统计推荐需人工确认",
    run: "运行 R 分析",
    running: "正在分析…",
    resultTitle: "表达量与统计推断",
    figureTitle: "R / ggplot2 科研图",
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
    steps: ["Experiment", "Ct data", "Quality control", "Statistics", "Results", "Figures", "Export"],
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
    statsTitle: "Confirm the statistical recommendation",
    run: "Run R analysis",
    running: "Analyzing…",
    resultTitle: "Expression and statistical inference",
    figureTitle: "R / ggplot2 research figure",
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

const paletteOptions: Array<{ value: FigurePalette; label: string; colors: string[] }> = [
  { value: "nature-muted", label: "Nature muted", colors: ["#4F6B45", "#D98268", "#4C6F91"] },
  { value: "prism", label: "Prism classic", colors: ["#3B75AF", "#E06B65", "#59A14F"] },
  { value: "okabe-ito", label: "Okabe–Ito", colors: ["#0072B2", "#D55E00", "#009E73"] },
  { value: "tol-bright", label: "Tol bright", colors: ["#4477AA", "#EE6677", "#228833"] },
  { value: "cool", label: "Cool", colors: ["#2F5D8A", "#5A8BB5", "#63A7A3"] },
  { value: "warm", label: "Warm", colors: ["#8C4A32", "#C96B4B", "#D99A4E"] }
];

function recommendedFigureType(experiment: ExperimentInput): FigureType {
  if (experiment.design === "paired_two_group") return "paired";
  if (experiment.design === "repeated_time") return "time";
  if (experiment.targetGenes.length > 1) return "heatmap";
  return "bar";
}

function methodOptions(design: AnalysisConfig["design"], contrastMode?: AnalysisConfig["contrastMode"]): Array<{ value: AnalysisConfig["method"]; label: string }> {
  if (design === "independent_two_group") return [
    { value: "recommended", label: "Welch t-test · recommended" },
    { value: "mann_whitney", label: "Mann–Whitney · sensitivity" }
  ];
  if (design === "paired_two_group") return [
    { value: "recommended", label: "Paired t-test · recommended" },
    { value: "wilcoxon", label: "Wilcoxon signed-rank · sensitivity" }
  ];
  if (design === "one_way") {
    const options: Array<{ value: AnalysisConfig["method"]; label: string }> = [
      { value: "recommended", label: "Design-based recommendation" },
      { value: "welch_anova", label: "Welch ANOVA" },
      { value: "anova", label: "Equal-variance ANOVA" },
      { value: "kruskal_wallis", label: "Kruskal–Wallis · sensitivity" }
    ];
    return options.filter((option) => contrastMode !== "selected" || option.value !== "kruskal_wallis");
  }
  if (design === "two_way") return [
    { value: "recommended", label: "Factorial linear model · recommended" },
    { value: "linear_model", label: "Factorial linear model" }
  ];
  return [
    { value: "recommended", label: "Mixed model · recommended" },
    { value: "mixed_model", label: "Random-intercept mixed model" }
  ];
}

function localizedDiagnostic(diagnostic: NonNullable<RGeneAnalysis["diagnostics"]>, locale: Locale): string {
  const zh = locale === "zh-CN";
  const notes: string[] = [];
  if ((diagnostic.minimum_group_n ?? Infinity) < 3) notes.push(zh ? "至少一组独立样本少于 3。" : "At least one group has fewer than three independent units.");
  if ((diagnostic.residual_normality_p ?? 1) < 0.05) notes.push(zh ? "残差正态性存疑；请检查诊断图，并考虑预先声明的非参数敏感性分析。" : "Residual normality is questionable; inspect diagnostics and consider the declared nonparametric sensitivity analysis.");
  if ((diagnostic.variance_homogeneity_p ?? 1) < 0.05) notes.push(zh ? "组间方差可能不同；应保留不等方差模型或报告稳健性分析。" : "Group variances may differ; retain an unequal-variance model or report robust sensitivity analysis.");
  if ((diagnostic.standardized_residual_outlier_count ?? 0) > 0) notes.push(zh ? "存在 |标准化残差| > 3 的观测；仅人工复核，不自动排除。" : "Some standardized residuals exceed |3|; review them without automatic exclusion.");
  return notes.join(" ") || (zh ? "未触发自动诊断警报；仍需人工检查残差图。" : "No automatic diagnostic flag triggered; graphical residual review remains required.");
}

function selectedMethodLabel(config: AnalysisConfig): string {
  if (config.method !== "recommended") {
    return methodOptions(config.design, config.contrastMode).find((option) => option.value === config.method)?.label.replace(/ · .+$/, "") ?? config.method;
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
  const [pLabelMode, setPLabelMode] = useState<PLabelMode>("stars");
  const [showPoints, setShowPoints] = useState(true);
  const [figureWidth, setFigureWidth] = useState<90 | 180>(90);
  const [figureDpi, setFigureDpi] = useState<300 | 600>(300);
  const [qcDecisions, setQcDecisions] = useState<QcDecision[]>([]);
  const [paste, setPaste] = useState(starterText);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PlatformAnalysisResult | null>(null);
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

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    if (!client) return;
    void client.auth.getUser().then(({ data }) => setUserEmail(data.user?.email));
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  function loadExample(exampleId: ExampleId) {
    const demo = createExampleExperiment(exampleId, locale);
    const example = exampleCatalog.find((item) => item.id === exampleId);
    setExperiment(demo);
    setConfig(defaultAnalysisConfig(demo));
    setFigureType(example?.figureType ?? "bar");
    setResult(null);
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
    setJob(null);
    setQcDecisions([]);
    setMessage("");
  }

  function changeLocale() {
    const next = locale === "zh-CN" ? "en" : "zh-CN";
    setLocale(next);
    if (experiment) setExperiment({ ...experiment, locale: next });
  }

  function acceptWells(wells: CtWell[], decisions: QcDecision[] = []) {
    const next = inferExperiment(wells, locale, experiment ?? undefined);
    setExperiment(next);
    setConfig(defaultAnalysisConfig(next));
    setFigureType(recommendedFigureType(next));
    setQcDecisions(decisions);
    setResult(null);
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
    setJob(null);
  }

  async function saveProject() {
    if (!experiment) return;
    await guestProjects.put({
      id: experiment.projectId,
      name: experiment.name,
      updatedAt: Date.now(),
      payload: { experiment, config, figureType, figurePalette, pLabelMode, showPoints, figureWidth, figureDpi, qcDecisions }
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
    const stored = payload as { experiment?: unknown; config?: unknown; figureType?: unknown; figurePalette?: unknown; pLabelMode?: unknown; showPoints?: unknown; figureWidth?: unknown; figureDpi?: unknown; qcDecisions?: unknown; result?: unknown };
    const parsedExperiment = experimentInputSchema.safeParse(stored.experiment);
    const parsedConfig = analysisConfigSchema.safeParse(stored.config);
    const parsedDecisions = qcDecisionSchema.array().safeParse(stored.qcDecisions ?? []);
    if (!parsedExperiment.success || !parsedConfig.success || !parsedDecisions.success) {
      setMessage(locale === "zh-CN" ? "项目数据已损坏，无法打开。" : "The saved project is invalid.");
      return;
    }
    setExperiment(parsedExperiment.data);
    setConfig(parsedConfig.data);
    if (["bar", "dot", "box", "violin", "paired", "time", "heatmap"].includes(String(stored.figureType))) {
      setFigureType(stored.figureType as FigureType);
    }
    if (["nature-muted", "prism", "okabe-ito", "tol-bright", "cool", "warm"].includes(String(stored.figurePalette))) setFigurePalette(stored.figurePalette as FigurePalette);
    if (["stars", "exact", "stars-exact", "none"].includes(String(stored.pLabelMode))) setPLabelMode(stored.pLabelMode as PLabelMode);
    if (typeof stored.showPoints === "boolean") setShowPoints(stored.showPoints);
    if (stored.figureWidth === 90 || stored.figureWidth === 180) setFigureWidth(stored.figureWidth);
    if (stored.figureDpi === 300 || stored.figureDpi === 600) setFigureDpi(stored.figureDpi);
    setResult(stored.result && typeof stored.result === "object" ? stored.result as PlatformAnalysisResult : null);
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

  async function runAnalysis(experimentOverride?: ExperimentInput, configOverride?: AnalysisConfig, destinationStep = 4, figureTypeOverride?: FigureType) {
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
        figure: { plotType: activeFigureType, widthMm: figureWidth, heightMm: figureWidth === 180 ? 105 : 70, dpi: figureDpi, palette: figurePalette, pLabelMode, showPoints },
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
      setJob({
        id: payload.id,
        ...(payload.token ? { token: payload.token, exportRequest: analysisRequest } : {}),
        ...(payload.expiresAt ? { expiresAt: payload.expiresAt } : {})
      });
      await guestProjects.appendVersion({
        id: activeExperiment.projectId,
        name: activeExperiment.name,
        payload: { experiment: activeExperiment, config: activeConfig, figureType: activeFigureType, figurePalette, pLabelMode, showPoints, figureWidth, figureDpi, qcDecisions, result: completedResult }
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
      await runAnalysis(nextExperiment, nextConfig, 4, nextFigureType);
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
        headers: job.token
          ? { "x-capability-token": job.token, "Content-Type": "application/json" }
          : {},
        ...(job.token && job.exportRequest ? { body: JSON.stringify(job.exportRequest) } : {})
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

  const contrasts = result?.statistics?.contrasts ?? [];
  const contrast = contrasts.length === 1 ? contrasts[0] : undefined;
  const omnibusRows = collectOmnibusRows(result);
  const fittedMethod = result ? Object.values(result.statistics.analyses)[0]?.method : undefined;
  const diagnostic = result ? Object.values(result.statistics.analyses)[0]?.diagnostics : undefined;
  const svg = result?.figure?.svg as string | undefined;
  const svgUrl = svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : "";
  const adjustedPValues = contrasts.map((item) => item.p_adjusted_family ?? item.p_adjusted).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const availableFigureTypes: Array<{ value: FigureType; label: string }> = [
    { value: "bar", label: locale === "zh-CN" ? "柱 + 点" : "Bar + points" },
    { value: "dot", label: locale === "zh-CN" ? "散点" : "Dot" },
    { value: "box", label: locale === "zh-CN" ? "箱线" : "Box" },
    { value: "violin", label: locale === "zh-CN" ? "小提琴" : "Violin" },
    ...(experiment?.design === "paired_two_group" ? [{ value: "paired" as const, label: locale === "zh-CN" ? "配对" : "Paired" }] : []),
    ...(experiment?.design === "repeated_time" ? [{ value: "time" as const, label: locale === "zh-CN" ? "时间曲线" : "Time" }] : []),
    ...((experiment?.targetGenes.length ?? 0) > 1 ? [{ value: "heatmap" as const, label: locale === "zh-CN" ? "热图" : "Heatmap" }] : [])
  ];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><FlaskConical size={18} /></span><div><strong>qPCR Helper</strong><span>{t.subtitle}</span></div></div>
        <div className="top-actions">
          <span className="privacy-state"><LockKeyhole size={14} />{userEmail ? (locale === "zh-CN" ? "私有云项目" : "Private cloud") : t.guest}</span>
          <button className="quiet-button" onClick={openLibrary}><FolderOpen size={15} />{t.projects}</button>
          <button className="quiet-button" onClick={changeLocale}><Languages size={15} />{t.lang}</button>
          <button className="quiet-button" onClick={() => setShowAccount((value) => !value)}>{userEmail ?? t.signIn}</button>
        </div>
        {showAccount && <AccountAccess locale={locale} currentEmail={userEmail} onClose={() => setShowAccount(false)} onSignedOut={() => setUserEmail(undefined)} />}
        {showLibrary && <ProjectLibrary locale={locale} localProjects={localProjects} cloudProjects={cloudProjects} onClose={() => setShowLibrary(false)} onOpenLocal={(project) => applyStoredProject(project.payload)} onOpenCloud={(project, versionId) => void openCloudProject(project, versionId)} onDeleteLocal={(project) => void deleteLocalProject(project)} onDeleteCloud={(project) => void deleteCloudProject(project)} />}
      </header>

      <div className="workspace-grid">
        <aside className="step-rail" aria-label={locale === "zh-CN" ? "分析步骤" : "Analysis steps"}>
          <div className="rail-heading"><span>Workflow</span><b>01—07</b></div>
          <ol>{t.steps.map((label, index) => (
            <li key={label} className={index === step ? "active" : index < step ? "complete" : ""}>
              <button onClick={() => setStep(index)}><span>{index < step ? <Check size={13} /> : String(index + 1).padStart(2, "0")}</span>{label}</button>
            </li>
          ))}</ol>
        </aside>

        <section className="work-area">
          <div className="page-heading">
            <div><span className="eyebrow">{t.steps[step]}</span><h1>{t.title}</h1></div>
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

          {step === 0 && <section className="panel setup-panel">
            <div className="section-intro"><span className="section-number">01</span><div><h2>{t.steps[0]}</h2><p>{locale === "zh-CN" ? "先声明设计，再让模型推荐统计方法。" : "Declare the design before the model recommends inference."}</p></div></div>
            {!experiment ? <EmptyState text={t.empty} onDemo={loadDemo} label={t.demo} /> : <div className="field-grid">
              <label><span>{t.project}</span><input value={experiment.name} onChange={(event) => setExperiment({ ...experiment, name: event.target.value })} /></label>
              <label><span>{t.design}</span><select value={experiment.design} onChange={(event) => {
                const next = { ...experiment, design: event.target.value as ExperimentInput["design"] };
                setExperiment(next); setConfig(defaultAnalysisConfig(next));
              }}><option value="independent_two_group">{locale === "zh-CN" ? "两组独立" : "Independent two-group"}</option><option value="paired_two_group">{locale === "zh-CN" ? "两组配对" : "Paired two-group"}</option><option value="one_way">{locale === "zh-CN" ? "单因素多组" : "One-way multi-group"}</option><option value="two_way">{locale === "zh-CN" ? "两因素" : "Two-way"}</option><option value="repeated_time">{locale === "zh-CN" ? "重复测量 / 时间" : "Repeated / time"}</option></select></label>
              <ReadOnlyField label={t.reference} value={experiment.referenceGene} />
              <ReadOnlyField label={t.target} value={experiment.targetGenes.join(", ")} />
              <ReadOnlyField label={t.calibrator} value={experiment.groups.find((group) => group.isCalibrator)?.name ?? "—"} />
            </div>}
          </section>}

          {step === 1 && <section className="panel">
            <div className="section-intro"><span className="section-number">02</span><div><h2>{t.importTitle}</h2><p>{t.importHint}</p></div></div>
            <textarea className="data-paste" value={paste} onChange={(event) => setPaste(event.target.value)} spellCheck={false} />
            <div className="inline-actions"><button className="quiet-button" onClick={parsePaste}><FileSpreadsheet size={16} />{t.parse}</button><button className="quiet-button" onClick={() => fileRef.current?.click()}><Upload size={16} />CSV / XLSX</button><button className="primary-button" onClick={() => void analyzePastedData()} disabled={busy}><Play size={16} />{locale === "zh-CN" ? "一键分析并出图" : "Analyze & plot"}</button><input ref={fileRef} hidden type="file" accept=".csv,.tsv,.txt,.xls,.xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></div>
            {experiment && <DataTable wells={experiment.wells} onToggle={updateWell} locale={locale} />}
          </section>}

          {step === 2 && <section className="panel">
            <div className="section-intro"><span className="section-number">03</span><div><h2>{t.qcTitle}</h2><p>{t.exactN}</p></div></div>
            <div className="qc-list">{localCalculation?.qc.map((item, index) => <div className="qc-row" key={`${item.code}-${index}`}><span className={`severity ${item.severity}`}>{item.severity}</span><b>{item.code}</b><p>{item.message}</p></div>) ?? <p>{t.empty}</p>}</div>
          </section>}

          {step === 3 && <section className="panel">
            <div className="section-intro"><span className="section-number">04</span><div><h2>{t.statsTitle}</h2><p>{locale === "zh-CN" ? "推荐器依据实验设计；诊断只提供备选，不静默切换。" : "Recommendations follow the design; diagnostics suggest alternatives without silent switching."}</p></div></div>
            {config ? <div className="recommendation">
              <div><span className="eyebrow">{config.method === "recommended" ? (locale === "zh-CN" ? "推荐" : "RECOMMENDED") : (locale === "zh-CN" ? "已选择" : "SELECTED")}</span><h3>{selectedMethodLabel(config)}</h3><p>{t.exactN}</p></div>
              <div className="field-grid compact"><label><span>{locale === "zh-CN" ? "统计方法" : "Statistical method"}</span><select value={config.method} onChange={(event) => setConfig({ ...config, method: event.target.value as AnalysisConfig["method"] })}>{methodOptions(config.design, config.contrastMode).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label><span>{locale === "zh-CN" ? "比较范围" : "Contrasts"}</span><select value={config.contrastMode} onChange={(event) => updateContrastMode(event.target.value as AnalysisConfig["contrastMode"])}><option value="selected">Selected</option><option value="control">Control</option><option value="all_pairs">All pairs</option></select></label><label><span>{locale === "zh-CN" ? "多重校正" : "Correction"}</span><select value={config.correction} onChange={(event) => updateCorrection(event.target.value as AnalysisConfig["correction"])}><option value="holm">Holm</option><option value="BH">BH-FDR</option><option value="none">None</option>{config.design === "one_way" && <><option value="dunnett">Dunnett</option><option value="tukey">Tukey</option><option value="games-howell">Games–Howell</option></>}</select></label><label><span>{locale === "zh-CN" ? "显著性水平 α" : "Significance α"}</span><select value={config.alpha} onChange={(event) => setConfig({ ...config, alpha: Number(event.target.value) })}><option value="0.01">0.01</option><option value="0.05">0.05</option><option value="0.1">0.10</option></select></label><label><span>{locale === "zh-CN" ? "置信水平" : "Confidence level"}</span><select value={config.confidenceLevel} onChange={(event) => setConfig({ ...config, confidenceLevel: Number(event.target.value) })}><option value="0.9">90%</option><option value="0.95">95%</option><option value="0.99">99%</option></select></label>{config.design === "one_way" && config.contrastMode === "selected" && <><label><span>Numerator</span><select value={config.selectedComparisons?.[0]?.numerator ?? ""} onChange={(event) => updateSelectedComparison("numerator", event.target.value)}>{experiment?.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label><span>Denominator</span><select value={config.selectedComparisons?.[0]?.denominator ?? ""} onChange={(event) => updateSelectedComparison("denominator", event.target.value)}>{experiment?.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label></>}</div>
              {config.design === "one_way" && <div className="posthoc-guide"><span><b>Tukey</b>{locale === "zh-CN" ? "全部两两 · 等方差 ANOVA" : "all pairs · equal-variance ANOVA"}</span><span><b>Games–Howell</b>{locale === "zh-CN" ? "全部两两 · 不等方差" : "all pairs · unequal variances"}</span><span><b>Dunnett</b>{locale === "zh-CN" ? "各处理组 vs 对照" : "each treatment vs control"}</span></div>}
              <button className="primary-button run-button" onClick={() => void runAnalysis()} disabled={busy || !localCalculation}><Play size={16} />{busy ? t.running : t.run}</button>
            </div> : <EmptyState text={t.empty} onDemo={loadDemo} label={t.demo} />}
          </section>}

          {step === 4 && <section className="panel">
            <div className="section-intro"><span className="section-number">05</span><div><h2>{t.resultTitle}</h2><p>{locale === "zh-CN" ? `推断在 ΔCt 尺度完成，效应量与 ${percentLabel(config?.confidenceLevel)} CI 反变换为倍数。` : `Inference is performed on ΔCt; effects and ${percentLabel(config?.confidenceLevel)} CIs are back-transformed to fold change.`}</p></div></div>
            {result ? <>{contrast ? <div className="metric-strip"><Metric label={contrast.target_gene ? `${contrast.target_gene} · fold change` : "Fold change"} value={`${scientific(contrast.fold_change)}×`} accent /><Metric label={`${percentLabel(config?.confidenceLevel)} CI`} value={`${scientific(contrast.fold_change_ci_low)}–${scientific(contrast.fold_change_ci_high)}`} /><Metric label={`adjusted p · α ${config?.alpha ?? 0.05}`} value={scientific(contrast.p_adjusted_family ?? contrast.p_adjusted)} /><Metric label="biological n" value={biologicalNLabel(result)} /></div> : <div className="metric-strip"><Metric label={locale === "zh-CN" ? "拟合方法" : "Fitted method"} value={fittedMethod ?? "—"} accent /><Metric label={locale === "zh-CN" ? "比较数量" : "Comparisons"} value={String(contrasts.length)} /><Metric label={locale === "zh-CN" ? "最小校正 p" : "Minimum adjusted p"} value={scientific(adjustedPValues.length ? Math.min(...adjustedPValues) : undefined)} /><Metric label="biological n" value={biologicalNLabel(result)} /></div>}{diagnostic && <div className="diagnostic-note"><strong>{locale === "zh-CN" ? "模型诊断" : "Model diagnostics"}</strong><p>{localizedDiagnostic(diagnostic, locale)}</p><span>Shapiro p {scientific(diagnostic.residual_normality_p)} · Fligner p {scientific(diagnostic.variance_homogeneity_p)} · {locale === "zh-CN" ? "离群残差" : "outliers"} {diagnostic.standardized_residual_outlier_count ?? 0}</span></div>}{omnibusRows.length > 0 && <OmnibusTable rows={omnibusRows} locale={locale} />}<ResultsTable samples={result.calculation.samples} /></> : <EmptyState text={t.empty} onDemo={loadDemo} label={t.demo} />}
          </section>}

          {step === 5 && <section className="panel figure-panel">
            <div className="section-intro"><span className="section-number">06</span><div><h2>{t.figureTitle}</h2><p>{figureWidth} mm · Helvetica · 6.5 pt · {percentLabel(config?.confidenceLevel)} CI · editable SVG/PDF</p></div></div>
            <div className="figure-studio">
              <div className="figure-stage">
                {svgUrl ? <div className="figure-canvas"><Image src={svgUrl} width={900} height={620} unoptimized alt={locale === "zh-CN" ? "R 生成的相对表达量图" : "R-generated relative expression plot"} /></div> : <EmptyState text={locale === "zh-CN" ? "输入 Ct 后点击一键分析出图。" : "Enter Ct values, then analyze and plot."} onDemo={() => runAnalysis(undefined, undefined, 5)} label={t.run} />}
                <div className="figure-meta"><span>{result?.figure.backend ?? "R"}</span><span>{figureWidth} × {figureWidth === 180 ? 105 : 70} mm</span><span>{figureDpi} dpi raster</span></div>
              </div>
              <aside className="figure-inspector">
                <div className="inspector-heading"><Palette size={16} /><div><strong>{locale === "zh-CN" ? "图形设置" : "Figure settings"}</strong><span>{locale === "zh-CN" ? "修改后生成新版本" : "Changes create a new version"}</span></div></div>
                <fieldset><legend>{locale === "zh-CN" ? "图形类型" : "Plot type"}</legend><div className="plot-tabs">{availableFigureTypes.map((item) => <button key={item.value} className={figureType === item.value ? "selected" : ""} onClick={() => setFigureType(item.value)}>{item.label}</button>)}</div></fieldset>
                <fieldset><legend>{locale === "zh-CN" ? "配色" : "Palette"}</legend><div className="palette-grid">{paletteOptions.map((item) => <button key={item.value} title={item.label} aria-label={item.label} className={figurePalette === item.value ? "selected" : ""} onClick={() => setFigurePalette(item.value)}><span>{item.colors.map((color) => <i key={color} style={{ background: color }} />)}</span><small>{item.label}</small></button>)}</div></fieldset>
                <div className="inspector-grid"><label><span>{locale === "zh-CN" ? "显著性标注" : "P-value label"}</span><select value={pLabelMode} onChange={(event) => setPLabelMode(event.target.value as PLabelMode)}><option value="stars">* / ** / ***</option><option value="stars-exact">Stars + exact p</option><option value="exact">Exact adjusted p</option><option value="none">None</option></select></label><label><span>{locale === "zh-CN" ? "投稿宽度" : "Width"}</span><select value={figureWidth} onChange={(event) => setFigureWidth(Number(event.target.value) as 90 | 180)}><option value="90">90 mm</option><option value="180">180 mm</option></select></label><label><span>{locale === "zh-CN" ? "位图分辨率" : "Raster DPI"}</span><select value={figureDpi} onChange={(event) => setFigureDpi(Number(event.target.value) as 300 | 600)}><option value="300">300 dpi</option><option value="600">600 dpi</option></select></label><label className="check-control"><input type="checkbox" checked={showPoints} onChange={(event) => setShowPoints(event.target.checked)} /><span>{locale === "zh-CN" ? "显示独立样本点" : "Show individual points"}</span></label></div>
                <div className="star-key"><span>ns</span><span>* &lt; 0.05</span><span>** &lt; 0.01</span><span>*** &lt; 0.001</span><span>**** &lt; 0.0001</span></div>
                <button className="primary-button generate-figure" onClick={() => void runAnalysis(undefined, undefined, 5)} disabled={busy || !experiment}>{busy ? t.running : locale === "zh-CN" ? "生成投稿图" : "Generate figure"}</button>
              </aside>
            </div>
          </section>}

          {step === 6 && <section className="panel">
            <div className="section-intro"><span className="section-number">07</span><div><h2>{t.exportTitle}</h2><p>{locale === "zh-CN" ? "原始/清洗数据、QC、计算链、统计、四种图形格式、R 脚本、sessionInfo、图注、Methods 与校验清单。" : "Raw/clean data, QC, calculations, statistics, four figure formats, R script, sessionInfo, legend, Methods and checksums."}</p></div></div>
            <div className="export-box"><Download size={26} /><div><h3>qpcr-helper-research-package.zip</h3><p>{job?.expiresAt ? `${locale === "zh-CN" ? "临时下载有效至" : "Temporary download expires"} ${new Date(job.expiresAt).toLocaleString(locale)}` : locale === "zh-CN" ? "项目与产物仅当前账户可访问。" : "Projects and artifacts are private to this account."}</p></div><button className="primary-button" onClick={downloadExport} disabled={!job || busy}>{busy ? t.running : t.export}</button></div>
            <p className="privacy-footnote"><ShieldCheck size={13} />{locale === "zh-CN" ? "游客项目保存在本浏览器；上传任务与导出物 1 小时后过期。" : "Guest projects stay in this browser; uploaded jobs and exports expire after one hour."}</p>
          </section>}

          {message && <div className="status-message" role="status">{message}</div>}
          {experiment && <div className="dataset-status"><span className="status-dot" />{experiment.wells.length} {t.wells} · {new Set(experiment.wells.map((well) => well.sampleId)).size} {locale === "zh-CN" ? "个样本记录" : "sample records"} · {experiment.targetGenes.length} {locale === "zh-CN" ? "个目标基因" : "target genes"}</div>}
          <nav className="page-nav"><button className="quiet-button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}><ArrowLeft size={16} />{t.back}</button><span>{String(step + 1).padStart(2, "0")} / 07</span><button className="primary-button" onClick={() => setStep(Math.min(6, step + 1))} disabled={step === 6}>{t.next}<ArrowRight size={16} /></button></nav>
        </section>
      </div>
    </main>
  );
}

function EmptyState({ text, onDemo, label }: { text: string; onDemo: () => void | Promise<void>; label: string }) {
  return <div className="empty-state"><FlaskConical size={30} /><p>{text}</p><button className="primary-button" onClick={() => void onDemo()}>{label}</button></div>;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <label><span>{label}</span><div className="readonly-field">{value}</div></label>;
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
