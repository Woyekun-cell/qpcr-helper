import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "qPCR Helper · qPCR analysis and publication figures",
  description: "Auditable 2^-ΔΔCt analysis, design-aware statistics and R-only publication figures."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
