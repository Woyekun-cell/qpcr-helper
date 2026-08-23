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
  ChevronDown,
  CircleAlert,
  Download,
  FileSpreadsheet,
  FolderOpen,
  FlaskConical,
  Languages,
  LockKeyhole,
  Play,
  Save,
  ShieldCheck,
  Sparkles,
  Upload
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { defaultAnalysisConfig } from "@/lib/analysis-request";
import { createDemoExperiment } from "@/lib/demo";
import { guestProjects } from "@/lib/guest-projects";
import type { GuestProject } from "@/lib/guest-projects";
import { parseCtText, parseCtWorkbook } from "@/lib/import";
import type { PlatformAnalysisResult } from "@/lib/result-types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AccountAccess } from "./account-access";
import { ProjectLibrary, type CloudProject } from "./project-library";

type Locale = "zh-CN" | "en";
type FigureType = "dot" | "box" | "violin" | "paired" | "time" | "heatmap";
interface JobReference { id: string; token?: string; expiresAt?: number }

const copy = {
  "zh-CN": {
    title: "qPCR 科研分析平台",
    subtitle: "从 Ct 到可复现结论",
    guest: "游客 · 本地保存",
    signIn: "登录",
    projects: "项目",
    demo: "载入演示",
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
    localNote: "游客数据长期保存在 IndexedDB；传入分析服务的任务数据与导出物 1 小时后过期。",
    risk: "单内参可运行，但需依据 MIQE 2.0 独立验证其稳定性。",
    exactN: "n 仅计生物学重复，技术孔先汇总。",
    wells: "个孔",
    lang: "English"
  },
  en: {
    title: "qPCR Research Platform",
    subtitle: "From Ct values to reproducible evidence",
    guest: "Guest · saved locally",
    signIn: "Sign in",
    projects: "Projects",
    demo: "Load demo",
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
    localNote: "Guest projects persist in IndexedDB; transmitted job data and exports expire after one hour.",
    risk: "A single reference gene can run, but its stability requires independent validation under MIQE 2.0.",
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
  if (Math.abs(value) < 0.001) return value.toExponential(2);
  return value.toPrecision(4);
}

export function Workbench() {
  const [locale, setLocale] = useState<Locale>("zh-CN");
  const t = copy[locale];
  const [step, setStep] = useState(0);
  const [experiment, setExperiment] = useState<ExperimentInput | null>(null);
  const [config, setConfig] = useState<AnalysisConfig | null>(null);
  const [figureType, setFigureType] = useState<FigureType>("dot");
  const [qcDecisions, setQcDecisions] = useState<QcDecision[]>([]);
  const [paste, setPaste] = useState(starterText);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PlatformAnalysisResult | null>(null);
  const [job, setJob] = useState<JobReference | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [localProjects, setLocalProjects] = useState<GuestProject[]>([]);
  const [cloudProjects, setCloudProjects] = useState<CloudProject[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const localCalculation = useMemo<AnalysisResult | null>(() => {
    if (!experiment) return null;
    try { return analyzeDeltaDeltaCt(experiment); } catch { return null; }
  }, [experiment]);

  function loadDemo() {
    const demo = createDemoExperiment(locale);
    setExperiment(demo);
    setConfig(defaultAnalysisConfig(demo));
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

  function acceptWells(wells: CtWell[]) {
    const next = inferExperiment(wells, locale, experiment ?? undefined);
    setExperiment(next);
    setConfig(defaultAnalysisConfig(next));
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
      const wells = /\.xlsx?$/i.test(file.name)
        ? await parseCtWorkbook(await file.arrayBuffer())
        : parseCtText(await file.text());
      acceptWells(wells);
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
      payload: { experiment, config, figureType, qcDecisions }
    });
    setMessage(locale === "zh-CN" ? "已保存到本浏览器。" : "Saved in this browser.");
  }

  async function openLibrary() {
    setLocalProjects(await guestProjects.list());
    const client = createSupabaseBrowserClient();
    if (client) {
      const { data } = await client.from("projects").select("id, name, updated_at").order("updated_at", { ascending: false });
      setCloudProjects(data ?? []);
    }
    setShowLibrary(true);
  }

  function applyStoredProject(payload: unknown) {
    const stored = payload as { experiment?: unknown; config?: unknown; figureType?: unknown; qcDecisions?: unknown };
    const parsedExperiment = experimentInputSchema.safeParse(stored.experiment);
    const parsedConfig = analysisConfigSchema.safeParse(stored.config);
    const parsedDecisions = qcDecisionSchema.array().safeParse(stored.qcDecisions ?? []);
    if (!parsedExperiment.success || !parsedConfig.success || !parsedDecisions.success) {
      setMessage(locale === "zh-CN" ? "项目数据已损坏，无法打开。" : "The saved project is invalid.");
      return;
    }
    setExperiment(parsedExperiment.data);
    setConfig(parsedConfig.data);
    if (["dot", "box", "violin", "paired", "time", "heatmap"].includes(String(stored.figureType))) {
      setFigureType(stored.figureType as FigureType);
    }
    setResult(null);
    setJob(null);
    setQcDecisions(parsedDecisions.data);
    setStep(0);
    setShowLibrary(false);
  }

  async function openCloudProject(project: CloudProject) {
    const client = createSupabaseBrowserClient();
    if (!client) return;
    const { data } = await client.from("experiment_versions")
      .select("id, experiment, analysis_config")
      .eq("project_id", project.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
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

  async function runAnalysis() {
    if (!experiment || !config) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/analysis-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experiment,
          config,
          figure: { plotType: figureType, widthMm: 90, heightMm: 70, dpi: 300 },
          qcDecisions
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Analysis failed");
      setResult(payload.result as PlatformAnalysisResult);
      setJob({ id: payload.id, ...(payload.token ? { token: payload.token } : {}), ...(payload.expiresAt ? { expiresAt: payload.expiresAt } : {}) });
      setStep(4);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Analysis failed");
    } finally {
      setBusy(false);
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
        headers: job.token ? { "x-capability-token": job.token } : {}
      });
      if (!response.ok) throw new Error((await response.json()).message ?? "Export failed");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "qpcr-research-package.zip";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export failed");
    } finally { setBusy(false); }
  }

  const contrast = result?.statistics?.contrasts?.[0];
  const svg = result?.figure?.svg as string | undefined;
  const svgUrl = svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : "";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><FlaskConical size={18} /></span><div><strong>ΔΔCt Lab</strong><span>{t.subtitle}</span></div></div>
        <div className="top-actions">
          <span className="privacy-state"><LockKeyhole size={14} />{t.guest}</span>
          <button className="quiet-button" onClick={openLibrary}><FolderOpen size={15} />{t.projects}</button>
          <button className="quiet-button" onClick={changeLocale}><Languages size={15} />{t.lang}</button>
          <button className="quiet-button" onClick={() => setShowAccount((value) => !value)}>{t.signIn}</button>
        </div>
        {showAccount && <AccountAccess locale={locale} onClose={() => setShowAccount(false)} />}
        {showLibrary && <ProjectLibrary locale={locale} localProjects={localProjects} cloudProjects={cloudProjects} onClose={() => setShowLibrary(false)} onOpenLocal={(project) => applyStoredProject(project.payload)} onOpenCloud={(project) => void openCloudProject(project)} onDeleteLocal={(project) => void deleteLocalProject(project)} onDeleteCloud={(project) => void deleteCloudProject(project)} />}
      </header>

      <div className="workspace-grid">
        <aside className="step-rail" aria-label={locale === "zh-CN" ? "分析步骤" : "Analysis steps"}>
          <div className="rail-heading"><span>Workflow</span><b>01—07</b></div>
          <ol>{t.steps.map((label, index) => (
            <li key={label} className={index === step ? "active" : index < step ? "complete" : ""}>
              <button onClick={() => setStep(index)}><span>{index < step ? <Check size={13} /> : String(index + 1).padStart(2, "0")}</span>{label}</button>
            </li>
          ))}</ol>
          <div className="rail-note"><ShieldCheck size={17} /><p>{t.localNote}</p></div>
        </aside>

        <section className="work-area">
          <div className="page-heading">
            <div><span className="eyebrow">{t.steps[step]}</span><h1>{t.title}</h1></div>
            <div className="heading-actions"><button className="quiet-button" onClick={loadDemo}><Sparkles size={15} />{t.demo}</button><button className="quiet-button" onClick={saveProject} disabled={!experiment}><Save size={15} />{t.save}</button></div>
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
            <div className="inline-actions"><button className="primary-button" onClick={parsePaste}><FileSpreadsheet size={16} />{t.parse}</button><button className="quiet-button" onClick={() => fileRef.current?.click()}><Upload size={16} />CSV / XLSX</button><input ref={fileRef} hidden type="file" accept=".csv,.tsv,.txt,.xls,.xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></div>
            {experiment && <DataTable wells={experiment.wells} onToggle={updateWell} locale={locale} />}
          </section>}

          {step === 2 && <section className="panel">
            <div className="section-intro"><span className="section-number">03</span><div><h2>{t.qcTitle}</h2><p>{t.exactN}</p></div></div>
            <div className="notice warning"><CircleAlert size={18} /><div><strong>MIQE 2.0</strong><p>{t.risk}</p></div></div>
            <div className="qc-list">{localCalculation?.qc.map((item, index) => <div className="qc-row" key={`${item.code}-${index}`}><span className={`severity ${item.severity}`}>{item.severity}</span><b>{item.code}</b><p>{item.message}</p></div>) ?? <p>{t.empty}</p>}</div>
          </section>}

          {step === 3 && <section className="panel">
            <div className="section-intro"><span className="section-number">04</span><div><h2>{t.statsTitle}</h2><p>{locale === "zh-CN" ? "推荐器依据实验设计；诊断只提供备选，不静默切换。" : "Recommendations follow the design; diagnostics suggest alternatives without silent switching."}</p></div></div>
            {config ? <div className="recommendation">
              <div><span className="eyebrow">{locale === "zh-CN" ? "推荐" : "RECOMMENDED"}</span><h3>{config.design === "independent_two_group" ? "Welch t-test" : config.design === "paired_two_group" ? "Paired t-test" : config.design === "one_way" ? config.correction === "dunnett" ? "ANOVA + Dunnett" : config.correction === "tukey" ? "ANOVA + Tukey" : config.contrastMode === "selected" ? "Selected Welch contrasts + Holm" : "Welch ANOVA + Games–Howell" : config.design === "two_way" ? "Linear model + interaction" : "Random-intercept mixed model"}</h3><p>{t.exactN}</p></div>
              <div className="field-grid compact"><label><span>{locale === "zh-CN" ? "比较范围" : "Contrasts"}</span><select value={config.contrastMode} onChange={(event) => updateContrastMode(event.target.value as AnalysisConfig["contrastMode"])}><option value="selected">Selected</option><option value="control">Control</option><option value="all_pairs">All pairs</option></select></label><label><span>{locale === "zh-CN" ? "多重校正" : "Correction"}</span><select value={config.correction} onChange={(event) => updateCorrection(event.target.value as AnalysisConfig["correction"])}><option value="holm">Holm</option><option value="BH">BH-FDR</option><option value="none">None</option>{config.design === "one_way" && <><option value="dunnett">Dunnett</option><option value="tukey">Tukey</option><option value="games-howell">Games–Howell</option></>}</select></label>{config.design === "one_way" && config.contrastMode === "selected" && <><label><span>Numerator</span><select value={config.selectedComparisons?.[0]?.numerator ?? ""} onChange={(event) => updateSelectedComparison("numerator", event.target.value)}>{experiment?.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label><span>Denominator</span><select value={config.selectedComparisons?.[0]?.denominator ?? ""} onChange={(event) => updateSelectedComparison("denominator", event.target.value)}>{experiment?.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label></>}</div>
              <button className="primary-button run-button" onClick={runAnalysis} disabled={busy || !localCalculation}><Play size={16} />{busy ? t.running : t.run}</button>
            </div> : <EmptyState text={t.empty} onDemo={loadDemo} label={t.demo} />}
          </section>}

          {step === 4 && <section className="panel">
            <div className="section-intro"><span className="section-number">05</span><div><h2>{t.resultTitle}</h2><p>{locale === "zh-CN" ? "推断在 ΔCt 尺度完成，效应量与 95% CI 反变换为倍数。" : "Inference is performed on ΔCt; effects and 95% CIs are back-transformed to fold change."}</p></div></div>
            {result ? <><div className="metric-strip"><Metric label="Fold change" value={`${scientific(contrast?.fold_change)}×`} accent /><Metric label="95% CI" value={`${scientific(contrast?.fold_change_ci_low)}–${scientific(contrast?.fold_change_ci_high)}`} /><Metric label="adjusted p" value={scientific(contrast?.p_adjusted_family)} /><Metric label="biological n" value={result.calculation.groups.map((group) => `${group.groupId} ${group.biologicalN}`).join(" · ")} /></div><ResultsTable samples={result.calculation.samples} /></> : <EmptyState text={t.empty} onDemo={loadDemo} label={t.demo} />}
          </section>}

          {step === 5 && <section className="panel figure-panel">
            <div className="section-intro"><span className="section-number">06</span><div><h2>{t.figureTitle}</h2><p>90 mm · Helvetica · 6.5 pt · editable SVG/PDF</p></div></div>
            <div className="figure-toolbar"><label><span>{locale === "zh-CN" ? "图形类型" : "Plot type"}</span><select value={figureType} onChange={(event) => setFigureType(event.target.value as FigureType)}><option value="dot">Dot + 95% CI</option><option value="box">Box + points</option><option value="violin">Violin + points</option>{experiment?.design === "paired_two_group" && <option value="paired">Paired</option>}{experiment?.design === "repeated_time" && <option value="time">Time course</option>}{(experiment?.targetGenes.length ?? 0) > 1 && <option value="heatmap">Heatmap</option>}</select><ChevronDown size={14} /></label><button className="quiet-button" onClick={runAnalysis} disabled={busy || !experiment}>{locale === "zh-CN" ? "按新参数生成版本" : "Generate new version"}</button></div>
            {svgUrl ? <div className="figure-canvas"><Image src={svgUrl} width={640} height={500} unoptimized alt={locale === "zh-CN" ? "R 生成的相对表达量图" : "R-generated relative expression plot"} /></div> : <EmptyState text={locale === "zh-CN" ? "先运行分析以生成 R 科研图。" : "Run the analysis to generate an R figure."} onDemo={runAnalysis} label={t.run} />}
          </section>}

          {step === 6 && <section className="panel">
            <div className="section-intro"><span className="section-number">07</span><div><h2>{t.exportTitle}</h2><p>{locale === "zh-CN" ? "原始/清洗数据、QC、计算链、统计、四种图形格式、R 脚本、sessionInfo、图注、Methods 与校验清单。" : "Raw/clean data, QC, calculations, statistics, four figure formats, R script, sessionInfo, legend, Methods and checksums."}</p></div></div>
            <div className="export-box"><Download size={26} /><div><h3>qpcr-research-package.zip</h3><p>{job?.expiresAt ? `${locale === "zh-CN" ? "游客下载有效至" : "Guest download expires"} ${new Date(job.expiresAt).toLocaleString(locale)}` : locale === "zh-CN" ? "登录项目由私有存储保留。" : "Signed-in artifacts use private storage."}</p></div><button className="primary-button" onClick={downloadExport} disabled={!job || busy}>{busy ? t.running : t.export}</button></div>
          </section>}

          {message && <div className="status-message" role="status">{message}</div>}
          {experiment && <div className="dataset-status"><span className="status-dot" />{experiment.wells.length} {t.wells} · {new Set(experiment.wells.map((well) => well.sampleId)).size} n · {experiment.targetGenes.length} gene</div>}
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
