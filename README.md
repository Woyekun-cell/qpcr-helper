# qPCR Helper

Turn well-level Ct/Cq values into `2^-ΔΔCt` expression results and publication-ready figures in one pass. Choose a reference gene, experimental design and group labels, then review the suggested statistics before exporting.

把逐孔 Ct/Cq 值整理成 `2^-ΔΔCt` 表达量和投稿级图形。选择内参、实验设计与分组后，先查看统计建议，再导出需要的图形。

![qPCR Helper 精准图形预览](.audit-ui/10-module-figure.png)

A short tour of every module, with matching English and Chinese explanations, is in [`docs/module-guide.md`](docs/module-guide.md).

各模块的截图和中英文说明见 [`docs/module-guide.md`](docs/module-guide.md)。

## Features / 功能

- Publication-ready bar-plus-points, dot, violin-plus-box, paired and time-course plots.
  柱状图叠加样本点、散点图、小提琴叠加箱线图、配对图和时间曲线。
- Multi-gene expression heatmaps rendered with ComplexHeatmap.
  使用 ComplexHeatmap 绘制多基因表达热图。
- Welch and paired t tests, ANOVA + Tukey, Dunnett, Holm and BH-FDR options.
  支持 Welch、配对 t 检验、ANOVA + Tukey、Dunnett、Holm 和 BH-FDR。
- Live controls for point size, point shape, group colors, figure dimensions and significance labels.
  点大小、点形状、分组颜色、画布尺寸和显著性标注都可即时调整。
- Direct SVG, PDF, PNG and TIFF downloads; a full research package is optional.
  可直接下载 SVG、PDF、PNG 和 TIFF，完整科研包按需选择。
- Built-in demos for independent, paired, one-way, two-way, repeated-measures and multi-gene designs.
  内置独立两组、配对、单因素、两因素、重复测量和多基因示例。

Technical replicates are checked and aggregated before statistical testing; `n` counts biological replicates only. This tool is for research analysis, not clinical diagnosis. Before submission, review amplification efficiency, reference-gene stability and the experimental design.

技术重复先做 QC 和汇总，统计 `n` 只计算生物学重复。本工具用于科研分析，不用于临床诊断；正式投稿前请结合扩增效率、内参稳定性和实验设计复核结果。

## Run online / 在线使用

Open the hosted app at <https://qpcr-helper-web-production.up.railway.app>.

打开在线版本：<https://qpcr-helper-web-production.up.railway.app>。

## Run locally / 本地运行

Requirements: Node 24, pnpm 11 and R 4.4 or later.

环境要求：Node 24、pnpm 11 和 R 4.4 或更高版本。

```bash
pnpm install
Rscript services/analysis-r/install.R
ANALYSIS_R_SHARED_SECRET=qpcr-helper-local-dev PORT=8787 HOST=127.0.0.1 Rscript services/analysis-r/run.R
# open another terminal / 另开终端
pnpm dev
```

Visit `http://localhost:3000` after the dev server starts.

开发服务器启动后访问 `http://localhost:3000`。

```bash
pnpm test
pnpm typecheck
pnpm lint
Rscript services/analysis-r/tests/test_figures.R
```

## Project layout / 项目结构

- `apps/web` — Next.js interface and API.
  Next.js 界面与 API。
- `packages/contracts` — shared schemas and calculation core.
  共享数据契约与计算核心。
- `services/analysis-r` — statistics, figures and exports.
  统计、绘图与导出服务。
- `supabase` — database migrations, RLS and Storage policies.
  数据库迁移、RLS 与 Storage 策略。

## Chat-based analysis / 对话式分析

Pass the normalized JSON from a chat workflow to Helper with one command.

可以把聊天中整理好的标准 JSON 一键交给 Helper 分析。

```bash
pnpm analyze:remote -- --input request.json --output result --formats svg,pdf,png --package
```

The command writes result tables and figures without persisting the guest capability token.

命令会输出结果表和图形，不会把游客能力令牌写入磁盘。
