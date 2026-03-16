// アプリ全体の型定義

export interface NewsArticle {
  title: string;       // 日本語タイトル
  link: string;        // 元記事URL
  description: string; // 日本語要約/本文
  pubDate: string;     // 公開日時
}

export interface VocabItem {
  word: string;        // 英単語
  meaning: string;     // 日本語訳
  example?: string;    // 例文
  level?: string;      // 英検レベル目安 (e.g., "英検準1級")
}

export interface FootnoteItem {
  expression: string;  // 頻出表現
  meaning: string;     // 日本語訳
  usage?: string;      // 使い方のヒント
}

export interface TranslatedArticle {
  originalTitle: string;         // 日本語タイトル
  originalLink: string;          // 元記事URL
  englishTitle: string;          // 英語タイトル
  englishBody: string;           // 英語本文（高校3年生レベル）
  footnotes: FootnoteItem[];     // 受験頻出表現の脚注
  vocabulary: VocabItem[];       // 重要語彙リスト
  pubDate: string;               // 公開日時
  translatedAt: string;          // 英訳日時
}

export interface DailyNews {
  date: string;                      // YYYY-MM-DD 形式
  articles: TranslatedArticle[];     // 英訳済み記事3件
  generatedAt: string;               // 生成日時
}

export interface QuizQuestion {
  id: string;
  word: string;           // 英単語（問題）
  choices: string[];      // 選択肢（日本語）4択
  correctIndex: number;   // 正解インデックス
  articleDate: string;    // 出典日付
}
