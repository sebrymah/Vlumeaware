'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Guard } from '@/components/guard';
import { Badge, Button, Card, EmptyState, Field, Notice, Table, inputClass } from '@/components/ui';
import { Icon } from '@/components/icons';

interface Question {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

interface SharedQuiz {
  id: string;
  title: string;
  category: string | null;
  passingScorePct: number;
  source: string | null;
  questions: Question[];
  createdAt: string;
}

export default function QuizLibraryPage() {
  return (
    <Guard allow={['vlumetech_superadmin']}>
      <QuizLibrary />
    </Guard>
  );
}

const SAMPLE = `[
  {
    "prompt": "Question text?",
    "options": ["Option A", "Option B", "Option C"],
    "correctIndex": 1,
    "explanation": "Why B is correct."
  }
]`;

function QuizLibrary() {
  const [list, setList] = useState<SharedQuiz[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<SharedQuiz | null>(null);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [passing, setPassing] = useState('80');
  const [questionsJson, setQuestionsJson] = useState('');

  const load = useCallback(async () => {
    try {
      setList(await api.get<SharedQuiz[]>('/shared-quizzes'));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      let questions: Question[];
      try {
        questions = JSON.parse(questionsJson);
      } catch {
        setError('Questions must be valid JSON. Use the sample format shown below.');
        setBusy(false);
        return;
      }
      if (!Array.isArray(questions) || questions.length === 0) {
        setError('Provide at least one question in the JSON array.');
        setBusy(false);
        return;
      }
      await api.post('/shared-quizzes', {
        title,
        category: category || undefined,
        passingScorePct: passing ? Number(passing) : undefined,
        source: 'custom',
        questions,
      });
      setOk('Published to the shared quiz library. Every client can now clone it.');
      setTitle('');
      setCategory('');
      setPassing('80');
      setQuestionsJson('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this shared quiz? Clients that already cloned it keep their copy.')) return;
    setBusy(true);
    try {
      await api.del(`/shared-quizzes/${id}`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 rounded-xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white p-5">
        <div className="rounded-lg bg-brand-100 p-2 text-brand-600">
          <Icon name="grad" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Shared quiz library</h1>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">
            Curated knowledge-check quizzes available to every client. A client admin clones one from
            their Quizzes page and attaches it to a training module.
          </p>
        </div>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <Card title="Publish a quiz">
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Title">
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} />
            </Field>
            <Field label="Category (optional)">
              <input className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Phishing" />
            </Field>
            <Field label="Passing score %">
              <input className={inputClass} type="number" min={1} max={100} value={passing} onChange={(e) => setPassing(e.target.value)} />
            </Field>
          </div>
          <Field label="Questions (JSON)" hint="An array of questions. correctIndex is zero-based.">
            <textarea
              className={`${inputClass} font-mono text-xs`}
              rows={8}
              value={questionsJson}
              onChange={(e) => setQuestionsJson(e.target.value)}
              placeholder={SAMPLE}
              required
            />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? 'Publishing…' : 'Publish to quiz library'}
          </Button>
        </form>
      </Card>

      <Card title={`Shared quizzes (${list.length})`}>
        {list.length === 0 ? (
          <EmptyState
            icon={<Icon name="grad" />}
            title="No shared quizzes yet"
            hint="Publish a quiz above and every client will be able to clone it onto their own training modules."
          />
        ) : (
          <Table head={['Title', 'Category', 'Questions', 'Pass %', '']}>
            {list.map((z) => (
              <tr key={z.id} className="border-b border-slate-100">
                <td className="px-2 py-2">
                  {z.title}
                  {z.source && <div className="text-[11px] text-slate-400">{z.source}</div>}
                </td>
                <td className="px-2 py-2 text-slate-500">{z.category ?? '—'}</td>
                <td className="px-2 py-2">{z.questions?.length ?? 0}</td>
                <td className="px-2 py-2">{z.passingScorePct}%</td>
                <td className="px-2 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" onClick={() => setPreview(z)}>
                      Preview
                    </Button>
                    <Button variant="ghost" onClick={() => remove(z.id)} disabled={busy}>
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setPreview(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{preview.title}</h3>
                <p className="text-[11px] text-slate-500">
                  {preview.category ?? 'General'} · pass mark {preview.passingScorePct}%
                </p>
              </div>
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Close
              </Button>
            </div>
            <ol className="mt-4 space-y-4">
              {preview.questions.map((q, i) => (
                <li key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[13px] font-medium text-slate-900">
                    {i + 1}. {q.prompt}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {q.options.map((opt, oi) => (
                      <li
                        key={oi}
                        className={`flex items-center gap-2 text-[12px] ${
                          oi === q.correctIndex ? 'font-medium text-brand-700' : 'text-slate-600'
                        }`}
                      >
                        {oi === q.correctIndex ? <Icon name="check" className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5" />}
                        {opt}
                      </li>
                    ))}
                  </ul>
                  {q.explanation && <p className="mt-2 text-[11px] text-slate-500">{q.explanation}</p>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
