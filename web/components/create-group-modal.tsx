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

/**
 * The criteria are multi-select: selecting "Clicked" and "Caught it" produces the
 * union of both. Each row in the preview says which of the chosen criteria it
 * matched, so the admin can tell why someone is in the list.
 */
const CRITERIA = [
  { key: 'submitted', label: 'Submitted credentials', hint: 'entered credentials on the lure' },
  { key: 'clicked', label: 'Clicked', hint: 'clicked the link' },
  { key: 'reported', label: 'Caught it', hint: 'reported the email' },
  { key: 'opened', label: 'Opened', hint: 'opened the email' },
] as const;

type CriteriaKey = (typeof CRITERIA)[number]['key'];

const LABEL_OF: Record<CriteriaKey, string> = {
  submitted: 'Submitted credentials',
  clicked: 'Clicked',
  reported: 'Caught it',
  opened: 'Opened',
};

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
  }
}

/** The criteria an employee matched, for the "why is this person here" hint. */
function matchedKeys(row: ImpactRow, keys: CriteriaKey[]): CriteriaKey[] {
  return keys.filter((k) => matches(row, k));
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

  const [criteria, setCriteria] = useState<CriteriaKey[]>(['submitted']);
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
    () => (rows ?? []).filter((r) => criteria.some((k) => matches(r, k))),
    [rows, criteria],
  );

  // When the criteria change, the whole matched set is selected; the admin then
  // unticks rather than having to tick everyone in.
  useEffect(() => {
    setSelected(new Set(matched.map((r) => r.employeeId)));
    if (!nameTouched) {
      const label = criteria.map((k) => LABEL_OF[k]).join(' + ');
      setName(`${label} — ${campaignName} ${new Date().toLocaleDateString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criteria, rows]);

  const allSelected = matched.length > 0 && matched.every((r) => selected.has(r.employeeId));

  function toggleCriteria(key: CriteriaKey) {
    setCriteria((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

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
          // Provenance is the ordered, comma-joined criteria, so a multi-select
          // group reads "clicked,submitted" on the groups page.
          sourceCriteria: [...criteria].sort().join(','),
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
              <span className="text-xs font-semibold text-slate-600">
                Who should be in it? Select one or more.
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {CRITERIA.map((c) => {
                  const on = criteria.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => toggleCriteria(c.key)}
                      title={c.hint}
                      aria-pressed={on}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition ${
                        on
                          ? 'bg-brand-50 text-brand-700 ring-brand-500'
                          : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                {criteria.length
                  ? `Anyone matching any of the selected: ${criteria.map((k) => LABEL_OF[k]).join(' + ')}.`
                  : 'Pick at least one criterion.'}
              </p>
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
            ) : criteria.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">Pick at least one criterion.</p>
            ) : matched.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">
                No one matched the selected criteria.
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
                  {matched.map((r) => {
                    const why = matchedKeys(r, criteria);
                    return (
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
                            {why.map((k) => LABEL_OF[k]).join(' · ')}
                          </span>
                        </label>
                      </li>
                    );
                  })}
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
            disabled={busy || !name.trim() || selected.size === 0 || criteria.length === 0}
          >
            {busy ? 'Creating…' : 'Create group'}
          </Button>
        </div>
      </div>
    </div>
  );
}
