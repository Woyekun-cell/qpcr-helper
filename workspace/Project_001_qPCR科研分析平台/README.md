# qPCR 科研分析平台

输入逐孔 Ct/Cq，完成透明 QC、2^-ΔΔCt、实验设计驱动多重比较、可配置 CI 与 R-only 出版级科研绘图。

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

访问 `http://localhost:3000`，可载入八倍表达演示。测试：`pnpm test && pnpm typecheck && pnpm lint && pnpm check:contrast && pnpm check:responsive && pnpm build`；启动两服务后运行 `pnpm e2e:local`。

## 部署

- Vercel：Root Directory 设为 `workspace/Project_001_qPCR科研分析平台/apps/web`，开启外部源码访问；配置 Supabase 与 R 服务环境变量。
- Render：Blueprint Path 设为 `workspace/Project_001_qPCR科研分析平台/services/analysis-r/render.yaml`；把生成的共享密钥同步到 Vercel。
- Supabase：执行 `supabase/migrations`；确认私有 `analysis-artifacts` bucket 与 RLS 生效；在 Auth URL Configuration 中加入生产地址 `https://<域名>/auth/callback` 和本地地址 `http://localhost:3000/auth/callback`。

未提供 Supabase、Vercel、Render 凭据时，代码可本地完整运行，但不会自动创建线上资源。
