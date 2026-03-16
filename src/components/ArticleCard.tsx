"use client";

import { useState } from "react";
import type { TranslatedArticle, VocabItem } from "@/types";

interface ArticleCardProps {
  article: TranslatedArticle;
  index: number;
}

export default function ArticleCard({ article, index }: ArticleCardProps) {
  const [showFootnotes, setShowFootnotes] = useState(false);
  const [showVocab, setShowVocab] = useState(false);

  return (
    <article className="article-card">
      <div className="card-header">
        <div className="card-number">{index + 1}</div>
        <div className="card-title-wrap">
          <div className="original-title">
            <a href={article.originalLink} target="_blank" rel="noopener noreferrer">
              {article.originalTitle}
              <span style={{ fontSize: "11px", opacity: 0.6 }}>↗</span>
            </a>
          </div>
          <h2 className="english-title">{article.englishTitle}</h2>
        </div>
      </div>

      <div className="divider" />

      <div className="body-label">English Translation</div>
      <div className="english-body">{article.englishBody}</div>

      {/* 頻出表現（脚注） */}
      {article.footnotes.length > 0 && (
        <div style={{ marginTop: "20px" }}>
          <button
            className="btn btn-ghost"
            style={{ fontSize: "13px", padding: "7px 14px" }}
            onClick={() => setShowFootnotes(!showFootnotes)}
          >
            {showFootnotes ? "▲" : "▼"} 頻出表現 & 重要構文 ({article.footnotes.length}件)
          </button>

          {showFootnotes && (
            <div className="footnotes-section" style={{ marginTop: "12px" }}>
              <div className="footnotes-title">📌 受験頻出表現</div>
              {article.footnotes.map((fn, i) => (
                <div className="footnote-item" key={i}>
                  <div className="footnote-expr">{fn.expression}</div>
                  <div>
                    <div className="footnote-meaning">{fn.meaning}</div>
                    {fn.usage && <div className="footnote-usage">💡 {fn.usage}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 重要語彙 */}
      {article.vocabulary.length > 0 && (
        <div className="vocab-section" style={{ marginTop: "16px" }}>
          <button
            className="btn btn-ghost"
            style={{ fontSize: "13px", padding: "7px 14px" }}
            onClick={() => setShowVocab(!showVocab)}
          >
            {showVocab ? "▲" : "▼"} 重要語彙 ({article.vocabulary.length}語)
          </button>

          {showVocab && (
            <div style={{ marginTop: "12px" }}>
              <div className="vocab-title">📚 単語リスト</div>
              <div className="vocab-grid">
                {article.vocabulary.map((v: VocabItem, i: number) => (
                  <div className="vocab-pill" key={i}>
                    <span className="vocab-word">{v.word}</span>
                    <span className="vocab-meaning">{v.meaning}</span>
                    {v.level && (
                      <span
                        style={{
                          display: "block",
                          fontSize: "11px",
                          color: "var(--color-accent-light)",
                          marginTop: "2px",
                        }}
                      >
                        {v.level}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
