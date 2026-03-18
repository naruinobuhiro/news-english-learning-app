/**
 * Gemini API を使って日本語ニュースを高校3年生レベル英語に翻訳するモジュール
 *
 * 出力形式: JSON
 * {
 *   englishTitle: string,
 *   englishBody: string,
 *   footnotes: [{ expression, meaning, usage }],
 *   vocabulary: [{ word, meaning, example, level }]
 * }
 */

import type { FootnoteItem, NewsArticle, TranslatedArticle, VocabItem } from "@/types";

const GEMINI_MODEL = "gemini-1.5-flash";
const API_VERSION = "v1beta"; 
const MAX_RETRIES = 5;
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/** 単一ニュース記事を英訳・学習コンテンツ生成 */
export async function translateArticle(
  article: NewsArticle
): Promise<TranslatedArticle> {
  const apiKey = process.env.GEMINI_API_KEY;

  // APIキーがない場合はモックを返す（ローカル開発用）
  if (!apiKey) {
    return getMockTranslation(article);
  }

  const prompt = buildPrompt(article);
  let retryCount = 0;
  let lastError: any = null;

  while (retryCount < MAX_RETRIES) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/${API_VERSION}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
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
        throw new Error(`Gemini API Error: ${response.status}`);
      }

      const data = await response.json();
      const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
      
      // JSONを抽出（```json ... ``` のようなマークダウンコードブロックを除去）
      const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);

      return {
        originalTitle: article.title,
        originalLink: article.link,
        englishTitle: parsed.englishTitle ?? "",
        englishBody: parsed.englishBody ?? "",
        footnotes: (parsed.footnotes ?? []) as FootnoteItem[],
        vocabulary: (parsed.vocabulary ?? []) as VocabItem[],
        pubDate: article.pubDate,
        translatedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      lastError = err;
      console.warn(`⚠️ Gemini API リトライ中 (${retryCount + 1}/${MAX_RETRIES}):`, err.message);
      retryCount++;
      // 429エラー時は特に長く待機
      const isQuotaError = err.message.includes("429");
      const waitTime = isQuotaError 
        ? Math.max(60000, Math.pow(2, retryCount) * 15000)
        : Math.pow(2, retryCount) * 10000;
      await sleep(waitTime);
    }
  }

  console.error("Gemini API 最終エラー:", lastError);
  return getMockTranslation(article);
}

/** Gemini へのプロンプト */
function buildPrompt(article: NewsArticle): string {
  return `あなたは日本の大学受験英語の専門家です。
以下の日本語ニュースを、高校3年生（英検2級〜準1級レベル）向けの英語に翻訳してください。

## 翻訳ルール
- 語彙は英検準1級レベル（高校卒業〜大学入試レベル）に統一すること
- 文構造は複雑すぎず、高校卒業レベルの読者が無理なく読めること
- 能動態を優先し、受動態は適度に使うこと
- 文長は1文あたり20〜30語程度に抑えること

## 入力ニュース
タイトル: ${article.title}
本文: ${article.description}

## 出力形式（必ずJSONのみを返すこと）
{
  "englishTitle": "英語タイトル",
  "englishBody": "英語本文（段落を\\n\\nで区切る）",
  "footnotes": [
    {
      "expression": "受験頻出の英語表現",
      "meaning": "日本語の意味",
      "usage": "使い方のヒントや例文（任意）"
    }
  ],
  "vocabulary": [
    {
      "word": "英単語",
      "meaning": "日本語訳",
      "example": "短い例文（任意）",
      "level": "英検2級 or 英検準1級 or 大学入試"
    }
  ]
}

footnotesには本文中で使用した受験頻出表現（イディオム、コロケーション、重要構文）を3〜5個挙げること。
vocabularyには英検2級〜準1級レベルの重要単語を5〜8個挙げること。
`;
}

/** ローカル開発・APIエラー時のモック翻訳 */
function getMockTranslation(article: NewsArticle): TranslatedArticle {
  const titleMap: Record<string, string> = {
    "日本政府、AI規制の新法案を閣議決定":
      "Japanese Government Approves New AI Regulation Bill",
    "東京都知事、2035年までにカーボンニュートラル達成を宣言":
      "Tokyo Governor Declares Carbon Neutrality Goal by 2035",
    "円安進行、1ドル155円台に　輸入コスト上昇が懸念":
      "Yen Weakens Past 155 per Dollar, Raising Import Cost Concerns",
  };

  const bodyMap: Record<string, string> = {
    "日本政府、AI規制の新法案を閣議決定":
      "The Japanese government has approved a new bill regulating the development and use of artificial intelligence (AI). The legislation aims to ensure AI safety while maintaining Japan's international competitiveness in the technology sector.\n\nThe bill sets out a framework for evaluating potential risks posed by advanced AI systems. Companies developing high-risk AI applications will be required to conduct safety assessments before releasing their products.",
    "東京都知事、2035年までにカーボンニュートラル達成を宣言":
      "Tokyo Governor Yuriko Koike reaffirmed the metropolitan government's commitment to achieving carbon neutrality by 2035 at her regular press conference. The ambitious target involves reducing greenhouse gas emissions to net zero within the city.\n\nThe governor outlined several key initiatives, including accelerating the adoption of renewable energy sources and promoting energy-efficient transportation systems across the capital.",
    "円安進行、1ドル155円台に　輸入コスト上昇が懸念":
      "The Japanese yen briefly fell to the 155 yen range against the US dollar in Tokyo foreign exchange markets, raising concerns about rising import costs and their impact on consumer prices.\n\nMarket participants are closely watching the Bank of Japan's monetary policy decisions, as the central bank's stance on interest rates is considered a key factor influencing the currency's value.",
  };

  const englishTitle = titleMap[article.title] ?? "Breaking News in Japan";
  const englishBody =
    bodyMap[article.title] ??
    "This is a simulated English translation for local development purposes. The actual translation will be generated by the Gemini API when a valid API key is provided.";

  return {
    originalTitle: article.title,
    originalLink: article.link,
    englishTitle,
    englishBody,
    footnotes: [
      {
        expression: "aims to do",
        meaning: "〜することを目指す",
        usage: "主語の目的・目標を述べるときに使う。",
      },
      {
        expression: "be required to do",
        meaning: "〜することが求められる／義務付けられる",
        usage: "義務・要件を述べる受動態の頻出表現。",
      },
      {
        expression: "raise concerns about",
        meaning: "〜に対する懸念を引き起こす",
        usage: "問題や懸念を提起する際の定番フレーズ。",
      },
    ],
    vocabulary: [
      { word: "legislation", meaning: "法律、立法", level: "英検準1級" },
      { word: "competitiveness", meaning: "競争力", level: "大学入試" },
      { word: "framework", meaning: "枠組み、制度", level: "英検準1級" },
      { word: "neutrality", meaning: "中立、中立性", level: "英検2級" },
      { word: "monetary", meaning: "通貨の、金融の", level: "英検準1級" },
    ],
    pubDate: article.pubDate,
    translatedAt: new Date().toISOString(),
  };
}
