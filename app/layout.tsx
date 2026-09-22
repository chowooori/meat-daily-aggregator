import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "일일 생산 집계",
  description:
    "택배 발송 엑셀로 당일 고기 제조 수량과 육회·육사시미 중량을 집계합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={plusJakarta.className}>{children}</body>
    </html>
  );
}
