import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DRIVE AI",
  description: "AI 드라이브 코스 추천 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
