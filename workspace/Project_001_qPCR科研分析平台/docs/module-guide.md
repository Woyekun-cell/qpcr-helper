# qPCR Helper 模块说明 / Module guide

下面的截图来自内置演示数据，展示从 Ct 输入到投稿图下载的完整路径。每个模块只做一件事，切换设置后图形会即时更新。

## 1. 数据录入 / Data input

![数据录入 / Data input](../.audit-ui/07-module-data.png)

中文：粘贴逐孔 Ct/Cq，或导入 CSV/XLSX。页面只保留基因名、重复数和分组三列摘要；内参单独标记，技术重复先汇总，统计 n 只按生物学重复计算。

English: Paste well-level Ct/Cq values or import CSV/XLSX. The compact table shows gene, replicate count and group; technical replicates are QC-checked before biological n is counted.

## 2. 统计选择 / Statistical choice

![统计选择 / Statistical choice](../.audit-ui/08-module-statistics.png)

中文：根据实验设计显示合适的方法。两组使用 Welch 或配对 t 检验；多组可选择 ANOVA + Tukey、Dunnett，或方差不齐时使用 Games–Howell。软件只推荐，不会悄悄替换你的选择。

English: Methods follow the design. Choose Welch/paired t tests for two groups, or ANOVA + Tukey, Dunnett, or Games–Howell for multi-group data. The recommendation is visible and never silently changes the method.

## 3. 结果 / Results

![计算结果 / Computed results](../.audit-ui/09-module-results-crop.png)

中文：结果卡直接显示 `2^-ΔΔCt` 表达倍数、置信区间、校正 p 值和每组生物学 n；下方表格列出各基因和分组的表达量，可继续编辑原始 Ct 后重算。

English: The result card reports `2^-ΔΔCt`, confidence interval, adjusted p value and biological n. The table keeps group-level fold changes visible and can be recomputed after editing Ct values.

## 4. 图形工作台 / Figure studio

![图形工作台 / Figure studio](../.audit-ui/10-module-figure.png)

中文：柱状图叠加独立点、散点图、小提琴叠加箱线图等均由 R/ggplot2 生成。分组颜色在多基因分面中保持一致，误差线、显著性标记、点形状和尺寸都能即时调整；预览按 SVG 固有比例显示，不再留出无意义的空白。

English: R/ggplot2 renders bar-plus-points, dot, and violin-plus-box plots. Group colors stay consistent across gene facets; error bars, significance labels, point shape and size update live. The preview keeps the SVG aspect ratio instead of letterboxing it.

## 5. 下载 / Download

![下载设置 / Download settings](../.audit-ui/11-module-export.png)

中文：直接选择 SVG、PDF、PNG 或 TIFF；位图可选 300/600 dpi。无需先下载整套科研包，图形文件可单独保存用于排版。

English: Download SVG, PDF, PNG or TIFF directly; raster formats offer 300/600 dpi. A full research package is optional, so one figure can be saved without downloading everything.
