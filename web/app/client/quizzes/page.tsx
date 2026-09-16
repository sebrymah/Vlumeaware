'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Guard, useActingTenant } from '@/components/guard';
import { Badge, Button, Card, Field, Notice, Table, inputClass } from '@/components/ui';

interface TrainingModule { id: string; title: string }
interface Campaign { id: string; name: string }
interface QuizListItem {
  id: string;
  title: string;
  passingScorePct: number;
  module: { id: string; title: string } | null;
  campaign: { id: string; name: string } | null;
  _count: { questions: number; attempts: number };
}
interface Attempt {
  id: string;
  score: number;
  total: number;
  passed: boolean;
  completedAt: string;
  employee: { name: string; email: string; department: string | null };
}
interface DraftQuestion {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

const blankQuestion = (): DraftQuestion => ({ prompt: '', options: ['', ''], correctIndex: 0, explanation: '' });

export default function QuizzesPage() {
  return (
    <Guard allow={['client_admin']}>
      <Quizzes />
    </Guard>
  );
}

function Quizzes() {
  const tenantId = useActingTenant();
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ quiz: QuizListItem; attempts: Attempt[] } | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  // new-quiz form
  const [title, setTitle] = useState('');
  const [passMark, setPassMark] = useState('70');
  const [attach, setAttach] = useState<{ type: 'module' | 'campaign'; id: string }>({ type: 'module', id: '' });
  const [questions, setQuestions] = useState<DraftQuestion[]>([blankQuestion()]);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [q, m, c] = await Promise.all([
        api.get<QuizListItem[]>(`/tenants/${tenantId}/quizzes`),
        api.get<TrainingModule[]>(`/tenants/${tenantId}/training-modules`),
        api.get<Campaign[]>(`/tenants/${tenantId}/campaigns`),
      ]);
      setQuizzes(q);
      setModules(m);
      setCampaigns(c);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  function setQ(i: number, patch: Partial<DraftQuestion>) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function setOption(qi: number, oi: number, value: string) {
    setQuestions((qs) =>
      qs.map((q, idx) => (idx === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? value : o)) } : q)),
    );
  }

  async function createQuiz(e: React.FormEvent) {
    e.preventDefault();
    if (!attach.id) {
      setError('Choose a module or campaign to attach the quiz to.');
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await api.post(`/tenants/${tenantId}/quizzes`, {
        title,
        passingScorePct: Number(passMark),
        trainingModuleId: attach.type === 'module' ? attach.id : undefined,
        campaignId: attach.type === 'campaign' ? attach.id : undefined,
        questions: questions.map((q) => ({
          prompt: q.prompt,
          options: q.options.filter((o) => o.trim().length),
          correctIndex: q.correctIndex,
          explanation: q.explanation || undefined,
        })),
      });
      setOk('Quiz created. Employees take it after the training video (or campaign).');
      setTitle('');
      setQuestions([blankQuestion()]);
      setAttach({ type: 'module', id: '' });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadCsv(quizId: string) {
    const file = csvRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.upload(`/tenants/${tenantId}/quizzes/${quizId}/questions/csv`, form);
      if (csvRef.current) csvRef.current.value = '';
      setOk('Questions replaced from CSV.');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await api.del(`/tenants/${tenantId}/quizzes/${id}`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function viewResults(quiz: QuizListItem) {
    try {
      const attempts = await api.get<Attempt[]>(`/tenants/${tenantId}/quizzes/${quiz.id}/results`);
      setResults({ quiz, attempts });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Quizzes</h1>
        <p className="mt-1 text-xs text-slate-500">
          A short assessment after a training video, or attached to a campaign. Scored automatically;
          a pass marks the employee&rsquo;s training complete.
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <Card title="Your quizzes">
        <Table head={['Title', 'Attached to', 'Questions', 'Attempts', 'Pass mark', '']}>
          {quizzes.map((q) => (
            <tr key={q.id} className="border-b border-slate-800/60">
              <td className="px-2 py-2">{q.title}</td>
              <td className="px-2 py-2 text-slate-400">
                {q.module ? `Video: ${q.module.title}` : q.campaign ? `Campaign: ${q.campaign.name}` : '—'}
              </td>
              <td className="px-2 py-2">{q._count.questions}</td>
              <td className="px-2 py-2">{q._count.attempts}</td>
              <td className="px-2 py-2">{q.passingScorePct}%</td>
              <td className="px-2 py-2">
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => viewResults(q)}>
                    Results
                  </Button>
                  <Button variant="ghost" onClick={() => remove(q.id)} disabled={busy}>
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          ))}
          {!quizzes.length && (
            <tr>
              <td colSpan={6} className="px-2 py-6 text-center text-slate-500">
                No quizzes yet.
              </td>
            </tr>
          )}
        </Table>
      </Card>

      {results && (
        <Card
          title={`Results — ${results.quiz.title}`}
          actions={<Button variant="ghost" onClick={() => setResults(null)}>Close</Button>}
        >
          <div className="mb-3 flex items-center gap-4 text-xs text-slate-400">
            <span>{results.attempts.length} attempts</span>
            <span>{results.attempts.filter((a) => a.passed).length} passed</span>
          </div>
          <Table head={['Employee', 'Department', 'Score', 'Result', 'When']}>
            {results.attempts.map((a) => (
              <tr key={a.id} className="border-b border-slate-800/60">
                <td className="px-2 py-2">{a.employee.name}</td>
                <td className="px-2 py-2 text-slate-400">{a.employee.department ?? '—'}</td>
                <td className="px-2 py-2">{a.score}/{a.total}</td>
                <td className="px-2 py-2">
                  <Badge>{a.passed ? 'yes' : 'no'}</Badge>
                </td>
                <td className="px-2 py-2 text-slate-400">{new Date(a.completedAt).toLocaleString()}</td>
              </tr>
            ))}
            {!results.attempts.length && (
              <tr>
                <td colSpan={5} className="px-2 py-4 text-center text-slate-500">
                  No attempts yet.
                </td>
              </tr>
            )}
          </Table>
          <div className="mt-4 border-t border-slate-800 pt-3">
            <Field label="Replace questions from CSV" hint="Columns: prompt, option1..optionN, correct (1-based), explanation">
              <div className="flex items-center gap-2">
                <input ref={csvRef} type="file" accept=".csv,text/csv" className="text-xs text-slate-300" />
                <Button onClick={() => uploadCsv(results.quiz.id)} disabled={busy}>
                  Upload CSV
                </Button>
              </div>
            </Field>
          </div>
        </Card>
      )}

      <Card title="Create a quiz">
        <form onSubmit={createQuiz} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Title">
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} />
            </Field>
            <Field label="Pass mark (%)">
              <input className={inputClass} type="number" min={1} max={100} value={passMark} onChange={(e) => setPassMark(e.target.value)} />
            </Field>
            <Field label="Attach to">
              <div className="flex gap-1">
                <select
                  className={inputClass}
                  value={attach.type}
                  onChange={(e) => setAttach({ type: e.target.value as 'module' | 'campaign', id: '' })}
                >
                  <option value="module">Training video</option>
                  <option value="campaign">Campaign</option>
                </select>
                <select className={inputClass} value={attach.id} onChange={(e) => setAttach({ ...attach, id: e.target.value })}>
                  <option value="">— choose —</option>
                  {(attach.type === 'module' ? modules : campaigns).map((x) => (
                    <option key={x.id} value={x.id}>
                      {'title' in x ? x.title : (x as Campaign).name}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
          </div>

          <div className="space-y-3">
            {questions.map((q, qi) => (
              <div key={qi} className="rounded border border-slate-800 bg-slate-900/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Question {qi + 1}</span>
                  {questions.length > 1 && (
                    <button
                      type="button"
                      className="text-[11px] text-slate-500 hover:text-red-300"
                      onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qi))}
                    >
                      remove
                    </button>
                  )}
                </div>
                <input
                  className={`${inputClass} mt-2`}
                  placeholder="Question prompt"
                  value={q.prompt}
                  onChange={(e) => setQ(qi, { prompt: e.target.value })}
                  required
                />
                <div className="mt-2 space-y-1">
                  {q.options.map((o, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${qi}`}
                        checked={q.correctIndex === oi}
                        onChange={() => setQ(qi, { correctIndex: oi })}
                        title="Mark as correct"
                      />
                      <input
                        className={inputClass}
                        placeholder={`Option ${oi + 1}`}
                        value={o}
                        onChange={(e) => setOption(qi, oi, e.target.value)}
                      />
                      {q.options.length > 2 && (
                        <button
                          type="button"
                          className="text-[11px] text-slate-500 hover:text-red-300"
                          onClick={() =>
                            setQ(qi, {
                              options: q.options.filter((_, j) => j !== oi),
                              correctIndex: Math.min(q.correctIndex, q.options.length - 2),
                            })
                          }
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    className="text-[11px] text-emerald-400 hover:underline"
                    onClick={() => setQ(qi, { options: [...q.options, ''] })}
                  >
                    + add option
                  </button>
                  <span className="text-[11px] text-slate-500">Select the radio next to the correct answer.</span>
                </div>
                <input
                  className={`${inputClass} mt-2`}
                  placeholder="Explanation shown after answering (optional)"
                  value={q.explanation}
                  onChange={(e) => setQ(qi, { explanation: e.target.value })}
                />
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setQuestions((qs) => [...qs, blankQuestion()])}>
              + Add question
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Create quiz'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
