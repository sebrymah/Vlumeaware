'use client';

import { useEffect, useState } from 'react';
import { LearnerQuiz } from '@/components/learner-quiz';
import type { LearnerQuizData, LearnerQuizResult } from '@/components/learner-quiz';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface QuizPayload extends LearnerQuizData {
  quizId: string;
}

/**
 * Post-reveal knowledge check. Fetches the quiz for this token (without the
 * answers), submits the employee's choices for server-side scoring, and shows
 * per-question feedback. A pass marks their training complete.
 *
 * The markup lives in `LearnerQuiz` so this and the training page cannot drift.
 */
export function Quiz({ token, accent }: { token: string; accent: string }) {
  const [quiz, setQuiz] = useState<QuizPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<LearnerQuizResult | null>(null);
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

  return (
    <LearnerQuiz
      quiz={quiz}
      accent={accent}
      answers={answers}
      onAnswer={(questionId, choice) => setAnswers({ ...answers, [questionId]: choice })}
      result={result}
      busy={busy}
      onSubmit={submit}
      heading="Quick knowledge check"
      failMessage="Not quite. Review the explanations above; your security lead can reassign the module."
    />
  );
}
