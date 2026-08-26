# qPCR Helper

输入逐孔 Ct/Cq，完成透明 QC、2^-ΔΔCt、设计驱动统计与 R-only 科研图。

## 目录

- `apps/web`：Next.js 界面与 API。
- `packages/contracts`：共享数据契约、校验与 TypeScript 计算核心。
- `services/analysis-r`：R 统计、绘图与导出。
- `supabase`：数据库迁移、RLS 与 Storage 策略。

## 科研边界

仅用于研究，不用于临床诊断。使用者仍需验证扩增效率、内参稳定性和实验设计。

## 本地运行

要求 Node 24、pnpm 11、R 4.4+。先复制 `.env.example` 为 `.env.local`，设置同一 `ANALYSIS_R_SHARED_SECRET`。

```bash
pnpm install
Rscript services/analysis-r/install.R
cd services/analysis-r && Rscript run.R
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
