'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { LearnerQuiz } from '@/components/learner-quiz';
import type { LearnerQuizResult } from '@/components/learner-quiz';
import { useRouter } from 'next/navigation';

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
// The shared result shape, plus the two fields only this page's endpoint returns.
interface Result extends LearnerQuizResult {
  certificateId: string | null;
  certificateEmailed?: boolean;
}

/** Pulls the API's explanation out of an error response. */
async function messageFrom(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    if (message) return String(message);
  } catch {
    /* non-JSON error body */
  }
  return `Something went wrong (HTTP ${res.status}). Please try again.`;
}

export default function LearnPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<Learn | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [doneNoQuiz, setDoneNoQuiz] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const router = useRouter();

  const completeHref = useCallback(
    (emailed?: boolean) =>
      `/learn/${encodeURIComponent(token)}/complete${emailed ? '?emailed=1' : ''}`,
    [token],
  );

  useEffect(() => {
    fetch(`${BASE}/learn/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Learn) => setData(d))
      .catch(() => setLoadError(true));
  }, [token]);

  // Someone returning to a finished assignment belongs on the completion page,
  // not back on the quiz.
  const alreadyCompleted = data?.completed ?? false;
  useEffect(() => {
    if (alreadyCompleted) router.replace(completeHref());
  }, [alreadyCompleted, completeHref, router]);

  if (loadError) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Training link not found</h1>
        <p className="mt-2 text-base text-slate-500">This link may have expired. Ask your security lead to reassign the module.</p>
      </main>
    );
  }
  if (!data) return <main className="px-6 py-16 text-center text-base text-slate-500">Loading…</main>;

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
      if (res.ok) {
        const body: Result = await res.json();
        setResult(body);
        if (body.passed) router.push(completeHref(body.certificateEmailed));
        return;
      }
      // The API explains its refusals — "You have already passed this quiz." —
      // and discarding that left the button looking simply dead.
      setSubmitError(await messageFrom(res));
    } finally {
      setBusy(false);
    }
  }

  async function markComplete() {
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/learn/${encodeURIComponent(token)}/complete`, { method: 'POST' });
      if (res.ok) {
        setDoneNoQuiz(true);
        router.push(completeHref());
        return;
      }
      setSubmitError(await messageFrom(res));
    } finally {
      setBusy(false);
    }
  }


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

      <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Hi {data.employeeName},</h1>
      <p className="mt-1 text-base text-slate-500">You've been assigned this short awareness module. Watch it, then take the quick check.</p>

      {data.module && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-slate-900">{data.module.title}</h2>
          {data.module.description && <p className="mt-1 text-base text-slate-500">{data.module.description}</p>}
          <div className="mt-3 overflow-hidden rounded-lg bg-black">
            <video src={data.module.videoUrl} controls className="h-auto w-full" preload="metadata">
              <a href={data.module.videoUrl}>Open the training video</a>
            </video>
          </div>
        </section>
      )}

      {submitError && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700">
          {submitError}
        </div>
      )}

      {already ? (
        <div className="mt-6 rounded-xl border px-4 py-3 text-base" style={{ borderColor: accent, color: accent }}>
          ✓ Training complete — taking you to your certificate…
        </div>
      ) : data.quiz ? (
        <LearnerQuiz
            quiz={data.quiz}
            accent={accent}
            answers={answers}
            onAnswer={(questionId, choice) => setAnswers({ ...answers, [questionId]: choice })}
            result={result}
            busy={busy}
            onSubmit={submit}
            submitError={submitError}
            heading="Knowledge check"
            passMessage="Passed — taking you to your certificate…"
            failMessage="Not quite — review the explanations above and try again if you have attempts left."
          />
      ) : (
        <button
          onClick={markComplete}
          disabled={busy}
          className="mt-6 w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 sm:w-auto"
          style={{ background: accent }}
        >
          {busy ? 'Saving…' : 'Mark as complete'}
        </button>
      )}
    </main>
  );
}
