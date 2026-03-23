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
const GEMINI_MODEL = "gemini-2.0-flash"; 
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
    
    // すでに今日分があればスキップ（手動再実行時の重複防止）
    if (archive.some(d => d.date === today)) {
      console.log(`✅ ${today} のデータは既に存在します。処理を終了します。`);
      return;
    }

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
    const TARGET_COUNT = 1;

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
            console.warn("⚠️ 翻訳結果が不完全です（必須フィールド欠落）。次の候補を試します。");
            translated = null;
            break; // バリデーション失敗はリトライしても解決しないため即時 break
          }
        } catch (e) {
          // セーフティ拒絶などの「回復不能なエラー」は即座に諦める
          if (e.message.includes("拒否されました") || e.message.includes("HTTP Error (400)")) {
            console.error(`❌ 回復不能なエラーのためこの記事をスキップします: ${e.message}`);
            translated = null;
            break;
          }

          console.warn(`⚠️ 翻訳リトライ中 (${retryCount + 1}/${MAX_RETRIES}):`, e.message);
          retryCount++;
          // 429 エラー（クォータ制限）の場合は、最低でも60秒待機
          const isQuotaError = e.message.includes("429");
          const waitTime = isQuotaError 
            ? Math.max(60 * 1000, Math.pow(2, retryCount) * 20000)
            : Math.pow(2, retryCount) * 10000;
          console.warn(`⏳ 再試行まで ${waitTime/1000} 秒待機します...`);
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
以下の日本語ニュースを、高校3年生（英検2級〜準1級レベル）向けの英語に翻訳し、指定されたJSONフォーマットで出力してください。

タイトル: ${article.title}
本文: ${article.description}

## 出力JSONスキーマ:
{
  "englishTitle": "記事の英語タイトル",
  "englishBody": "英語本文（段落は \\n\\n で区切る）",
  "footnotes": [
    {
      "expression": "受験頻出の英語表現（イディオム、構文など）",
      "meaning": "日本語の意味",
      "usage": "使い方のヒント"
    }
  ],
  "vocabulary": [
    {
      "word": "重要英単語",
      "meaning": "日本語訳",
      "example": "本文に基づいた短い例文",
      "level": "英検2級 or 英検準1級"
    }
  ]
}

重要：
- 脚注 (footnotes) は3〜5個含めてください。
- 語彙 (vocabulary) は5〜8個含めてください。
- レベル感は大学入試を意識してください。
- 返答は純粋なJSONのみとし、解説文などは一切含めないでください。`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/${API_VERSION}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { 
          temperature: 0.3,
          responseMimeType: "application/json"
        },
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
    console.error(`❌ Gemini API HTTP Error (${response.status}):`, errorBody);
    throw new Error(`Gemini API HTTP Error: ${response.status}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];

  if (!candidate || candidate.finishReason !== "STOP") {
    console.error(`❌ AIの生成が正常に終了しませんでした。理由: ${candidate?.finishReason || "不明"}`);
    if (candidate?.safetyRatings) {
      console.error("安全性の判定状況:", JSON.stringify(candidate.safetyRatings));
    }
    throw new Error("AIの生成が未完了または拒否されました。");
  }

  const rawText = candidate.content.parts[0].text;
  
  let parsed = null;
  try {
    // JSONモードが効かない場合や、AIが勝手にマークダウンを含める場合への対策
    const cleanedText = rawText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    parsed = JSON.parse(cleanedText);
  } catch (e) {
    console.error("❌ JSONパースエラー。AIの生成結果:", rawText);
    throw new Error("AIの生成したJSONが不正な形式です。");
  }
  
  return {
    originalTitle: article.title,
    originalLink: article.link,
    ...parsed,
    pubDate: article.pubDate,
    translatedAt: new Date().toISOString(),
  };
}

main();
