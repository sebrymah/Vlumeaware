'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Guard, useActingTenant } from '@/components/guard';
import { Badge, Button, Card, Field, Notice, Table, inputClass } from '@/components/ui';
import { RichEditor } from '@/components/rich-editor';

interface Scenario {
  id: string;
  title: string;
  difficultyTier: string;
  industryTag: string | null;
  subjectLine: string;
  bodyHtml: string;
  senderSpoofName: string;
  redFlags: string[];
  createdByClaude: boolean;
  approvedAt: string | null;
}

interface Draft {
  title: string;
  subjectLine: string;
  bodyHtml: string;
  senderSpoofName: string;
  redFlags: string[];
}

export default function ScenariosPage() {
  return (
    <Guard allow={['client_admin']}>
      <Scenarios />
    </Guard>
  );
}

function Scenarios() {
  const tenantId = useActingTenant();
  const [list, setList] = useState<Scenario[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [industry, setIndustry] = useState('agriculture / FMCG');
  const [tier, setTier] = useState<'low' | 'medium' | 'high'>('medium');
  const [context, setContext] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mode, setMode] = useState<'generate' | 'compose'>('generate');

  function startBlankDraft() {
    setMode('compose');
    setDraft({
      title: '',
      subjectLine: '',
      bodyHtml:
        '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">\n  <p>Dear {{EMPLOYEE_NAME}},</p>\n  <p>Your message here.</p>\n  <p><a href="{{TRACKING_URL}}">Click here</a></p>\n</div>',
      senderSpoofName: '',
      redFlags: [],
    });
  }

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      setList(await api.get<Scenario[]>(`/tenants/${tenantId}/scenarios`));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await api.post<Draft>(`/tenants/${tenantId}/scenarios/generate`, {
        industry,
        difficultyTier: tier,
        context: context || undefined,
      });
      setDraft(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/tenants/${tenantId}/scenarios`, {
        ...draft,
        difficultyTier: tier,
        industryTag: industry,
        createdByClaude: mode === 'generate',
      });
      setDraft(null);
      setOk('Saved to your template library. It needs Vlumetech approval before use.');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Scenario library</h1>
        <p className="mt-1 text-xs text-slate-500">
          Pretexts grounded in Nigerian business patterns. Drafts are reviewed and edited before
          they are saved, and approved before they can be sent.
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <div className="flex gap-2">
        <Button variant={mode === 'generate' ? 'primary' : 'ghost'} onClick={() => setMode('generate')}>
          Generate with Claude
        </Button>
        <Button variant={mode === 'compose' ? 'primary' : 'ghost'} onClick={startBlankDraft}>
          Compose manually
        </Button>
        <a
          href="/client/templates"
          className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400"
        >
          Browse template library
        </a>
      </div>

      {mode === 'generate' && (
      <Card title="Generate a draft" subtitle="Claude drafts the pretext; you edit and keep control.">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <Field label="Client industry">
              <input className={inputClass} value={industry} onChange={(e) => setIndustry(e.target.value)} />
            </Field>
          </div>
          <div className="w-32">
            <Field label="Difficulty">
              <select
                className={inputClass}
                value={tier}
                onChange={(e) => setTier(e.target.value as 'low' | 'medium' | 'high')}
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </Field>
          </div>
          <div className="flex-1 min-w-[16rem]">
            <Field label="Extra context (optional)" hint="e.g. payroll runs on the 25th; vendor is a fertiliser supplier">
              <input className={inputClass} value={context} onChange={(e) => setContext(e.target.value)} />
            </Field>
          </div>
          <Button onClick={generate} disabled={busy}>
            {busy ? 'Generating…' : 'Generate draft'}
          </Button>
        </div>
      </Card>

      )}

      {draft && (
        <Card
          title="Review draft"
          subtitle="Edit anything before saving. Keep {{TRACKING_URL}} in the body — it becomes the tracked link."
          actions={
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Discard
              </Button>
              <Button onClick={save} disabled={busy || !draft.bodyHtml.includes('{{TRACKING_URL}}')}>
                Save to library
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title">
                <input
                  className={inputClass}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </Field>
              <Field label="Spoofed sender name">
                <input
                  className={inputClass}
                  value={draft.senderSpoofName}
                  onChange={(e) => setDraft({ ...draft, senderSpoofName: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Subject line">
              <input
                className={inputClass}
                value={draft.subjectLine}
                onChange={(e) => setDraft({ ...draft, subjectLine: e.target.value })}
              />
            </Field>
            <Field label="Email body" hint="Compose visually, or switch to HTML. Use the buttons to insert the tracked link.">
              <RichEditor
                value={draft.bodyHtml}
                onChange={(html) => setDraft({ ...draft, bodyHtml: html })}
              />
            </Field>
            <Field label="Red flags" hint="Shown to the employee on the teachable-moment page. One per line.">
              <textarea
                className={`${inputClass} h-24`}
                value={draft.redFlags.join('\n')}
                onChange={(e) =>
                  setDraft({ ...draft, redFlags: e.target.value.split('\n').filter(Boolean) })
                }
              />
            </Field>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Preview</p>
              <div
                className="rounded border border-slate-300 bg-white p-3 text-black"
                dangerouslySetInnerHTML={{
                  __html: draft.bodyHtml
                    .split('{{TRACKING_URL}}')
                    .join('#')
                    .split('{{EMPLOYEE_NAME}}')
                    .join('Amina Bello'),
                }}
              />
            </div>
          </div>
        </Card>
      )}

      <Card title="Saved scenarios">
        <Table head={['Title', 'Tier', 'Subject', 'Source', 'Approved']}>
          {list.map((s) => (
            <tr key={s.id} className="border-b border-slate-100">
              <td className="px-2 py-2">{s.title}</td>
              <td className="px-2 py-2">
                <Badge>{s.difficultyTier}</Badge>
              </td>
              <td className="px-2 py-2 text-slate-500">{s.subjectLine}</td>
              <td className="px-2 py-2 text-slate-500">{s.createdByClaude ? 'Claude draft' : 'manual'}</td>
              <td className="px-2 py-2">
                <Badge>{s.approvedAt ? 'yes' : 'no'}</Badge>
              </td>
            </tr>
          ))}
          {!list.length && (
            <tr>
              <td colSpan={5} className="px-2 py-6 text-center text-slate-500">
                Nothing saved yet.
              </td>
            </tr>
          )}
        </Table>
      </Card>
    </div>
  );
}
