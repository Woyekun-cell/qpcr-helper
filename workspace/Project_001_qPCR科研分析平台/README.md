# qPCR Helper

一个面向科研人员的 qPCR 分析与投稿级绘图工具：输入逐孔 Ct/Cq，自动完成技术重复汇总、2^-ΔΔCt 表达量计算、设计驱动统计推荐和 R 绘图。支持柱状图叠加样本点、散点图、小提琴+箱线图、配对/时间曲线与 ComplexHeatmap 热图，并可直接导出 SVG、PDF、PNG、TIFF。

在线演示：<https://qpcr-helper-web-production.up.railway.app>

项目范围刻意保持清晰：技术重复先做 QC 和汇总，统计 n 只计算生物学重复；结果保留逐步计算链、QC 记录和可复现参数。内置独立两组、配对、单因素、两因素、重复测量和多基因示例，便于快速了解工作方式。

## 目录

- `apps/web`：Next.js 界面与 API。
- `packages/contracts`：共享数据契约、校验与 TypeScript 计算核心。
- `services/analysis-r`：R 统计、绘图与导出。
- `supabase`：数据库迁移、RLS 与 Storage 策略。

## 科研边界

仅用于研究，不用于临床诊断。使用者仍需验证扩增效率、内参稳定性和实验设计。

## 本地运行

要求 Node 24、pnpm 11、R 4.4+。先将 `.env.example` 复制为 `apps/web/.env.local`，设置同一 `ANALYSIS_R_SHARED_SECRET`；开发环境需同时运行 Web 与 R 服务。

```bash
pnpm install
Rscript services/analysis-r/install.R
ANALYSIS_R_SHARED_SECRET=qpcr-helper-local-dev PORT=8787 HOST=127.0.0.1 Rscript services/analysis-r/run.R
# 另开终端
pnpm dev
```

访问 `http://localhost:3000`，内置独立、配对、单因素、两因素、时间序列、多基因六组合成示例。验证：`pnpm test && pnpm typecheck && pnpm lint && pnpm check:contrast && pnpm check:responsive && pnpm build`；双服务启动后运行 `pnpm e2e:local`。

## 对话式远程分析

AI 先把用户上传或粘贴的数据整理为 Helper 标准 JSON；统计与绘图仍由生产站点完成。连接器支持文件或标准输入：

```bash
pnpm analyze:remote -- --input request.json --output result --formats svg,pdf,png --package
pnpm analyze:remote -- --input - --output result --formats svg < request.json
```

输出 `analysis-result.json`、指定格式图和可选科研包。游客能力令牌不会写入磁盘。生产站点：<https://qpcr-helper-web-production.up.railway.app>。

## 部署

- Railway：Web 与 R 为独立服务，通过私网地址和共享密钥通信；公开域名只暴露 Web。
- Supabase：执行迁移，确认私有 bucket、RLS、生产及本地 Auth callback。

无云端凭据时可本地运行，不自动创建线上资源。
