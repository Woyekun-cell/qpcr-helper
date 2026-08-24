import type { CtWell, ExperimentInput } from "@qpcr/contracts";

type Locale = ExperimentInput["locale"];

export type ExampleId =
  | "independent_eight_fold"
  | "paired_response"
  | "dose_response"
  | "factorial_interaction"
  | "time_course"
  | "multi_gene";

export type ExampleFigureType = "bar" | "dot" | "violin_box" | "paired" | "time" | "heatmap";

interface LocalizedText {
  "zh-CN": string;
  en: string;
}

export interface ExampleCatalogItem {
  id: ExampleId;
  figureType: ExampleFigureType;
  label: LocalizedText;
  description: LocalizedText;
}

export const exampleCatalog: readonly ExampleCatalogItem[] = [
  {
    id: "independent_eight_fold",
    figureType: "bar",
    label: { "zh-CN": "独立两组 · 8 倍表达", en: "Independent groups · 8-fold" },
    description: { "zh-CN": "Welch t 检验；已知 2^-ΔΔCt = 8。", en: "Welch t test; known 2^-ΔΔCt = 8." }
  },
  {
    id: "paired_response",
    figureType: "paired",
    label: { "zh-CN": "配对设计 · 干预前后", en: "Paired · before and after" },
    description: { "zh-CN": "同一受试者配对连线与配对检验。", en: "Within-subject links and paired testing." }
  },
  {
    id: "dose_response",
    figureType: "bar",
    label: { "zh-CN": "单因素 · 剂量反应", en: "One-way · dose response" },
    description: { "zh-CN": "对照、低剂量和高剂量多重比较。", en: "Control, low-dose and high-dose comparisons." }
  },
  {
    id: "factorial_interaction",
    figureType: "bar",
    label: { "zh-CN": "两因素 · 处理×时间", en: "Two-way · treatment × time" },
    description: { "zh-CN": "完整析因组合，演示主效应和交互。", en: "Complete factorial cells for main effects and interaction." }
  },
  {
    id: "time_course",
    figureType: "time",
    label: { "zh-CN": "重复测量 · 时间曲线", en: "Repeated measures · time course" },
    description: { "zh-CN": "受试者随机截距的组别×时间分析。", en: "Group × time analysis with subject random intercept." }
  },
  {
    id: "multi_gene",
    figureType: "heatmap",
    label: { "zh-CN": "多基因 · 表达谱热图", en: "Multi-gene · expression heatmap" },
    description: { "zh-CN": "IL6、TNF、CXCL8 的差异表达模式。", en: "Contrasting IL6, TNF and CXCL8 expression patterns." }
  }
];

interface AnalysisUnit {
  sampleId: string;
  biologicalReplicateId?: string;
  groupId: string;
  referenceCt: number;
  deltaCt: Record<string, number>;
  subjectId?: string;
  factorA?: string;
  factorB?: string;
  time?: number;
}

function wellsForUnit(unit: AnalysisUnit, referenceGene: string): CtWell[] {
  const metadata = {
    ...(unit.subjectId ? { subjectId: unit.subjectId } : {}),
    ...(unit.factorA ? { factorA: unit.factorA } : {}),
    ...(unit.factorB ? { factorB: unit.factorB } : {}),
    ...(unit.time === undefined ? {} : { time: unit.time })
  };
  const common = {
    sampleId: unit.sampleId,
    biologicalReplicateId: unit.biologicalReplicateId ?? unit.sampleId,
    groupId: unit.groupId,
    status: "accepted" as const,
    ...metadata
  };
  const targets = Object.entries(unit.deltaCt).flatMap(([gene, deltaCt]) =>
    [1, 2].map((replicate): CtWell => ({
      ...common,
      wellId: `${unit.sampleId}-${gene}-T${replicate}`,
      technicalReplicateId: String(replicate),
      gene,
      geneRole: "target",
      ct: unit.referenceCt + deltaCt + (replicate === 1 ? -0.05 : 0.05)
    }))
  );
  const references = [1, 2].map((replicate): CtWell => ({
    ...common,
    wellId: `${unit.sampleId}-${referenceGene}-R${replicate}`,
    technicalReplicateId: String(replicate),
    gene: referenceGene,
    geneRole: "reference",
    ct: unit.referenceCt + (replicate === 1 ? -0.04 : 0.04)
  }));
  return [...targets, ...references];
}

function experiment(
  id: ExampleId,
  locale: Locale,
  input: Omit<ExperimentInput, "projectId" | "locale" | "wells"> & { units: AnalysisUnit[] }
): ExperimentInput {
  const { units, ...metadata } = input;
  return {
    ...metadata,
    projectId: crypto.randomUUID(),
    locale,
    wells: units.flatMap((unit) => wellsForUnit(unit, metadata.referenceGene)).map((well) => ({
      ...well,
      plateId: `EXAMPLE-${id}`
    }))
  };
}

function independentExample(locale: Locale): ExperimentInput {
  const control = [5, 5.2, 4.8];
  const treated = [2, 2.1, 1.9];
  return experiment("independent_eight_fold", locale, {
    name: locale === "zh-CN" ? "八倍表达演示" : "Eight-fold expression demo",
    referenceGene: "GAPDH",
    targetGenes: ["GENE1"],
    design: "independent_two_group",
    groups: [
      { id: "control", name: locale === "zh-CN" ? "对照" : "Control", isCalibrator: true },
      { id: "treated", name: locale === "zh-CN" ? "处理" : "Treatment", isCalibrator: false }
    ],
    units: [
      ...control.map((deltaCt, index) => ({ sampleId: `C${index + 1}`, groupId: "control", referenceCt: 20 + index * 0.1, deltaCt: { GENE1: deltaCt } })),
      ...treated.map((deltaCt, index) => ({ sampleId: `T${index + 1}`, groupId: "treated", referenceCt: 20.2 + index * 0.1, deltaCt: { GENE1: deltaCt } }))
    ]
  });
}

function pairedExample(locale: Locale): ExperimentInput {
  const before = [5, 5.2, 4.9, 5.1, 4.8, 5.3];
  const response = [1.7, 1.8, 1.9, 2.1, 2.2, 2.3];
  return experiment("paired_response", locale, {
    name: locale === "zh-CN" ? "配对干预前后演示" : "Paired before-after demo",
    referenceGene: "β-actin",
    targetGenes: ["GENE1"],
    design: "paired_two_group",
    groups: [
      { id: "before", name: locale === "zh-CN" ? "干预前" : "Before", isCalibrator: true },
      { id: "after", name: locale === "zh-CN" ? "干预后" : "After", isCalibrator: false }
    ],
    units: before.flatMap((deltaCt, index) => {
      const subjectId = `S${index + 1}`;
      return [
        { sampleId: `${subjectId}-B`, biologicalReplicateId: `${subjectId}-B`, subjectId, groupId: "before", referenceCt: 20 + index * 0.08, deltaCt: { GENE1: deltaCt } },
        { sampleId: `${subjectId}-A`, biologicalReplicateId: `${subjectId}-A`, subjectId, groupId: "after", referenceCt: 20.15 + index * 0.08, deltaCt: { GENE1: deltaCt - response[index]! } }
      ];
    })
  });
}

function doseResponseExample(locale: Locale): ExperimentInput {
  const levels = [
    { groupId: "control", values: [5, 5.1, 4.9, 5.2] },
    { groupId: "low", values: [4.2, 4.1, 4.3, 4] },
    { groupId: "high", values: [2.2, 2.1, 2.3, 2] }
  ];
  return experiment("dose_response", locale, {
    name: locale === "zh-CN" ? "剂量反应演示" : "Dose-response demo",
    referenceGene: "GAPDH",
    targetGenes: ["GENE1"],
    design: "one_way",
    groups: [
      { id: "control", name: locale === "zh-CN" ? "对照" : "Control", isCalibrator: true },
      { id: "low", name: locale === "zh-CN" ? "低剂量" : "Low dose", isCalibrator: false },
      { id: "high", name: locale === "zh-CN" ? "高剂量" : "High dose", isCalibrator: false }
    ],
    units: levels.flatMap(({ groupId, values }) => values.map((deltaCt, index) => ({
      sampleId: `${groupId}-${index + 1}`,
      groupId,
      referenceCt: 19.8 + index * 0.1,
      deltaCt: { GENE1: deltaCt }
    })))
  });
}

function factorialExample(locale: Locale): ExperimentInput {
  const noise = [-0.1, 0.05, 0.08, -0.03];
  const cells = [
    { groupId: "vehicle_early", factorA: "vehicle", factorB: "early", deltaCt: 5 },
    { groupId: "vehicle_late", factorA: "vehicle", factorB: "late", deltaCt: 4.6 },
    { groupId: "drug_early", factorA: "drug", factorB: "early", deltaCt: 4.2 },
    { groupId: "drug_late", factorA: "drug", factorB: "late", deltaCt: 2.8 }
  ];
  return experiment("factorial_interaction", locale, {
    name: locale === "zh-CN" ? "处理与时间析因演示" : "Treatment by time factorial demo",
    referenceGene: "RPLP0",
    targetGenes: ["GENE1"],
    design: "two_way",
    groups: cells.map((cell, index) => ({
      id: cell.groupId,
      name: cell.groupId.replace("_", " × "),
      isCalibrator: index === 0
    })),
    units: cells.flatMap((cell) => noise.map((offset, index) => ({
      sampleId: `${cell.groupId}-${index + 1}`,
      groupId: cell.groupId,
      factorA: cell.factorA,
      factorB: cell.factorB,
      referenceCt: 20.1 + index * 0.07,
      deltaCt: { GENE1: cell.deltaCt + offset }
    })))
  });
}

function timeCourseExample(locale: Locale): ExperimentInput {
  const times = [0, 6, 24];
  const groups = ["control", "treated"] as const;
  return experiment("time_course", locale, {
    name: locale === "zh-CN" ? "重复测量时间曲线演示" : "Repeated-measures time-course demo",
    referenceGene: "GAPDH",
    targetGenes: ["GENE1"],
    design: "repeated_time",
    groups: [
      { id: "control", name: locale === "zh-CN" ? "对照" : "Control", isCalibrator: true },
      { id: "treated", name: locale === "zh-CN" ? "处理" : "Treatment", isCalibrator: false }
    ],
    units: groups.flatMap((groupId) => [1, 2, 3, 4].flatMap((subjectNumber) => {
      const subjectId = `${groupId === "control" ? "C" : "T"}${subjectNumber}`;
      const subjectOffset = [-0.12, 0.04, 0.11, -0.03][subjectNumber - 1]!;
      return times.map((time) => {
        const timeIndex = times.indexOf(time);
        const shift = groupId === "control" ? [0, 0.2, 0.4][timeIndex]! : [0, 0.8, 1.8][timeIndex]!;
        return {
          sampleId: `${subjectId}-t${time}`,
          biologicalReplicateId: subjectId,
          subjectId,
          groupId,
          time,
          referenceCt: 20 + subjectNumber * 0.06 + timeIndex * 0.03,
          deltaCt: { GENE1: 5 + subjectOffset - shift }
        };
      });
    }))
  });
}

function multiGeneExample(locale: Locale): ExperimentInput {
  const genes = ["IL6", "TNF", "CXCL8"];
  const base = { IL6: 5, TNF: 6, CXCL8: 7 };
  const shifts = { IL6: -3, TNF: -1.5, CXCL8: 0.8 };
  const noise = [-0.12, 0.04, 0.11, -0.03];
  return experiment("multi_gene", locale, {
    name: locale === "zh-CN" ? "多基因表达谱演示" : "Multi-gene expression profile demo",
    referenceGene: "GAPDH",
    targetGenes: genes,
    design: "independent_two_group",
    groups: [
      { id: "control", name: locale === "zh-CN" ? "对照" : "Control", isCalibrator: true },
      { id: "treated", name: locale === "zh-CN" ? "处理" : "Treatment", isCalibrator: false }
    ],
    units: ["control", "treated"].flatMap((groupId) => noise.map((offset, index) => ({
      sampleId: `${groupId === "control" ? "C" : "T"}${index + 1}`,
      groupId,
      referenceCt: 20 + index * 0.08,
      deltaCt: Object.fromEntries(genes.map((gene) => [
        gene,
        base[gene as keyof typeof base] + offset + (groupId === "treated" ? shifts[gene as keyof typeof shifts] : 0)
      ]))
    })))
  });
}

export function createExampleExperiment(id: ExampleId, locale: Locale = "zh-CN"): ExperimentInput {
  switch (id) {
    case "independent_eight_fold": return independentExample(locale);
    case "paired_response": return pairedExample(locale);
    case "dose_response": return doseResponseExample(locale);
    case "factorial_interaction": return factorialExample(locale);
    case "time_course": return timeCourseExample(locale);
    case "multi_gene": return multiGeneExample(locale);
  }
}

export function createDemoExperiment(locale: Locale = "zh-CN"): ExperimentInput {
  return createExampleExperiment("independent_eight_fold", locale);
}
