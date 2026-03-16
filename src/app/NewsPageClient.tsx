"use client";

import { useState } from "react";
import type { DailyNews } from "@/types";
import ArticleCard from "@/components/ArticleCard";

interface Props {
  initialNews: DailyNews | null;
}

export default function NewsPageClient({ initialNews }: Props) {
  const [news] = useState<DailyNews | null>(initialNews);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00+09:00");
    return d.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    });
  };

  return (
    <div className="container">
      <section className="hero">
        <div className="hero-badge">🌅 毎朝7:00自動更新（完全無料版）</div>
        <h1>Today&apos;s News in English</h1>
        <p>
          最新ニュースを英検準1級レベルの英語で読んで、
          受験英語力をアップしよう！
        </p>
      </section>

      {news ? (
        <>
          <div style={{ textAlign: "center", marginBottom: "28px" }}>
            <span style={{ color: "var(--color-text-muted)", fontSize: "14px" }}>
              📅 {formatDate(news.date)}
            </span>
          </div>

          <div className="articles-grid">
            {news.articles.map((article, i) => (
              <ArticleCard key={i} article={article} index={i} />
            ))}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <div className="icon">📰</div>
          <h3>まだニュースがありません</h3>
          <p>
            GitHub Actions による最初の自動更新を待つか、
            ローカルで `npm run update-news` を実行してください。
          </p>
        </div>
      )}
    </div>
  );
}
