/**
 * メインページ（今日のニュース）
 * 最新のニュースを静的 JSON から取得して表示します。
 */

import { getLatestNews } from "@/lib/storage";
import NewsPageClient from "./NewsPageClient";

export const dynamic = "force-static"; // 静的ページとして出力

export default async function HomePage() {
  const news = await getLatestNews();

  return <NewsPageClient initialNews={news} />;
}
