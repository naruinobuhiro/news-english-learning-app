/**
 * Google Sheets API に語彙データを追記するモジュール
 *
 * スプレッドシートのシート名: "Vocabulary"
 * カラム: 日付 | 単語 | 意味 | 例文 | レベル
 */

import type { VocabItem } from "@/types";

const SHEET_NAME = "Vocabulary";

/** 単語リストをスプレッドシートに追記する */
export async function appendVocabToSheet(
  words: VocabItem[],
  date: string
): Promise<void> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  if (!email || !privateKey || !spreadsheetId) {
    console.warn(
      "Google Sheets の環境変数が未設定のため、スプレッドシートへの書き込みをスキップします。"
    );
    return;
  }

  try {
    // サービスアカウントのJWTを生成
    const { GoogleAuth } = await import("googleapis").then((m) => ({
      GoogleAuth: m.google.auth.GoogleAuth,
    }));

    const auth = new GoogleAuth({
      credentials: {
        client_email: email,
        private_key: privateKey,
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const { google } = await import("googleapis");
    const sheets = google.sheets({ version: "v4", auth });

    const rows = words.map((v) => [
      date,
      v.word,
      v.meaning,
      v.example ?? "",
      v.level ?? "",
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAME}!A:E`,
      valueInputOption: "RAW",
      requestBody: { values: rows },
    });

    console.log(`✅ ${words.length}件の語彙をスプレッドシートに追記しました。`);
  } catch (err) {
    console.error("Google Sheets への書き込みエラー:", err);
  }
}
