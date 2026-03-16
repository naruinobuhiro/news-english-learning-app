/**
 * 静的 JSON ファイル (public/data/archive.json) からデータを取得するユーティリティ
 */

import type { DailyNews } from "@/types";

const DATA_URL = "/data/archive.json";

/** JSON ファイルから全てのニュース（最大7日分）を取得 */
export async function getArchive(): Promise<DailyNews[]> {
  // サーバーサイド（ビルド時）はファイルを直接読み込む
  if (typeof window === "undefined") {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const filePath = path.join(process.cwd(), "public", "data", "archive.json");
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(data);
      }
    } catch (err) {
      console.error("サーバーサイドでのデータ読み込みエラー:", err);
    }
    return [];
  }

  // クライアントサイドは fetch を使用
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("クライアントサイドでのアーカイブ取得エラー:", err);
    return [];
  }
}

/** 指定日付の DailyNews を取得 */
export async function getDailyNews(date: string): Promise<DailyNews | null> {
  const archive = await getArchive();
  return archive.find(d => d.date === date) ?? null;
}

/** 最新（今日）のニュースを取得 */
export async function getLatestNews(): Promise<DailyNews | null> {
  const archive = await getArchive();
  return archive.length > 0 ? archive[0] : null;
}

/** 今日の日付キーを取得 (YYYY-MM-DD) */
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
