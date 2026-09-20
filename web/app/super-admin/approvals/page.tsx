'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Guard } from '@/components/guard';
import { Badge, Button, Card, EmptyState, Notice } from '@/components/ui';
import { Icon } from '@/components/icons';

interface PendingScenario {
  id: string;
  title: string;
  difficultyTier: 'low' | 'medium' | 'high';
  industryTag: string | null;
  subjectLine: string;
  bodyHtml: string;
  senderSpoofName: string;
  redFlags: string[];
  createdByClaude: boolean;
  createdAt: string;
  tenant: { id: string; name: string };
}

export default function ApprovalsPage() {
  return (
    <Guard allow={['vlumetech_superadmin']}>
      <Approvals />
    </Guard>
  );
}

function renderBody(html: string) {
  return html
    .split('{{TRACKING_URL}}')
    .join('#')
    .split('{{EMPLOYEE_NAME}}')
    .join('Amina Bello');
}

function Approvals() {
  const [list, setList] = useState<PendingScenario[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<PendingScenario | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await api.get<PendingScenario[]>('/admin/scenarios/pending'));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(s: PendingScenario) {
    setBusy(s.id);
    setError(null);
    setOk(null);
    try {
      await api.post(`/admin/scenarios/${s.id}/approve`);
      setOk(`Approved "${s.title}" for ${s.tenant.name}. It can now be attached to a campaign.`);
      setPreview(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function reject(s: PendingScenario) {
    if (!confirm(`Reject "${s.title}"? The draft will be removed from ${s.tenant.name}'s library.`)) {
      return;
    }
    setBusy(s.id);
    setError(null);
    setOk(null);
    try {
      await api.post(`/admin/scenarios/${s.id}/reject`);
      setOk(`Rejected "${s.title}".`);
      setPreview(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 rounded-xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white p-5">
        <div className="rounded-lg bg-brand-100 p-2 text-brand-600">
          <Icon name="check" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Scenario approvals</h1>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">
            Every phishing scenario a client creates — whether written by hand or generated with
            the Vlumeaware AI assistant — waits here for Vlumetech review before it can go out to their employees. Read
            the email as the employee will see it, then approve or reject.
          </p>
        </div>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <Card title={`Waiting for review (${list.length})`}>
        {list.length === 0 ? (
          <EmptyState
            icon={<Icon name="check" />}
            title="Nothing waiting for review"
            hint="When a client drafts or generates a new phishing scenario, it shows up here for approval."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {list.map((s) => (
              <div key={s.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{s.title}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Icon name="building" />
                      {s.tenant.name}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge>{s.difficultyTier}</Badge>
                    {s.createdByClaude && <Badge>ai-drafted</Badge>}
                  </div>
                </div>
                <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 p-2 text-[11px] text-slate-500">
                  From <span className="text-slate-700">{s.senderSpoofName}</span> · “{s.subjectLine}”
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={() => setPreview(s)}>
                    Preview email
                  </Button>
                  <Button onClick={() => approve(s)} disabled={busy === s.id}>
                    {busy === s.id ? 'Working…' : 'Approve'}
                  </Button>
                  <Button variant="danger" onClick={() => reject(s)} disabled={busy === s.id}>
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
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
                  {preview.tenant.name} · {preview.difficultyTier}
                  {preview.industryTag ? ` · ${preview.industryTag}` : ''}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Close
              </Button>
            </div>
            <p className="mt-3 text-[11px] text-slate-500">
              From {preview.senderSpoofName} · Subject: {preview.subjectLine}
            </p>
            <div
              className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-black"
              dangerouslySetInnerHTML={{ __html: renderBody(preview.bodyHtml) }}
            />
            <h4 className="mt-4 text-xs font-semibold text-slate-600">Red flags taught</h4>
            <ul className="mt-1 space-y-1">
              {preview.redFlags.map((f) => (
                <li key={f} className="text-[11px] text-slate-500">
                  • {f}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex gap-2">
              <Button onClick={() => approve(preview)} disabled={busy === preview.id}>
                {busy === preview.id ? 'Working…' : 'Approve for this client'}
              </Button>
              <Button variant="danger" onClick={() => reject(preview)} disabled={busy === preview.id}>
                Reject
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
