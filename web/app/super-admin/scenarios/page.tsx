'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Guard } from '@/components/guard';
import { Badge, Button, Card, EmptyState, Field, Notice, inputClass } from '@/components/ui';
import { Icon } from '@/components/icons';

type Tier = 'low' | 'medium' | 'high';

interface Template {
  id: string;
  title: string;
  category: string;
  difficultyTier: Tier;
  industryTag: string | null;
  subjectLine: string;
  bodyHtml: string;
  senderSpoofName: string;
  redFlags: string[];
  source: string;
}

const blank = () => ({
  title: '',
  category: '',
  difficultyTier: 'medium' as Tier,
  industryTag: '',
  subjectLine: '',
  senderSpoofName: '',
  bodyHtml: '',
  redFlags: '',
});

export default function SuperScenariosPage() {
  return (
    <Guard allow={['vlumetech_superadmin']}>
      <Scenarios />
    </Guard>
  );
}

function renderBody(html: string) {
  return html.split('{{TRACKING_URL}}').join('#').split('{{EMPLOYEE_NAME}}').join('Amina Bello');
}

function Scenarios() {
  const [list, setList] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(blank());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Template | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await api.get<Template[]>('/phishing-templates'));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function set<K extends keyof ReturnType<typeof blank>>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function startEdit(t: Template) {
    setEditingId(t.id);
    setForm({
      title: t.title,
      category: t.category,
      difficultyTier: t.difficultyTier,
      industryTag: t.industryTag ?? '',
      subjectLine: t.subjectLine,
      senderSpoofName: t.senderSpoofName,
      bodyHtml: t.bodyHtml,
      redFlags: t.redFlags.join('\n'),
    });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(blank());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    const payload = {
      title: form.title,
      category: form.category,
      difficultyTier: form.difficultyTier,
      industryTag: form.industryTag || undefined,
      subjectLine: form.subjectLine,
      senderSpoofName: form.senderSpoofName,
      bodyHtml: form.bodyHtml,
      redFlags: form.redFlags
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8),
    };
    try {
      if (editingId) {
        await api.patch(`/phishing-templates/${editingId}`, payload);
        setOk('Scenario updated in the catalogue.');
      } else {
        await api.post('/phishing-templates', payload);
        setOk('Scenario added to the catalogue. Every client can now clone it.');
      }
      cancelEdit();
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: Template) {
    if (!confirm(`Delete "${t.title}" from the catalogue? Clients that already cloned it keep their copy.`)) return;
    setBusy(true);
    try {
      await api.del(`/phishing-templates/${t.id}`);
      if (editingId === t.id) cancelEdit();
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, Template[]>();
    for (const t of list) {
      const arr = map.get(t.category) ?? [];
      arr.push(t);
      map.set(t.category, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [list]);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 rounded-xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white p-5">
        <div className="rounded-lg bg-brand-100 p-2 text-brand-600">
          <Icon name="hook" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Scenario catalogue</h1>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">
            The global library of phishing scenarios. Anything you add here is available to every
            client to clone into their own library. Use {'{{EMPLOYEE_NAME}}'} and {'{{TRACKING_URL}}'}{' '}
            in the body — they are filled in when the email is sent.
          </p>
        </div>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <Card title={editingId ? 'Edit scenario' : 'Add a scenario'}>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Title">
              <input className={inputClass} value={form.title} onChange={(e) => set('title', e.target.value)} required minLength={2} />
            </Field>
            <Field label="Category">
              <input className={inputClass} value={form.category} onChange={(e) => set('category', e.target.value)} required placeholder="Phishing" />
            </Field>
            <Field label="Difficulty">
              <select className={inputClass} value={form.difficultyTier} onChange={(e) => set('difficultyTier', e.target.value)}>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </Field>
            <Field label="Industry (optional)">
              <input className={inputClass} value={form.industryTag} onChange={(e) => set('industryTag', e.target.value)} placeholder="General" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Spoofed sender name">
              <input className={inputClass} value={form.senderSpoofName} onChange={(e) => set('senderSpoofName', e.target.value)} required placeholder="IT Service Desk" />
            </Field>
            <Field label="Subject line">
              <input className={inputClass} value={form.subjectLine} onChange={(e) => set('subjectLine', e.target.value)} required />
            </Field>
          </div>
          <Field label="Email body (HTML)" hint="Use {{EMPLOYEE_NAME}} and {{TRACKING_URL}} placeholders.">
            <textarea
              className={`${inputClass} font-mono text-xs`}
              rows={6}
              value={form.bodyHtml}
              onChange={(e) => set('bodyHtml', e.target.value)}
              required
              placeholder="<p>Dear {{EMPLOYEE_NAME}},</p><p>…</p><p><a href=&quot;{{TRACKING_URL}}&quot;>Click here</a></p>"
            />
          </Field>
          <Field label="Red flags taught" hint="One per line — what the teachable moment explains back to the employee.">
            <textarea
              className={`${inputClass} text-xs`}
              rows={4}
              value={form.redFlags}
              onChange={(e) => set('redFlags', e.target.value)}
              placeholder={'Creates urgency\nGeneric sender\nAsks you to sign in via a link'}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : editingId ? 'Save changes' : 'Add to catalogue'}
            </Button>
            {editingId && (
              <Button variant="ghost" onClick={cancelEdit} disabled={busy}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      {list.length === 0 ? (
        <Card title="Catalogue">
          <EmptyState icon={<Icon name="hook" />} title="No scenarios yet" hint="Add your first scenario above." />
        </Card>
      ) : (
        grouped.map(([cat, items]) => (
          <Card key={cat} title={`${cat} (${items.length})`}>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((t) => (
                <div key={t.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{t.title}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        From {t.senderSpoofName} · “{t.subjectLine}”
                      </div>
                    </div>
                    <Badge>{t.difficultyTier}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="ghost" onClick={() => setPreview(t)}>
                      Preview
                    </Button>
                    <Button variant="ghost" onClick={() => startEdit(t)}>
                      Edit
                    </Button>
                    <Button variant="danger" onClick={() => remove(t)} disabled={busy}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => setPreview(null)}>
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{preview.title}</h3>
                <p className="text-[11px] text-slate-500">
                  {preview.category} · {preview.difficultyTier}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Close
              </Button>
            </div>
            <p className="mt-3 text-[11px] text-slate-500">
              From {preview.senderSpoofName} · Subject: {preview.subjectLine}
            </p>
            <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-black" dangerouslySetInnerHTML={{ __html: renderBody(preview.bodyHtml) }} />
            <h4 className="mt-4 text-xs font-semibold text-slate-600">Red flags taught</h4>
            <ul className="mt-1 space-y-1">
              {preview.redFlags.map((f) => (
                <li key={f} className="text-[11px] text-slate-500">
                  • {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
