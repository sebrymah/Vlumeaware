'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/components/toast';
import { Button, Notice } from '@/components/ui';

interface ImpactRow {
  employeeId: string;
  name: string;
  email: string;
  department: string | null;
  opened: boolean;
  clicked: boolean;
  reported: boolean;
  submitted: boolean;
}

const CRITERIA = [
  { key: 'submitted', label: 'Submitted credentials', hint: 'entered credentials on the lure' },
  { key: 'clicked', label: 'Clicked', hint: 'clicked the link' },
  { key: 'reported', label: 'Caught it', hint: 'reported the email' },
  { key: 'opened', label: 'Opened', hint: 'opened the email' },
  { key: 'any', label: 'Any interaction', hint: 'clicked or submitted credentials' },
] as const;

type CriteriaKey = (typeof CRITERIA)[number]['key'];

function matches(row: ImpactRow, key: CriteriaKey): boolean {
  switch (key) {
    case 'submitted':
      return row.submitted;
    case 'clicked':
      return row.clicked;
    case 'reported':
      return row.reported;
    case 'opened':
      return row.opened;
    case 'any':
      return row.clicked || row.submitted;
  }
}

/**
 * Turns a campaign's results into a named group, after the admin has reviewed and
 * trimmed the membership. The members are a snapshot: the criteria selects them
 * now, the admin edits that selection, and the group is created once.
 */
export function CreateGroupModal({
  tenantId,
  campaignId,
  campaignName,
  onClose,
  onCreated,
}: {
  tenantId: string;
  campaignId: string;
  campaignName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { show } = useToast();
  const panelRef = useRef<HTMLDivElement>(null);

  const [criteria, setCriteria] = useState<CriteriaKey>('submitted');
  const [rows, setRows] = useState<ImpactRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    api
      .get<ImpactRow[]>(`/tenants/${tenantId}/campaigns/${campaignId}/impact`)
      .then(setRows)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [tenantId, campaignId]);

  const matched = useMemo(
    () => (rows ?? []).filter((r) => matches(r, criteria)),
    [rows, criteria],
  );

  // When the criteria changes, the whole matched set is selected; the admin then
  // unticks rather than having to tick everyone in.
  useEffect(() => {
    setSelected(new Set(matched.map((r) => r.employeeId)));
    // The suggested name follows the criteria unless the admin already typed one.
    if (!nameTouched) {
      const label = CRITERIA.find((c) => c.key === criteria)!.label;
      setName(`${label} — ${campaignName} ${new Date().toLocaleDateString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criteria, rows]);

  const allSelected = matched.length > 0 && matched.every((r) => selected.has(r.employeeId));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<{ name: string; memberCount: number }>(
        `/tenants/${tenantId}/groups`,
        {
          name: name.trim(),
          employeeIds: [...selected],
          sourceCampaignId: campaignId,
          sourceCriteria: criteria,
        },
      );
      show(`Group "${created.name}" created with ${created.memberCount} members.`);
      onCreated();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-group-title"
        tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 id="create-group-title" className="text-base font-semibold text-slate-900">
            Create a group from results
          </h2>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            <div>
              <span className="text-xs font-semibold text-slate-600">Who should be in it?</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {CRITERIA.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCriteria(c.key)}
                    title={c.hint}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition ${
                      criteria === c.key
                        ? 'bg-brand-50 text-brand-700 ring-brand-500'
                        : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Group name</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameTouched(true);
                }}
                maxLength={80}
              />
            </label>

            {error && <Notice kind="error">{error}</Notice>}

            {loading ? (
              <p className="py-6 text-sm text-slate-500">Loading results…</p>
            ) : rows === null ? (
              <p className="py-6 text-sm text-slate-500">Could not load results.</p>
            ) : matched.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">
                No one matched this criteria. This campaign had no{' '}
                {CRITERIA.find((c) => c.key === criteria)!.label.toLowerCase()}.
              </p>
            ) : (
              <div className="rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                  <span className="text-xs text-slate-500">
                    {selected.size} of {matched.length} selected
                  </span>
                  <button
                    type="button"
                    className="text-xs font-medium text-brand-700 hover:underline"
                    onClick={() =>
                      setSelected(allSelected ? new Set() : new Set(matched.map((r) => r.employeeId)))
                    }
                  >
                    {allSelected ? 'Clear all' : 'Select all'}
                  </button>
                </div>
                <ul className="max-h-64 overflow-y-auto">
                  {matched.map((r) => (
                    <li key={r.employeeId} className="border-b border-slate-50 last:border-0">
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={selected.has(r.employeeId)}
                          onChange={() => toggle(r.employeeId)}
                          className="h-4 w-4"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-800">
                            {r.name}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {r.email}
                            {r.department ? ` · ${r.department}` : ''}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {r.submitted ? 'submitted · ' : ''}
                          {r.clicked ? 'clicked' : r.opened ? 'opened' : ''}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[11px] leading-relaxed text-slate-500">
              This is a snapshot of results as they stand now — later clicks or reports do not change
              the group. Submitters are a subset of clickers.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="md"
            onClick={create}
            disabled={busy || !name.trim() || selected.size === 0}
          >
            {busy ? 'Creating…' : 'Create group'}
          </Button>
        </div>
      </div>
    </div>
  );
}
