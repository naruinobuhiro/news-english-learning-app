"use client";

import { useState, useEffect } from "react";
import type { DailyNews } from "@/types";
import { getArchive } from "@/lib/storage";
import ArticleCard from "@/components/ArticleCard";

export default function ArchivePage() {
  const [archive, setArchive] = useState<DailyNews[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArchive = async () => {
      const data = await getArchive();
      setArchive(data);
      if (data.length > 0) {
        setSelectedDate(data[0].date);
      }
      setLoading(false);
    };
    fetchArchive();
  }, []);

  const selectedNews = archive.find((n) => n.date === selectedDate);
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00+09:00");
    return d.toLocaleDateString("ja-JP", { month: "short", day: "numeric", weekday: "short" });
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: "80px 24px", textAlign: "center" }}>
        <p style={{ color: "var(--color-text-muted)" }}>アーカイブを読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="container">
      <section className="hero" style={{ paddingBottom: "16px" }}>
        <h1 style={{ fontSize: "32px" }}>📅 アーカイブ</h1>
        <p>過去7日間のニュース英訳をいつでも振り返れます。</p>
      </section>

      {archive.length > 0 ? (
        <>
          <div className="date-bar">
            {archive.map((item) => (
              <button
                key={item.date}
                className={`date-chip ${selectedDate === item.date ? "selected" : ""}`}
                onClick={() => setSelectedDate(item.date)}
              >
                {formatDate(item.date)}
              </button>
            ))}
          </div>
          {selectedNews && (
            <div className="articles-grid">
              {selectedNews.articles.map((article, i) => (
                <ArticleCard key={i} article={article} index={i} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="empty-state">
          <div className="icon">📂</div>
          <h3>アーカイブはまだありません</h3>
        </div>
      )}
    </div>
  );
}
