# qPCR 科研分析平台

输入逐孔 Ct/Cq，完成透明 QC、2^-ΔΔCt、实验设计驱动多重比较与 R-only 出版级科研绘图。

## 目录

- `apps/web`：Next.js 产品界面与浏览器 API。
- `packages/contracts`：共享数据契约、校验与 TypeScript 计算核心。
- `services/analysis-r`：R 统计、绘图、图注与导出。
- `supabase`：数据库迁移、RLS 与 Storage 策略。

## 科研边界

本软件用于研究数据分析，不用于临床诊断。2^-ΔΔCt 依赖相应实验假设；使用者仍需验证扩增效率、内参稳定性和实验设计。

