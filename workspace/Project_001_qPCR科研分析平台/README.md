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

## 部署

- Vercel：Root Directory 为 `workspace/Project_001_qPCR科研分析平台/apps/web`，配置 Supabase 与 R 环境变量。
- Render：Blueprint Path 为 `workspace/Project_001_qPCR科研分析平台/services/analysis-r/render.yaml`，共享密钥同步到 Vercel。
- Supabase：执行迁移，确认私有 bucket、RLS、生产及本地 Auth callback。

无云端凭据时可本地运行，不自动创建线上资源。
