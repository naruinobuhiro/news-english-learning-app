/**
 * Yahoo! ニュース RSS からトップ記事を取得するモジュール
 *
 * RSS フィード: https://news.yahoo.co.jp/rss/topics/top-picks.xml
 * ローカル開発向けにモックデータも用意しています。
 */

import type { NewsArticle } from "@/types";

const RSS_URL = "https://news.yahoo.co.jp/rss/topics/top-picks.xml";

/** RSS フィードを取得してパースする */
export async function fetchYahooNews(): Promise<NewsArticle[]> {
  // ローカルでRSSパーサーが使えない場合はモックを返す
  if (!process.env.KV_REST_API_URL && process.env.NODE_ENV === "development") {
    return getMockNews();
  }

  try {
    const res = await fetch(RSS_URL, {
      next: { revalidate: 0 }, // キャッシュしない
      headers: { "User-Agent": "Mozilla/5.0 NewsEnglishLearningApp/1.0" },
    });
    const text = await res.text();
    return parseRSS(text);
  } catch (err) {
    console.error("RSS取得エラー:", err);
    return getMockNews();
  }
}

/** シンプルな RSS XML パーサー（rss-parserはサーバーサイドのみ使用可能なため） */
function parseRSS(xml: string): NewsArticle[] {
  const items: NewsArticle[] = [];

  // <item> ブロックを全て取得
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];

  for (const item of itemMatches.slice(0, 20)) {
    const title = extractTag(item, "title");
    const link = extractTag(item, "link");
    const description = extractTag(item, "description");
    const pubDate = extractTag(item, "pubDate");

    if (title && link) {
      items.push({
        title: stripCDATA(title),
        link: link.trim(),
        description: stripHTML(stripCDATA(description ?? "")),
        pubDate: pubDate?.trim() ?? "",
      });
    }
  }

  return items;
}

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? match[1] : null;
}

function stripCDATA(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function stripHTML(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").trim();
}

/** ランダムに n 件取得 */
export function selectRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

/** 開発用モックニュース */
function getMockNews(): NewsArticle[] {
  return [
    {
      title: "日本政府、AI規制の新法案を閣議決定",
      link: "https://news.yahoo.co.jp/articles/mock1",
      description:
        "政府は人工知能（AI）の開発・利用に関する規制を定める新たな法案を閣議決定した。法案はAIの安全性確保と国際競争力の維持を目的としている。",
      pubDate: new Date().toUTCString(),
    },
    {
      title: "東京都知事、2035年までにカーボンニュートラル達成を宣言",
      link: "https://news.yahoo.co.jp/articles/mock2",
      description:
        "東京都の小池知事は定例記者会見で、2035年までに都内の温室効果ガス排出量を実質ゼロにするカーボンニュートラルを達成する目標を改めて確認した。",
      pubDate: new Date().toUTCString(),
    },
    {
      title: "円安進行、1ドル155円台に　輸入コスト上昇が懸念",
      link: "https://news.yahoo.co.jp/articles/mock3",
      description:
        "東京外国為替市場で円相場が一時1ドル=155円台に下落し、輸入コストの上昇による物価高騰への影響が懸念されている。日銀の金融政策の行方に注目が集まっている。",
      pubDate: new Date().toUTCString(),
    },
  ];
}
