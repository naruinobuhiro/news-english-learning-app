"use client";

import { useState, useEffect, useCallback } from "react";
import type { DailyNews, VocabItem, QuizQuestion } from "@/types";
import { getArchive } from "@/lib/storage";

type Mode = "cards" | "quiz";

export default function CardsPage() {
  const [allVocab, setAllVocab] = useState<VocabItem[]>([]);
  const [mode, setMode] = useState<Mode>("cards");
  const [loading, setLoading] = useState(true);

  // フラッシュカード state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // クイズ state
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  useEffect(() => {
    const fetchVocab = async () => {
      const data = await getArchive();
      const vocab: VocabItem[] = data.flatMap((d) =>
        d.articles.flatMap((a) => a.vocabulary)
      );
      // 重複排除
      const unique = vocab.filter(
        (v, i, arr) => arr.findIndex((x) => x.word === v.word) === i
      );
      setAllVocab(unique);
      setLoading(false);
    };
    fetchVocab();
  }, []);

  // クイズ問題を生成
  const generateQuiz = useCallback(() => {
    if (allVocab.length < 4) return;
    const shuffled = [...allVocab].sort(() => Math.random() - 0.5);
    const quizItems = shuffled.slice(0, Math.min(10, shuffled.length));

    const qs: QuizQuestion[] = quizItems.map((item, idx) => {
      const others = allVocab
        .filter((v) => v.word !== item.word)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map((v) => v.meaning);

      const correctIdx = Math.floor(Math.random() * 4);
      const choices = [...others];
      choices.splice(correctIdx, 0, item.meaning);
      return {
        id: `q-${idx}`,
        word: item.word,
        choices: choices.slice(0, 4),
        correctIndex: correctIdx,
        articleDate: "",
      };
    });
    setQuestions(qs);
    setQuizIndex(0);
    setSelectedAnswer(null);
    setScore(0);
    setQuizFinished(false);
  }, [allVocab]);

  useEffect(() => {
    if (mode === "quiz" && allVocab.length >= 4) {
      generateQuiz();
    }
  }, [mode, allVocab, generateQuiz]);

  const handleQuizAnswer = (choiceIdx: number) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(choiceIdx);
    if (choiceIdx === questions[quizIndex].correctIndex) {
      setScore((s) => s + 1);
    }
    setTimeout(() => {
      if (quizIndex + 1 < questions.length) {
        setQuizIndex((i) => i + 1);
        setSelectedAnswer(null);
      } else {
        setQuizFinished(true);
      }
    }, 1200);
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: "80px 24px", textAlign: "center" }}>
        <p style={{ color: "var(--color-text-muted)" }}>語彙データを読み込み中...</p>
      </div>
    );
  }

  if (allVocab.length === 0) {
    return (
      <div className="container">
        <div className="empty-state">
          <div className="icon">🃏</div>
          <h3>語彙データがありません</h3>
        </div>
      </div>
    );
  }

  const currentVocab = allVocab[currentIndex];

  return (
    <div className="container">
      <div className="cards-container">
        <div className="cards-hero">
          <h2>🃏 単語カード & クイズ</h2>
          <p style={{ color: "var(--color-text-secondary)", marginBottom: "24px" }}>
            ニュースから抽出した{allVocab.length}語の重要語彙を学習しよう！
          </p>
          <div className="tabs" style={{ margin: "0 auto" }}>
            <button className={`tab-btn ${mode === "cards" ? "active" : ""}`} onClick={() => setMode("cards")}>🃏 暗記カード</button>
            <button className={`tab-btn ${mode === "quiz" ? "active" : ""}`} onClick={() => setMode("quiz")}>📝 4択クイズ</button>
          </div>
        </div>

        {mode === "cards" && (
          <>
            <div style={{ maxWidth: "560px", margin: "0 auto 16px" }}>
              <div className="progress-bar-wrap">
                <div className="progress-bar-fill" style={{ width: `${((currentIndex + 1) / allVocab.length) * 100}%` }} />
              </div>
              <div className="progress-label" style={{ textAlign: "right" }}>{currentIndex + 1} / {allVocab.length}</div>
            </div>
            <div className="flashcard-scene" onClick={() => setFlipped(!flipped)}>
              <div className={`flashcard ${flipped ? "flipped" : ""}`}>
                <div className="flashcard-face flashcard-front">
                  <div className="flashcard-hint">タップして意味を表示</div>
                  <div className="flashcard-word">{currentVocab.word}</div>
                  {currentVocab.level && <div className="flashcard-level">{currentVocab.level}</div>}
                </div>
                <div className="flashcard-face flashcard-back">
                  <div className="flashcard-hint">意味</div>
                  <div className="flashcard-meaning">{currentVocab.meaning}</div>
                  {currentVocab.example && <div className="flashcard-example">{currentVocab.example}</div>}
                </div>
              </div>
            </div>
            <div className="card-nav">
              <button className="card-nav-btn" disabled={currentIndex === 0} onClick={() => { setCurrentIndex(i => i - 1); setFlipped(false); }}>◀</button>
              <span className="card-counter">{currentIndex + 1} / {allVocab.length}</span>
              <button className="card-nav-btn" disabled={currentIndex === allVocab.length - 1} onClick={() => { setCurrentIndex(i => i + 1); setFlipped(false); }}>▶</button>
            </div>
          </>
        )}

        {mode === "quiz" && questions.length > 0 && !quizFinished && (
          <div className="quiz-container">
            <div style={{ maxWidth: "600px", margin: "0 auto 16px" }}>
              <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: `${((quizIndex + 1) / questions.length) * 100}%` }} /></div>
              <div className="progress-label" style={{ textAlign: "right" }}>問題 {quizIndex + 1} / {questions.length}</div>
            </div>
            <div className="quiz-question">
              <div className="quiz-label">この英単語の意味は？</div>
              <div className="quiz-word">{questions[quizIndex].word}</div>
            </div>
            <div className="quiz-choices">
              {questions[quizIndex].choices.map((choice, i) => {
                let cls = "quiz-choice";
                if (selectedAnswer !== null) {
                  if (i === questions[quizIndex].correctIndex) cls += " correct";
                  else if (i === selectedAnswer) cls += " incorrect";
                }
                return (
                  <button key={i} className={cls} onClick={() => handleQuizAnswer(i)} disabled={selectedAnswer !== null}>{choice}</button>
                );
              })}
            </div>
          </div>
        )}

        {mode === "quiz" && quizFinished && (
          <div className="quiz-container">
            <div className="quiz-result">
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>🎉</div>
              <div className="quiz-score">{score} / {questions.length}</div>
              <button className="btn btn-primary" onClick={generateQuiz}>🔄 もう一度</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
