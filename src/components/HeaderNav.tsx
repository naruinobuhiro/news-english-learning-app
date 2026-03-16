"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav className="header-nav">
      <Link
        href="/"
        className={`nav-link ${pathname === "/" ? "active" : ""}`}
      >
        🏠 今日のニュース
      </Link>
      <Link
        href="/archive"
        className={`nav-link ${pathname === "/archive" ? "active" : ""}`}
      >
        📅 アーカイブ
      </Link>
      <Link
        href="/cards"
        className={`nav-link ${pathname === "/cards" ? "active" : ""}`}
      >
        🃏 単語カード
      </Link>
    </nav>
  );
}
