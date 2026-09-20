'use client';

import { use, useEffect, useState } from 'react';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Learn {
  employeeName: string;
  completed: boolean;
  tenant: { name: string; brandLogoUrl: string | null; brandPrimaryColor: string | null } | null;
  module: { title: string; description: string | null; videoUrl: string } | null;
  quiz: {
    quizId: string;
    title: string;
    passingScorePct: number;
    questions: Array<{ id: string; prompt: string; options: string[] }>;
  } | null;
}
interface Result {
  score: number;
  total: number;
  passed: boolean;
  passingScorePct: number;
  results: Array<{ questionId: string; correct: boolean; correctIndex: number; explanation: string | null }>;
  certificateId: string | null;
  certificateEmailed?: boolean;
}

export default function LearnPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<Learn | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [doneNoQuiz, setDoneNoQuiz] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/learn/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Learn) => setData(d))
      .catch(() => setLoadError(true));
  }, [token]);

  if (loadError) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Training link not found</h1>
        <p className="mt-2 text-sm text-slate-500">This link may have expired. Ask your security lead to reassign the module.</p>
      </main>
    );
  }
  if (!data) return <main className="px-6 py-16 text-center text-sm text-slate-500">Loading…</main>;

  const accent = data.tenant?.brandPrimaryColor || '#0B7C57';
  const already = data.completed || result?.passed || doneNoQuiz;

  async function submit() {
    if (!data?.quiz) return;
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/learn/${encodeURIComponent(token)}/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quizId: data.quiz.quizId,
          answers: Object.entries(answers).map(([questionId, choice]) => ({ questionId, choice })),
        }),
      });
      if (res.ok) setResult(await res.json());
    } finally {
      setBusy(false);
    }
  }

  async function markComplete() {
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/learn/${encodeURIComponent(token)}/complete`, { method: 'POST' });
      if (res.ok) setDoneNoQuiz(true);
    } finally {
      setBusy(false);
    }
  }

  const byId = (id: string) => result?.results.find((r) => r.questionId === id);
  const allAnswered = data.quiz ? data.quiz.questions.every((q) => answers[q.id] !== undefined) : false;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-6 flex items-center gap-3">
        {data.tenant?.brandLogoUrl ? (
          <img src={data.tenant.brandLogoUrl} alt="" className="h-8 w-auto" />
        ) : (
          <span className="font-semibold text-slate-900">{data.tenant?.name ?? 'Security Awareness'}</span>
        )}
        <span className="ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: accent }}>
          Security Awareness
        </span>
      </div>

      <h1 className="text-xl font-semibold text-slate-900">Hi {data.employeeName},</h1>
      <p className="mt-1 text-sm text-slate-500">You've been assigned this short awareness module. Watch it, then take the quick check.</p>

      {data.module && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">{data.module.title}</h2>
          {data.module.description && <p className="mt-1 text-sm text-slate-500">{data.module.description}</p>}
          <div className="mt-3 overflow-hidden rounded-lg bg-black">
            <video src={data.module.videoUrl} controls className="h-auto w-full" preload="metadata">
              <a href={data.module.videoUrl}>Open the training video</a>
            </video>
          </div>
        </section>
      )}

      {already ? (
        <div className="mt-6 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: accent, color: accent }}>
          ✓ Training complete. Thank you — nothing more to do.
          {result?.certificateId &&
            (result.certificateEmailed
              ? ' Your certificate has been recorded and emailed to you.'
              : ' Your certificate has been recorded.')}
        </div>
      ) : data.quiz ? (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Knowledge check</h2>
          <p className="mt-1 text-xs text-slate-500">
            {result
              ? `You scored ${result.score}/${result.total}. Pass mark ${result.passingScorePct}%.`
              : `Answer ${data.quiz.questions.length} questions. Pass mark ${data.quiz.passingScorePct}%.`}
          </p>
          <div className="mt-3 space-y-4">
            {data.quiz.questions.map((q, qi) => {
              const r = byId(q.id);
              return (
                <div key={q.id}>
                  <p className="text-sm font-medium text-slate-800">{qi + 1}. {q.prompt}</p>
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
          {!result && (
            <button
              onClick={submit}
              disabled={busy || !allAnswered}
              className="mt-4 rounded px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              style={{ background: accent }}
            >
              {busy ? 'Checking…' : 'Submit answers'}
            </button>
          )}
          {result && !result.passed && (
            <div className="mt-4 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Not quite — review the explanations above and try again if you have attempts left.
            </div>
          )}
        </section>
      ) : (
        <button
          onClick={markComplete}
          disabled={busy}
          className="mt-6 rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: accent }}
        >
          {busy ? 'Saving…' : 'Mark as complete'}
        </button>
      )}
    </main>
  );
}
