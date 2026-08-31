# qPCR Helper 视觉 QA

## 参考与实现

- 视觉参考：第 2 张“数据与图并排”稿，暖象牙背景、墨黑文字、苔绿主色、珊瑚强调、薄边框、小圆角。
- 参考图：`/Users/woyekun/.codex/generated_images/01a02de9-f47c-7d52-b375-b17f96a66c34/exec-55e8aa50-c934-4ed8-ab91-771163278463.png`（1487 × 1058）。
- 实现截图：`.audit-ui/04-final.png`（1280 × 720，浏览器当前视口；长分组名修订后）；`.audit-ui/05-multi-group-color.png`（多基因柱状图，验证组别色彩跨面板稳定）；`.audit-ui/06-live-after-tight.png`（修复留白后的实时结果页）；`.audit-ui/07-module-data.png` 至 `.audit-ui/11-module-export.png`（模块级证据）。
- 对照图：`/tmp/qpcr-helper-option2-comparison.png`（两张图按列缩放到统一高度，用于结构检查，不作为像素级相似度结论）。

## 验收状态

- 状态：演示项目“八倍表达演示”，已完成分析，结果区显示计算后的表达量，图形区为柱状图叠加样本点，右侧为图形设置。
- 交互：输入/CSV/XLSX 分析后自动滚动并聚焦“数据与图”；右侧图形类型、颜色、点形状、点大小、画布尺寸、格式和 DPI 变化即时进入预览。
- 数据：Ct 表格序列化保留配对 ID、时间、因素、批次、孔状态等元数据；统计设置修改会清除旧结果并提示重新运行。
- 响应式：宽屏为结果与图形并排；861–1120 px 折叠为单列；≤860 px 图形设置移动到画布下方；无结果时使用紧凑空态。
- 科研表达：图中保留独立样本点、细描边、细误差线、显著性标记区域；结果以相对表达量表格直接可读。

## Findings

- P0：无。
- P1：无。输入分析后的自动跳转和结果渲染已验证；全量 metadata round-trip 已覆盖测试。
- P2：已修复。窄屏三列挤压、无结果大面积空白、统计设置改变后旧 CI 仍显示等问题均已处理。
- P2：已修复。图形预览曾被固定高度约束，造成 SVG 上下 letterbox 留白；现在使用固有比例和自适应画布，图形截图已单独裁剪。
- P3：已处理。结果区加入键盘焦点；自动滚动尊重 `prefers-reduced-motion`。
- 剩余差异：实现截图展示的是用户要求的“分析后结果态”，参考稿展示的是“原始 Ct + 图形态”；两者信息状态不同但布局方向一致。截图视口也不同，因此不做像素级相似度判定。

## 验证

- 测试：web 58 passed、3 skipped；contracts 18 passed；远端统计测试 6 passed；R figure tests passed。
- 构建：Next.js production build passed；TypeScript、ESLint、对比度、响应式检查和 `git diff --check` passed。
- E2E：`foldChange ≈ 8`、游客令牌隔离、错误令牌拒绝、原始请求不暴露均 passed。
- 说明：`docs/module-guide.md` 提供数据录入、统计选择、结果、图形工作台和下载的中英文图文说明。

final result: passed
