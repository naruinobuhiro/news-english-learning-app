/**
 * ニュース取得スクリプト (scripts/fetch-news.mjs)
 * Yahoo RSS からニュースを取得し、public/data/raw-news.json に保存する。
 * Gemini API は一切呼ばない。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_NEWS_PATH = path.join(__dirname, '../public/data/raw-news.json');
const RSS_URL = "https://news.yahoo.co.jp/rss/topics/top-picks.xml";
const TARGET_COUNT = 3; // 取得する記事数

async function main() {
  console.log("📰 ニュース取得プロセスを開始します...");

  try {
    // 1. 既存の raw-news.json を読み込み
    let rawNews = [];
    try {
      if (fs.existsSync(RAW_NEWS_PATH)) {
        const content = fs.readFileSync(RAW_NEWS_PATH, 'utf-8');
        rawNews = content.trim() ? JSON.parse(content) : [];
      }
    } catch (e) {
      console.warn("⚠️ raw-news.json の読み込みに失敗。新規作成します:", e.message);
      rawNews = [];
    }

    // 2. 日付情報
    const now = new Date();
    const jstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const today = jstDate.toISOString().slice(0, 10);

    // 3. Yahoo RSS を取得
    console.log("🌐 Yahoo RSS フィードを取得中...");
    const res = await fetch(RSS_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!res.ok) {
      throw new Error(`RSS取得失敗: HTTP ${res.status}`);
    }

    const xml = await res.text();
    const allNews = parseRSS(xml);

    if (allNews.length === 0) {
      throw new Error("ニュースが取得できませんでした。");
    }

    console.log(`📋 ${allNews.length} 件のニュースを取得しました。`);

    // 4. 既存URLで重複チェック（同じ記事の再取得をスキップ）
    const existingLinks = new Set(rawNews.map(n => n.link));
    const newArticles = allNews.filter(a => !existingLinks.has(a.link));
    console.log(`🆕 新規記事: ${newArticles.length} 件（重複スキップ: ${allNews.length - newArticles.length} 件）`);

    if (newArticles.length === 0) {
      console.log("✅ 新しい記事はありません。処理を終了します。");
      return;
    }

    // 5. ランダムに TARGET_COUNT 件を選択
    const shuffled = newArticles.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, TARGET_COUNT);

    console.log(`📌 ${selected.length} 件の記事を処理対象として選択しました:`);
    selected.forEach((a, i) => console.log(`   ${i + 1}. ${a.title}`));

    // 6. raw-news.json に追加（status: "pending"）
    const newEntries = selected.map(article => ({
      id: `${today}_${generateId(article.link)}`,
      title: article.title,
      link: article.link,
      description: article.description,
      pubDate: article.pubDate,
      fetchedAt: new Date().toISOString(),
      date: today,
      status: "pending",
      retryCount: 0,
      translation: null,
    }));

    // 既存データに追加（最新が先頭、最大30件保持）
    rawNews = [...newEntries, ...rawNews].slice(0, 30);

    // 7. 保存
    // ディレクトリが存在しない場合は作成
    const dataDir = path.dirname(RAW_NEWS_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(RAW_NEWS_PATH, JSON.stringify(rawNews, null, 2));
    console.log(`✅ ${RAW_NEWS_PATH} を更新しました（全 ${rawNews.length} 件）。`);

  } catch (err) {
    console.error("❌ エラーが発生しました:", err);
    process.exit(1);
  }
}

// --- サポート関数 ---

function parseRSS(xml) {
  const items = [];
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  for (const item of itemMatches) {
    const title = extractTag(item, "title");
    const link = extractTag(item, "link");
    const description = extractTag(item, "description");
    const pubDate = extractTag(item, "pubDate");
    if (title && link) {
      items.push({
        title: stripCDATA(title),
        link: link.trim(),
        description: stripHTML(stripCDATA(description || "")),
        pubDate: pubDate?.trim() || "",
      });
    }
  }
  return items;
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? match[1] : null;
}

function stripCDATA(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function stripHTML(s) {
  return s.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").trim();
}

function generateId(link) {
  return crypto.createHash('md5').update(link).digest('hex').slice(0, 8);
}

main();
