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
const API_VERSION = "v1beta"; 
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

    // 1. 既存データの読み込み (破損保護付き)
    let archive = [];
    try {
      if (fs.existsSync(ARCHIVE_PATH)) {
        const content = fs.readFileSync(ARCHIVE_PATH, 'utf-8');
        archive = content.trim() ? JSON.parse(content) : [];
      }
    } catch (e) {
      console.warn("⚠️ archive.json の読み込みに失敗しました。新規作成します:", e.message);
      archive = [];
    }

    const now = new Date();
    const jstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const today = jstDate.toISOString().slice(0, 10);
    // すでに今日分があればスキップ（デバッグ時はコメントアウト）
    // if (archive.some(d => d.date === today)) {
    //   console.log(`✅ ${today} のデータは既に存在します。スキップします。`);
    //   return;
    // }

    // 2. Yahooニュース取得 (User-Agent付き)
    console.log("📰 Yahooニュースを取得中...");
    const res = await fetch(RSS_URL, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
    });
    const xml = await res.text();
    const allNews = parseRSS(xml);
    
    if (allNews.length === 0) {
      throw new Error("ニュースが取得できませんでした。");
    }

    // 3. 3件ランダムに選択
    // 4. 英訳 & コンテンツ生成 (成功保証ロジック)
    console.log("🔄 Gemini API で英訳・学習コンテンツを生成中...");
    const translatedArticles = [];
    const pool = allNews.sort(() => Math.random() - 0.5); // 候補をシャッフル
    const TARGET_COUNT = 3;

    for (let i = 0; i < pool.length && translatedArticles.length < TARGET_COUNT; i++) {
      const article = pool[i];
      
      // 2回目以降の試行（成功・失敗問わず）は 60秒 待機
      if (i > 0) {
        console.log(`⏳ 次の候補を試すまで 60秒 待機します... (現在 ${translatedArticles.length}/${TARGET_COUNT} 件成功)`);
        await sleep(60000);
      }

      console.log(`📝 記事「${article.title}」を翻訳中...`);
      let retryCount = 0;
      let translated = null;
      
      while (retryCount < MAX_RETRIES) {
        try {
          translated = await translateArticle(article, apiKey);
          if (validateArticle(translated)) {
            break;
          } else {
            console.warn("⚠️ 翻訳結果が不完全です（必須フィールド欠落）。");
            translated = null; // 失敗扱い
            break; // この記事は諦めて次の記事へ
          }
        } catch (e) {
          console.warn(`⚠️ 翻訳リトライ中 (${retryCount + 1}/${MAX_RETRIES}):`, e.message);
          retryCount++;
          // 429 エラー（クォータ制限）の場合は、最低でも60秒待機
          const isQuotaError = e.message.includes("429");
          const waitTime = isQuotaError 
            ? Math.max(60000, Math.pow(2, retryCount) * 15000)
            : Math.pow(2, retryCount) * 10000;
          await sleep(waitTime);
        }
      }

      if (translated) {
        console.log("✅ 翻訳成功！");
        translatedArticles.push(translated);
      } else {
        console.warn(`❌ 記事「${article.title}」の翻訳に失敗しました。次の候補を試します。`);
      }
    }
    
    if (translatedArticles.length === 0) {
      throw new Error("有効な翻訳記事が1つも生成されませんでした。ニュースソースまたはAPIに致命的な問題があります。");
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

function validateArticle(a) {
  if (!a) return false;
  const required = ["englishTitle", "englishBody", "footnotes", "vocabulary"];
  for (const field of required) {
    if (!a[field] || (Array.isArray(a[field]) && a[field].length === 0)) {
      console.warn(`Missing field or empty array: ${field}`);
      return false;
    }
  }
  return true;
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
        generationConfig: { temperature: 0.3 },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ],
      }),
    }
  );
  
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`❌ Gemini API Error (${response.status}):`, errorBody);
    throw new Error(`Gemini API Error: ${response.status}`);
  }
  const data = await response.json();
  const rawText = data.candidates[0].content.parts[0].text;
  
  // JSONを抽出（```json ... ``` のようなマークダウンコードブロックを除去）
  const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleanJson);
  
  return {
    originalTitle: article.title,
    originalLink: article.link,
    ...parsed,
    pubDate: article.pubDate,
    translatedAt: new Date().toISOString(),
  };
}

main();
