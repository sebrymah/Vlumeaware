'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Guard, useActingTenant } from '@/components/guard';
import { ReadinessChecklist } from '@/components/readiness';
import { Badge, Button, Card, Field, Notice, Table, inputClass } from '@/components/ui';

interface Scenario {
  id: string;
  title: string;
  difficultyTier: string;
}

interface SendingDomain {
  id: string;
  domain: string;
  managed?: boolean;
}

interface Employee {
  id: string;
  name: string;
  email: string;
  department: string | null;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  campaignScenarios: Array<{ scenario: { id: string; title: string } }>;
}

export default function AdminCampaignsPage() {
  return (
    <Guard allow={['client_admin']}>
      <Campaigns />
    </Guard>
  );
}

function Campaigns() {
  const tenantId = useActingTenant();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [recipientMode, setRecipientMode] = useState<'all' | 'selected'>('all');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [scheduledSendAt, setScheduledSendAt] = useState('');
  const [sendWindowMinutes, setSendWindowMinutes] = useState('0');
  const [recurrenceDays, setRecurrenceDays] = useState('');
  const [sendingDomains, setSendingDomains] = useState<SendingDomain[]>([]);
  const [sendingDomainId, setSendingDomainId] = useState('');
  const [fromLocalPart, setFromLocalPart] = useState('no-reply');
  const [senderName, setSenderName] = useState('');
  const [landingTemplate, setLandingTemplate] = useState('generic');
  const [landingPages, setLandingPages] = useState<{ id: string; name: string }[]>([]);
  const [landingHtml, setLandingHtml] = useState('');
  const [landingPageName, setLandingPageName] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [blocked, setBlocked] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [c, s, emp, sd, lp] = await Promise.all([
        api.get<Campaign[]>(`/tenants/${tenantId}/campaigns`),
        api.get<Scenario[]>(`/tenants/${tenantId}/scenarios`),
        api.get<Employee[]>(`/tenants/${tenantId}/employees`),
        api.get<SendingDomain[]>(`/tenants/${tenantId}/sending-domains/verified`),
        api.get<{ id: string; name: string }[]>(`/tenants/${tenantId}/landing-pages`).catch(() => []),
      ]);
      setCampaigns(c);
      setScenarios(s);
      setEmployees(emp);
      setSendingDomains(sd);
      setLandingPages(lp);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Checks the gates before asking the server to launch. The server enforces
   * them too — this only means the reason lands next to the button instead of
   * as a rejection after the fact.
   */
  async function checkThenLaunch(campaignId: string) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const pre = await api.get<{ ready: boolean; checks: { label: string; ok: boolean; detail?: string }[] }>(
        `/tenants/${tenantId}/campaigns/${campaignId}/preflight`,
      );
      if (!pre.ready) {
        setBlocked((b) => ({
          ...b,
          [campaignId]: pre.checks
            .filter((c) => !c.ok)
            .map((c) => (c.detail ? `${c.label} (${c.detail})` : c.label)),
        }));
        setBusy(false);
        return;
      }
      setBlocked((b) => {
        const next = { ...b };
        delete next[campaignId];
        return next;
      });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      return;
    }
    setBusy(false);
    await act(campaignId, 'launch');
  }

  async function act(campaignId: string, action: 'launch' | 'pause' | 'resume' | 'kill') {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await api.post<Record<string, unknown>>(
        `/tenants/${tenantId}/campaigns/${campaignId}/${action}`,
      );
      setOk(
        action === 'launch' || action === 'resume'
          ? `Campaign ${action}ed — ${res.queued} sends queued.`
          : action === 'kill'
            ? `Campaign halted. ${res.removedJobs} queued sends removed.`
            : 'Campaign paused.',
      );
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Turn the single landing-page selector value into the right payload: a
  // built-in template, an already-saved custom page, or HTML to build one now.
  function landingPayload(): Record<string, unknown> {
    if (landingTemplate.startsWith('page:')) return { landingPageId: landingTemplate.slice(5) };
    if (landingTemplate === 'custom') {
      return { landingHtml: landingHtml.trim() || undefined, landingPageName: landingPageName.trim() || undefined };
    }
    return { landingTemplate };
  }

  // Sanitize and show the custom page exactly as a target would see it, with
  // the metadata-only form injected — without saving anything.
  async function previewLanding() {
    setPreviewBusy(true);
    setError(null);
    try {
      const res = await api.post<{ html: string }>(`/tenants/${tenantId}/landing-pages/preview`, {
        html: landingHtml,
      });
      setPreviewHtml(res.html);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPreviewBusy(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (landingTemplate === 'custom' && !landingHtml.trim()) {
      setError('Add some HTML for the custom landing page, or pick a different landing option.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/tenants/${tenantId}/campaigns`, {
        name,
        scenarioIds: selected,
        employeeIds: recipientMode === 'selected' ? recipients : undefined,
        scheduledSendAt: scheduledSendAt ? new Date(scheduledSendAt).toISOString() : undefined,
        sendWindowMinutes: Number(sendWindowMinutes) || 0,
        recurrenceDays: recurrenceDays ? Number(recurrenceDays) : undefined,
        sendingDomainId: sendingDomainId || undefined,
        fromLocalPart: fromLocalPart.trim() || undefined,
        senderName: senderName.trim() || undefined,
        ...landingPayload(),
      });
      setName('');
      setSelected([]);
      setRecipientMode('all');
      setRecipients([]);
      setScheduledSendAt('');
      setSendWindowMinutes('0');
      setRecurrenceDays('');
      setSendingDomainId('');
      setFromLocalPart('no-reply');
      setSenderName('');
      setLandingTemplate('generic');
      setLandingHtml('');
      setLandingPageName('');
      setOk(
        scheduledSendAt
          ? 'Campaign scheduled. It will auto-launch at the set time.'
          : 'Campaign created as a draft. Launch it when you are ready to send.',
      );
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
        <h1 className="text-lg font-semibold text-slate-900">Campaigns</h1>
        <p className="mt-1 text-xs text-slate-500">
          Authorized simulations against your employee roster. Every campaign can be halted in one
          action.
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <ReadinessChecklist tenantId={tenantId} />

      <Card title="Your campaigns">
        <Table head={['Campaign', 'Scenarios', 'Status', 'Created', 'Actions']}>
          {campaigns.map((c) => (
            <tr key={c.id} className="border-b border-slate-100 align-top">
              <td className="px-2 py-2">
                <Link href={`/client/campaigns/${c.id}`} className="text-brand-600 hover:underline">
                  {c.name}
                </Link>
                {blocked[c.id] && (
                  <div className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-800">
                    <p className="font-semibold">Not ready to launch</p>
                    <ul className="mt-0.5 list-disc pl-4">
                      {blocked[c.id].map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </td>
              <td className="px-2 py-2 text-slate-500">
                {c.campaignScenarios.map((cs) => cs.scenario.title).join(', ') || '—'}
              </td>
              <td className="px-2 py-2">
                <Badge>{c.status}</Badge>
              </td>
              <td className="px-2 py-2">{new Date(c.createdAt).toLocaleDateString()}</td>
              <td className="px-2 py-2">
                <div className="flex justify-end gap-2">
                  {c.status === 'draft' && (
                    <Button onClick={() => void checkThenLaunch(c.id)} disabled={busy}>
                      Launch
                    </Button>
                  )}
                  {c.status === 'active' && (
                    <>
                      <Button variant="ghost" onClick={() => act(c.id, 'pause')} disabled={busy}>
                        Pause
                      </Button>
                      <Button variant="danger" onClick={() => act(c.id, 'kill')} disabled={busy}>
                        Kill
                      </Button>
                    </>
                  )}
                  {c.status === 'paused' && (
                    <>
                      <Button onClick={() => act(c.id, 'resume')} disabled={busy}>
                        Resume
                      </Button>
                      <Button variant="danger" onClick={() => act(c.id, 'kill')} disabled={busy}>
                        Kill
                      </Button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {!campaigns.length && (
            <tr>
              <td colSpan={5} className="px-2 py-6 text-center text-slate-500">
                No campaigns yet.
              </td>
            </tr>
          )}
        </Table>
      </Card>

      <Card
        title="Create a campaign"
        subtitle="Attach one or more scenarios, choose who receives them, and launch when ready."
      >
        {!scenarios.length ? (
          <Notice kind="info">
            No scenarios yet. Create one under Scenarios, or add one from the shared library.
          </Notice>
        ) : (
          <form onSubmit={create} className="space-y-4">
            <div className="w-80">
              <Field label="Campaign name">
                <input
                  className={inputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Q4 2026 baseline"
                  required
                  minLength={2}
                />
              </Field>
            </div>
            <Field label="Scenarios">
              <div className="space-y-1">
                {scenarios.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={selected.includes(s.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, s.id]
                            : selected.filter((id) => id !== s.id),
                        )
                      }
                    />
                    {s.title}
                    <Badge>{s.difficultyTier}</Badge>
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Recipients">
              <div className="space-y-2">
                <div className="flex gap-4 text-xs text-slate-600">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="recipientMode"
                      checked={recipientMode === 'all'}
                      onChange={() => setRecipientMode('all')}
                    />
                    All staff ({employees.length})
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="recipientMode"
                      checked={recipientMode === 'selected'}
                      onChange={() => setRecipientMode('selected')}
                    />
                    Selected staff
                  </label>
                </div>
                {recipientMode === 'selected' && (
                  <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                    {employees.length === 0 && (
                      <p className="px-1 py-2 text-[11px] text-slate-500">No employees on the roster yet — add them under People → Employees.</p>
                    )}
                    {employees.map((emp) => (
                      <label key={emp.id} className="flex items-center gap-2 px-1 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={recipients.includes(emp.id)}
                          onChange={(e) =>
                            setRecipients(
                              e.target.checked
                                ? [...recipients, emp.id]
                                : recipients.filter((id) => id !== emp.id),
                            )
                          }
                        />
                        <span className="font-medium text-slate-700">{emp.name}</span>
                        <span className="text-slate-400">{emp.email}</span>
                        {emp.department && <Badge>{emp.department}</Badge>}
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-slate-400">
                  {recipientMode === 'all'
                    ? 'The simulation goes to everyone on your roster (verified domains only).'
                    : `${recipients.length} selected.`}
                </p>
              </div>
            </Field>

            <Field
              label="Send from"
              hint="Which of your verified domains this campaign appears to come from."
            >
              {sendingDomains.length === 0 ? (
                <Notice kind="info">
                  No sending domain yet. Under People → Sending domains, enable the Vlumeaware shared
                  domain (no setup) or verify one you own, then it appears here. You can still save
                  this campaign as a draft.
                </Notice>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-40">
                    <input
                      className={inputClass}
                      value={fromLocalPart}
                      onChange={(e) => setFromLocalPart(e.target.value)}
                      placeholder="it-support"
                      aria-label="From local part"
                    />
                  </div>
                  <span className="pb-2 text-sm text-slate-400">@</span>
                  <div className="min-w-[12rem] flex-1">
                    <select
                      className={inputClass}
                      value={sendingDomainId}
                      onChange={(e) => setSendingDomainId(e.target.value)}
                    >
                      <option value="">Choose a domain…</option>
                      {sendingDomains.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.domain}
                          {d.managed ? ' (Vlumeaware shared)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {sendingDomains.length > 0 && (
                <div className="mt-2">
                  <label className="text-[11px] font-medium text-slate-500">
                    Sender name (optional)
                  </label>
                  <input
                    className={`${inputClass} mt-1 max-w-xs`}
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="e.g. IT Service Desk"
                    aria-label="Sender display name"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    The name staff see in their inbox. Set a convincing title so the sending address
                    is not the first thing they notice. Leave blank to use each scenario&rsquo;s own
                    sender name.
                  </p>
                </div>
              )}

              {sendingDomainId && (
                <p className="mt-2 text-[11px] text-slate-500">
                  Mail will show as{' '}
                  <span className="font-mono text-slate-700">
                    {senderName.trim() || 'each scenario’s sender'} &lt;
                    {(fromLocalPart.trim() || 'no-reply')}@
                    {sendingDomains.find((d) => d.id === sendingDomainId)?.domain}&gt;
                  </span>
                  .
                </p>
              )}
            </Field>

            <Field
              label="Landing page"
              hint="The page staff see if they click the link. Pick a template, a page you saved, or build one now. It never captures real passwords — only whether someone submitted."
            >
              <select
                className={inputClass}
                value={landingTemplate}
                onChange={(e) => setLandingTemplate(e.target.value)}
              >
                <optgroup label="Templates">
                  <option value="generic">Your brand (logo &amp; colours)</option>
                  <option value="microsoft">Microsoft 365 sign-in</option>
                  <option value="google">Google Workspace sign-in</option>
                  <option value="okta">Okta sign-in</option>
                </optgroup>
                {landingPages.length > 0 && (
                  <optgroup label="Your saved pages">
                    {landingPages.map((p) => (
                      <option key={p.id} value={`page:${p.id}`}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Build one">
                  <option value="custom">✎ Custom page — build now</option>
                </optgroup>
              </select>

              {landingTemplate === 'custom' && (
                <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <input
                    className={inputClass}
                    value={landingPageName}
                    onChange={(e) => setLandingPageName(e.target.value)}
                    placeholder="Name (e.g. Acme HR portal) — optional"
                  />
                  <textarea
                    className={`${inputClass} font-mono text-[12px]`}
                    rows={10}
                    value={landingHtml}
                    onChange={(e) => setLandingHtml(e.target.value)}
                    placeholder={'<div style="max-width:400px;margin:60px auto;text-align:center">\n  <h1>Sign in to Acme</h1>\n  {{LOGIN_FORM}}\n</div>'}
                  />
                  <p className="text-[11px] text-slate-500">
                    Paste or write HTML. Put <code className="font-mono">{'{{LOGIN_FORM}}'}</code> where the
                    sign-in fields should appear (added at the end if you omit it). Scripts, forms and
                    event handlers are stripped — appearance only; the platform supplies the
                    metadata-only form. It is saved and reusable after you create the campaign.
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={previewLanding}
                    disabled={previewBusy || !landingHtml.trim()}
                  >
                    {previewBusy ? 'Rendering…' : 'Preview what will be shown'}
                  </Button>
                </div>
              )}
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Schedule send (optional)" hint="Leave blank to launch manually.">
                <input
                  className={inputClass}
                  type="datetime-local"
                  value={scheduledSendAt}
                  onChange={(e) => setScheduledSendAt(e.target.value)}
                />
              </Field>
              <Field label="Drip window (minutes)" hint="Spread sends randomly; 0 = all at once.">
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  value={sendWindowMinutes}
                  onChange={(e) => setSendWindowMinutes(e.target.value)}
                />
              </Field>
              <Field label="Repeat every (days)" hint="e.g. 90 for quarterly. Blank = one-off.">
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  value={recurrenceDays}
                  onChange={(e) => setRecurrenceDays(e.target.value)}
                  placeholder="—"
                />
              </Field>
            </div>
            <Button
              type="submit"
              disabled={
                busy ||
                !selected.length ||
                name.trim().length < 2 ||
                (recipientMode === 'selected' && recipients.length === 0)
              }
            >
              Create draft campaign
            </Button>
          </form>
        )}
      </Card>

      {previewHtml !== null && (
        <LandingPreview html={previewHtml} onClose={() => setPreviewHtml(null)} />
      )}
    </div>
  );
}

/**
 * Shows a custom landing page exactly as a target would see it: the sanitized
 * HTML with a (non-functional) copy of the metadata-only sign-in form injected
 * at the {{LOGIN_FORM}} marker. This is a preview only — the form does nothing.
 */
function LandingPreview({ html, onClose }: { html: string; onClose: () => void }) {
  const marker = '{{LOGIN_FORM}}';
  const idx = html.indexOf(marker);
  const before = idx >= 0 ? html.slice(0, idx) : html;
  const after = idx >= 0 ? html.slice(idx + marker.length) : '';
  const mockForm = (
    <div className="mx-auto w-full max-w-sm px-6 py-6">
      <div className="space-y-3">
        <input className="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Work email" disabled />
        <input className="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Password" type="password" disabled />
        <button className="w-full rounded bg-slate-800 px-3 py-2 text-sm font-medium text-white" disabled>
          Sign in
        </button>
      </div>
    </div>
  );
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <span className="text-xs font-semibold text-slate-600">
            Preview · what the target sees (form is inert here)
          </span>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="overflow-auto bg-white">
          {before && <div dangerouslySetInnerHTML={{ __html: before }} />}
          {mockForm}
          {after && <div dangerouslySetInnerHTML={{ __html: after }} />}
        </div>
      </div>
    </div>
  );
}
