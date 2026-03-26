/**
 * 翻訳スクリプト (scripts/translate-news.mjs)
 * raw-news.json の未翻訳記事を1件ずつ Gemini API で英訳し、
 * archive.json を更新する。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_NEWS_PATH = path.join(__dirname, '../public/data/raw-news.json');
const ARCHIVE_PATH = path.join(__dirname, '../public/data/archive.json');
const GEMINI_MODEL = "gemini-2.0-flash";
const API_VERSION = "v1beta";
const MAX_RETRIES = 3;
const TRANSLATE_INTERVAL_MS = 5000; // 翻訳間隔: 5秒
const RETRY_BASE_MS = 15000;        // リトライ基本待機: 15秒

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function main() {
  console.log("🔄 翻訳プロセスを開始します...");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY が設定されていません。");
    process.exit(1);
  }

  try {
    // 1. raw-news.json を読み込み
    if (!fs.existsSync(RAW_NEWS_PATH)) {
      console.log("⚠️ raw-news.json が見つかりません。先に fetch-news.mjs を実行してください。");
      return;
    }

    let rawNews = JSON.parse(fs.readFileSync(RAW_NEWS_PATH, 'utf-8'));

    // 2. 未翻訳（pending）の記事をフィルタ
    const pendingArticles = rawNews.filter(a => a.status === "pending");

    if (pendingArticles.length === 0) {
      console.log("✅ 未翻訳の記事はありません。");
    } else {
      console.log(`📝 ${pendingArticles.length} 件の未翻訳記事を処理します。`);

      // 3. 1件ずつ翻訳（インターバル付き）
      for (let i = 0; i < pendingArticles.length; i++) {
        const article = pendingArticles[i];

        // 2件目以降はインターバルを挟む
        if (i > 0) {
          console.log(`⏳ ${TRANSLATE_INTERVAL_MS / 1000} 秒待機中...`);
          await sleep(TRANSLATE_INTERVAL_MS);
        }

        console.log(`📝 [${i + 1}/${pendingArticles.length}] 「${article.title}」を翻訳中...`);

        let success = false;
        let retryCount = article.retryCount || 0;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            const translation = await translateArticle(article, apiKey);

            if (validateTranslation(translation)) {
              // 翻訳成功 → raw-news.json を更新
              const idx = rawNews.findIndex(a => a.id === article.id);
              if (idx !== -1) {
                rawNews[idx].status = "translated";
                rawNews[idx].translation = translation;
                rawNews[idx].translatedAt = new Date().toISOString();
              }
              console.log(`✅ 翻訳成功: 「${article.title}」`);
              success = true;
              break;
            } else {
              console.warn("⚠️ 翻訳結果が不完全です（必須フィールド欠落）。次の試行へ...");
            }
          } catch (e) {
            // 回復不能なエラーは即座にスキップ
            if (e.message.includes("拒否されました") || e.message.includes("HTTP Error (400)")) {
              console.error(`❌ 回復不能エラー: ${e.message}`);
              break;
            }

            console.warn(`⚠️ 翻訳リトライ (${attempt + 1}/${MAX_RETRIES}): ${e.message}`);

            // 429 エラーの場合は長めに待機
            const isQuotaError = e.message.includes("429");
            const waitTime = isQuotaError
              ? Math.max(60000, Math.pow(2, attempt) * RETRY_BASE_MS)
              : Math.pow(2, attempt) * RETRY_BASE_MS;

            console.warn(`⏳ ${waitTime / 1000} 秒後に再試行...`);
            await sleep(waitTime);
          }
        }

        if (!success) {
          // 翻訳失敗 → ステータスを更新
          const idx = rawNews.findIndex(a => a.id === article.id);
          if (idx !== -1) {
            rawNews[idx].status = "failed";
            rawNews[idx].retryCount = retryCount + 1;
          }
          console.warn(`❌ 翻訳失敗: 「${article.title}」(リトライ回数: ${retryCount + 1})`);
        }
      }

      // 4. raw-news.json を保存（ステータス更新を反映）
      fs.writeFileSync(RAW_NEWS_PATH, JSON.stringify(rawNews, null, 2));
      console.log("💾 raw-news.json を更新しました。");
    }

    // 5. 翻訳済み記事から archive.json を生成
    buildArchive(rawNews);

  } catch (err) {
    console.error("❌ エラーが発生しました:", err);
    process.exit(1);
  }
}

// --- archive.json の生成 ---

function buildArchive(rawNews) {
  console.log("📦 archive.json を生成中...");

  // 翻訳済みの記事のみ抽出
  const translatedItems = rawNews.filter(a => a.status === "translated" && a.translation);

  if (translatedItems.length === 0) {
    console.log("⚠️ 翻訳済み記事がないため、archive.json は更新しません。");
    // archive.json が存在しなければ空配列を作成
    if (!fs.existsSync(ARCHIVE_PATH)) {
      fs.writeFileSync(ARCHIVE_PATH, JSON.stringify([], null, 2));
    }
    return;
  }

  // 日付ごとにグループ化
  const byDate = {};
  for (const item of translatedItems) {
    const date = item.date;
    if (!byDate[date]) {
      byDate[date] = [];
    }
    byDate[date].push({
      originalTitle: item.title,
      originalLink: item.link,
      ...item.translation,
      pubDate: item.pubDate,
      translatedAt: item.translatedAt || new Date().toISOString(),
    });
  }

  // DailyNews 形式に変換（新しい順、最大7日分）
  const archive = Object.entries(byDate)
    .sort(([a], [b]) => b.localeCompare(a)) // 新しい日付が先
    .slice(0, 7)
    .map(([date, articles]) => ({
      date,
      articles,
      generatedAt: new Date().toISOString(),
    }));

  fs.writeFileSync(ARCHIVE_PATH, JSON.stringify(archive, null, 2));
  console.log(`✅ archive.json を更新しました（${archive.length} 日分、全 ${translatedItems.length} 記事）。`);
}

// --- 翻訳関数 ---

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

  try {
    const cleanedText = rawText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    return JSON.parse(cleanedText);
  } catch (e) {
    console.error("❌ JSONパースエラー。AIの生成結果:", rawText);
    throw new Error("AIの生成したJSONが不正な形式です。");
  }
}

function validateTranslation(t) {
  if (!t) return false;
  const required = ["englishTitle", "englishBody", "footnotes", "vocabulary"];
  for (const field of required) {
    if (!t[field] || (Array.isArray(t[field]) && t[field].length === 0)) {
      console.warn(`⚠️ Missing field or empty array: ${field}`);
      return false;
    }
  }
  return true;
}

main();
