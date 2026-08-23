# qPCR 科研分析平台

输入逐孔 Ct/Cq，完成透明 QC、2^-ΔΔCt、实验设计驱动多重比较与 R-only 出版级科研绘图。

## 目录

- `apps/web`：Next.js 产品界面与浏览器 API。
- `packages/contracts`：共享数据契约、校验与 TypeScript 计算核心。
- `services/analysis-r`：R 统计、绘图、图注与导出。
- `supabase`：数据库迁移、RLS 与 Storage 策略。

## 科研边界

本软件用于研究数据分析，不用于临床诊断。2^-ΔΔCt 依赖相应实验假设；使用者仍需验证扩增效率、内参稳定性和实验设计。

## 本地运行

要求 Node 24、pnpm 11、R 4.4+。先复制 `.env.example` 为 `.env.local`，设置同一 `ANALYSIS_R_SHARED_SECRET`。

```bash
pnpm install
Rscript services/analysis-r/install.R
cd services/analysis-r && Rscript run.R
pnpm dev
```

访问 `http://localhost:3000`，可直接载入八倍表达演示。测试：`pnpm test && pnpm typecheck && pnpm build`；R 测试位于 `services/analysis-r/tests`。

## 部署

- Vercel：项目根目录设为本目录；构建命令 `pnpm build`，配置 Supabase 与 R 服务环境变量。
- Render：使用 `services/analysis-r/render.yaml`；把生成的共享密钥同步到 Vercel。
- Supabase：执行 `supabase/migrations`；确认私有 `analysis-artifacts` bucket 与 RLS 生效。

未提供 Supabase、Vercel、Render 凭据时，代码可本地完整运行，但不会自动创建线上资源。
