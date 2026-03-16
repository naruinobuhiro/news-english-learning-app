import type { Metadata } from "next";
import Link from "next/link";
import HeaderNav from "@/components/HeaderNav";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ニュース英訳 for 受験生 | 毎朝更新",
    template: "%s | ニュース英訳 for 受験生",
  },
  description:
    "毎朝7時に最新ニュース3本を高校3年生・英検準1級レベルの英語に翻訳。重要表現・語彙カード・クイズで楽しく大学入試英語が学べます。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <header className="header">
          <div className="container">
            <div className="header-inner">
              <Link href="/" className="logo">
                <div className="logo-icon">📰</div>
                <div className="logo-text">
                  News<span>英訳</span>
                </div>
              </Link>
              <HeaderNav />
            </div>
          </div>
        </header>

        <main>{children}</main>

        <footer className="footer">
          <div className="container">
            © {new Date().getFullYear()} ニュース英訳 for 受験生 |
            毎朝 7:00 に自動更新 | 英検2級〜準1級対応
          </div>
        </footer>
      </body>
    </html>
  );
}
