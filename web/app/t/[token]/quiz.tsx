'use client';

import { useEffect, useState } from 'react';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Quiz {
  quizId: string;
  title: string;
  passingScorePct: number;
  questions: Array<{ id: string; prompt: string; options: string[] }>;
}
interface Result {
  score: number;
  total: number;
  passed: boolean;
  passingScorePct: number;
  results: Array<{ questionId: string; correct: boolean; correctIndex: number; explanation: string | null }>;
}

/**
 * Post-reveal knowledge check. Fetches the quiz for this token (without the
 * answers), submits the employee's choices for server-side scoring, and shows
 * per-question feedback. A pass marks their training complete.
 */
export function Quiz({ token, accent }: { token: string; accent: string }) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/track/quiz/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((q) => setQuiz(q))
      .catch(() => setQuiz(null));
  }, [token]);

  if (!quiz) return null;

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/track/quiz/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quizId: quiz!.quizId,
          answers: Object.entries(answers).map(([questionId, choice]) => ({ questionId, choice })),
        }),
      });
      if (res.ok) setResult(await res.json());
    } finally {
      setBusy(false);
    }
  }

  const byId = (id: string) => result?.results.find((r) => r.questionId === id);
  const allAnswered = quiz.questions.every((q) => answers[q.id] !== undefined);

  return (
    <div className="mt-6 border-t border-slate-200 pt-5">
      <h2 className="text-sm font-semibold text-slate-900">Quick knowledge check</h2>
      <p className="mt-1 text-xs text-slate-500">
        {result
          ? `You scored ${result.score}/${result.total}. Pass mark ${result.passingScorePct}%.`
          : `Answer ${quiz.questions.length} short questions. Pass mark ${quiz.passingScorePct}%.`}
      </p>

      <div className="mt-3 space-y-4">
        {quiz.questions.map((q, qi) => {
          const r = byId(q.id);
          return (
            <div key={q.id}>
              <p className="text-sm font-medium text-slate-800">
                {qi + 1}. {q.prompt}
              </p>
              <div className="mt-1 space-y-1">
                {q.options.map((opt, oi) => {
                  const chosen = answers[q.id] === oi;
                  const isCorrect = r && r.correctIndex === oi;
                  const wrongPick = r && chosen && !r.correct;
                  return (
                    <label
                      key={oi}
                      className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-sm ${
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
                        onChange={() => setAnswers({ ...answers, [q.id]: oi })}
                      />
                      {opt}
                      {isCorrect && <span className="ml-auto text-[11px] font-semibold">correct</span>}
                    </label>
                  );
                })}
              </div>
              {r?.explanation && <p className="mt-1 text-[11px] text-slate-500">{r.explanation}</p>}
            </div>
          );
        })}
      </div>

      {!result ? (
        <button
          onClick={submit}
          disabled={busy || !allAnswered}
          className="mt-4 rounded px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          style={{ background: accent }}
        >
          {busy ? 'Checking…' : 'Submit answers'}
        </button>
      ) : (
        <div
          className={`mt-4 rounded px-3 py-2 text-sm ${
            result.passed ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'
          }`}
        >
          {result.passed
            ? 'Passed — your training for this exercise is marked complete. Well done.'
            : 'Not quite. Review the explanations above; your security lead can reassign the module.'}
        </div>
      )}
    </div>
  );
}
