import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "爆款写手 | 体育内容 AI Agent",
  description: "从体育热点和内容链接快速生成经过事实核查的媒体内容。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
