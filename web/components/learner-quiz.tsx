'use client';

import type { ReactNode } from 'react';

/**
 * The learner-facing quiz, shared by the teachable moment and the training page.
 *
 * Deliberately presentational: it owns no fetching and no scoring. The two callers
 * submit to different endpoints and one of them redirects on a pass, so keeping the
 * behaviour where it is means this can only change the markup — which is the part
 * that had already drifted (the training page's copy was still 12px with 11px
 * explanations after the landing page had been fixed).
 */
export interface LearnerQuizData {
  title?: string;
  passingScorePct: number;
  questions: Array<{ id: string; prompt: string; options: string[] }>;
}

export interface LearnerQuizResult {
  score: number;
  total: number;
  passed: boolean;
  passingScorePct: number;
  results: Array<{
    questionId: string;
    correct: boolean;
    correctIndex: number;
    explanation: string | null;
  }>;
}

export function LearnerQuiz({
  quiz,
  accent,
  answers,
  onAnswer,
  result,
  busy,
  onSubmit,
  submitError,
  heading = 'Knowledge check',
  passMessage = 'Passed — your training for this exercise is marked complete. Well done.',
  failMessage = 'Not quite. Review the explanations above; your training lead can reassign the module.',
  footer,
}: {
  quiz: LearnerQuizData;
  accent: string;
  answers: Record<string, number>;
  onAnswer: (questionId: string, choice: number) => void;
  result: LearnerQuizResult | null;
  busy: boolean;
  onSubmit: () => void;
  submitError?: string | null;
  heading?: string;
  passMessage?: string;
  failMessage?: string;
  footer?: ReactNode;
}) {
  const byId = (id: string) => result?.results.find((r) => r.questionId === id);
  const allAnswered = quiz.questions.every((q) => answers[q.id] !== undefined);

  return (
    <section className="mt-6 border-t border-slate-200 pt-6">
      <h2 className="text-lg font-semibold text-slate-900">{heading}</h2>
      <p className="mt-1 text-sm text-slate-500">
        {result
          ? `You scored ${result.score}/${result.total}. Pass mark ${result.passingScorePct}%.`
          : `${quiz.questions.length} short questions. Pass mark ${quiz.passingScorePct}%.`}
      </p>

      <div className="mt-4 space-y-5">
        {quiz.questions.map((q, qi) => {
          const r = byId(q.id);
          return (
            <div key={q.id}>
              <p className="text-base font-medium text-slate-800">
                {qi + 1}. {q.prompt}
              </p>
              <div className="mt-2 space-y-2">
                {q.options.map((opt, oi) => {
                  const chosen = answers[q.id] === oi;
                  const isCorrect = r && r.correctIndex === oi;
                  const wrongPick = r && chosen && !r.correct;
                  return (
                    <label
                      key={oi}
                      className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-base transition focus-within:ring-2 focus-within:ring-slate-300 ${
                        isCorrect
                          ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                          : wrongPick
                            ? 'border-red-300 bg-red-50 text-red-900'
                            : chosen
                              ? 'border-slate-400 bg-slate-50 text-slate-900'
                              : 'border-slate-200 text-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        disabled={!!result}
                        checked={chosen}
                        style={{ accentColor: accent }}
                        className="h-4 w-4 shrink-0"
                        onChange={() => onAnswer(q.id, oi)}
                      />
                      {opt}
                      {isCorrect && <span className="ml-auto text-xs font-semibold">correct</span>}
                    </label>
                  );
                })}
              </div>
              {r?.explanation && (
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{r.explanation}</p>
              )}
            </div>
          );
        })}
      </div>

      {submitError && (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {submitError}
        </p>
      )}

      {!result ? (
        <div className="[&>button]:w-full sm:[&>button]:w-auto">
          <button
            onClick={onSubmit}
            disabled={busy || !allAnswered}
            className="mt-5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50"
            style={{ background: accent }}
          >
            {busy ? 'Checking…' : 'Submit answers'}
          </button>
        </div>
      ) : (
        <div
          role="status"
          aria-live="polite"
          className={`mt-5 rounded-lg px-4 py-3 text-base ${
            result.passed ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'
          }`}
        >
          {result.passed ? passMessage : failMessage}
        </div>
      )}

      {footer}
    </section>
  );
}
