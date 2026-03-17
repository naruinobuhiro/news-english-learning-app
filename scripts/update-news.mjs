/**
 * ニュース取得・英訳・JSON更新スクリプト (scripts/update-news.mjs)
 * GitHub Actions から実行され、public/data/archive.json を更新します。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE_PATH = path.join(__dirname, '../public/data/archive.json');
const RSS_URL = "https://news.yahoo.co.jp/rss/topics/top-picks.xml";
const GEMINI_MODEL = "gemini-1.5-flash"; 
const API_VERSION = "v1"; // v1beta ではなく安定版の v1 を使用
const MAX_RETRIES = 5;
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function main() {
  console.log("🚀 ニュース更新プロセスを開始します...");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY が設定されていません。");
    process.exit(1);
  }

  try {
    // 0. 開始前に60秒待機 (GitHub Actions の共用IPによるレート制限を落ち着かせるための「暖気」)
    console.log("⏳ 準備のため 60秒 待機します...");
    await sleep(60000);

    // 1. 既存データの読み込み
    let archive = [];
    if (fs.existsSync(ARCHIVE_PATH)) {
      archive = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf-8'));
    }

    const now = new Date();
    const jstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const today = jstDate.toISOString().slice(0, 10);
    // すでに今日分があればスキップ（デバッグ時はコメントアウト）
    // if (archive.some(d => d.date === today)) {
    //   console.log(`✅ ${today} のデータは既に存在します。スキップします。`);
    //   return;
    // }

    // 2. Yahooニュース取得
    console.log("📰 Yahooニュースを取得中...");
    const res = await fetch(RSS_URL);
    const xml = await res.text();
    const allNews = parseRSS(xml);
    
    if (allNews.length === 0) {
      throw new Error("ニュースが取得できませんでした。");
    }

    // 3. 3件ランダムに選択
    // 3. 3件選択 (安定したため3件に戻します)
    const selected = allNews.sort(() => Math.random() - 0.5).slice(0, 3);

    // 4. 英訳 & コンテンツ生成
    console.log("🔄 Gemini API で英訳・学習コンテンツを生成中...");
    const translatedArticles = [];
    for (let i = 0; i < selected.length; i++) {
      const article = selected[i];
      
      // 記事間は 60秒 待機して完璧にレート制限を回避 (無料枠対策)
      if (i > 0) {
        console.log(`⏳ 次の記事まで 60秒 待機します... (${i + 1}/${selected.length})`);
        await sleep(60000);
      }

      let retryCount = 0;
      let translated = null;
      
      while (retryCount < MAX_RETRIES) {
        try {
          translated = await translateArticle(article, apiKey);
          if (translated && translated.englishTitle && translated.englishBody) {
            break;
          }
        } catch (e) {
          console.warn(`⚠️ 翻訳リトライ中 (${retryCount + 1}/${MAX_RETRIES}):`, e.message);
          retryCount++;
          // 指数関数的バックオフ: 15秒, 30秒, 60秒, ...
          const waitTime = Math.pow(2, retryCount) * 7500;
          await sleep(waitTime);
        }
      }

      if (translated) {
        translatedArticles.push(translated);
      }
    }
    
    if (translatedArticles.length === 0) {
      throw new Error("有効な翻訳記事が1つも生成されませんでした。");
    }

    const dailyNews = {
      date: today,
      articles: translatedArticles,
      generatedAt: new Date().toISOString()
    };

    // 5. アーカイブ更新 (新しい順、最大7日分)
    archive.unshift(dailyNews);
    const updatedArchive = archive.slice(0, 7);

    // 6. JSON 保存
    fs.writeFileSync(ARCHIVE_PATH, JSON.stringify(updatedArchive, null, 2));
    console.log(`✅ ${ARCHIVE_PATH} を更新しました。`);

    // 7. Google Sheets 追記 (オプション)
    if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
        console.log("📊 Google Sheets への追記（実装中...）");
        // ここに sheets.ts 相当のロジックが来ます
    }

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
function stripCDATA(s) { return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim(); }
function stripHTML(s) { return s.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").trim(); }

async function translateArticle(article, apiKey) {
  const prompt = `あなたは日本の大学受験英語の専門家です。
以下の日本語ニュースを、高校3年生（英検2級〜準1級レベル）向けの英語に翻訳してください。

タイトル: ${article.title}
本文: ${article.description}

出力形式（必ずJSONのみを返すこと）:
{
  "englishTitle": "...",
  "englishBody": "English text with paragraphs separated by \\n\\n",
  "footnotes": [{"expression": "...", "meaning": "...", "usage": "..."}],
  "vocabulary": [{"word": "...", "meaning": "...", "example": "...", "level": "..."}]
}
Please ensure footnotes are useful for high school students and vocabulary covers levels from Eiken 2 to Pre-1.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/${API_VERSION}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
      }),
    }
  );
  
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`❌ Gemini API Error (${response.status}):`, errorBody);
    throw new Error(`Gemini API Error: ${response.status}`);
  }
  const data = await response.json();
  const parsed = JSON.parse(data.candidates[0].content.parts[0].text);
  
  return {
    originalTitle: article.title,
    originalLink: article.link,
    ...parsed,
    pubDate: article.pubDate,
    translatedAt: new Date().toISOString(),
  };
}

main();
