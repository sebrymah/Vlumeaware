'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Guard, useActingTenant } from '@/components/guard';
import { Badge, Button, Card, ConfirmButton, EmptyRow, Notice, SkeletonRows, Table, inputClass } from '@/components/ui';
import { useToast } from '@/components/toast';

interface Employee {
  id: string;
  name: string;
  email: string;
  department: string | null;
}
interface GroupRow {
  id: string;
  name: string;
  createdAt: string;
  _count: { members: number };
  sourceCampaignName?: string | null;
  sourceCriteria?: string | null;
}

const CRITERIA_LABEL: Record<string, string> = {
  clicked: 'Clicked',
  submitted: 'Submitted credentials',
  reported: 'Caught it',
  opened: 'Opened',
};

/** "clicked,submitted" -> "Clicked + Submitted credentials". */
function criteriaLabel(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .split(',')
    .map((k) => CRITERIA_LABEL[k.trim()] ?? k.trim())
    .filter(Boolean)
    .join(' + ');
}
interface GroupDetail {
  id: string;
  name: string;
  members: Employee[];
}
interface TrainingModule {
  id: string;
  title: string;
}

export default function GroupsPage() {
  return (
    <Guard allow={['client_admin']}>
      <Groups />
    </Guard>
  );
}

function Groups() {
  const { show } = useToast();
  // Records the message inline and shows it where the eye already is; a save at
  // the bottom of a long page would otherwise be announced below the fold.
  const flash = (message: string) => {
    setOk(message);
    show(message);
  };
  const tenantId = useActingTenant();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');

  const [editing, setEditing] = useState<GroupDetail | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const [assigning, setAssigning] = useState<GroupRow | null>(null);
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [moduleId, setModuleId] = useState('');
  const [assignMembers, setAssignMembers] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [g, e] = await Promise.all([
        api.get<GroupRow[]>(`/tenants/${tenantId}/groups`),
        api.get<Employee[]>(`/tenants/${tenantId}/employees`),
      ]);
      setGroups(g);
      setEmployees(e);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoaded(true);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await api.post(`/tenants/${tenantId}/groups`, { name: newName });
      flash(`Group “${newName.trim()}” created.`);
      setNewName('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function rename(g: GroupRow) {
    const name = window.prompt('Rename group', g.name);
    if (name == null || !name.trim()) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await api.patch(`/tenants/${tenantId}/groups/${g.id}`, { name });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await api.del(`/tenants/${tenantId}/groups/${id}`);
      if (editing?.id === id) setEditing(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openEditor(g: GroupRow) {
    setError(null);
    setOk(null);
    setSearch('');
    try {
      const detail = await api.get<GroupDetail>(`/tenants/${tenantId}/groups/${g.id}`);
      setEditing(detail);
      setMemberIds(detail.members.map((m) => m.id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function saveMembers() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await api.put(`/tenants/${tenantId}/groups/${editing.id}/members`, { employeeIds: memberIds });
      flash(`Saved ${memberIds.length} member${memberIds.length === 1 ? '' : 's'} to “${editing.name}”.`);
      setEditing(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openAssign(g: GroupRow) {
    setError(null);
    setOk(null);
    try {
      const [mods, detail] = await Promise.all([
        api.get<TrainingModule[]>(`/tenants/${tenantId}/training-modules`),
        api.get<GroupDetail>(`/tenants/${tenantId}/groups/${g.id}`),
      ]);
      setModules(mods);
      setAssignMembers(detail.members.map((m) => m.id));
      setModuleId('');
      setAssigning(g);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function confirmAssign() {
    if (!assigning || !moduleId) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await api.post<{ assigned: number; skipped: number }>(
        `/tenants/${tenantId}/training/assign`,
        { trainingModuleId: moduleId, employeeIds: assignMembers, notify: true },
      );
      flash(
        `Assigned to ${res.assigned} member${res.assigned === 1 ? '' : 's'}${
          res.skipped ? ` (${res.skipped} already had it)` : ''
        } in “${assigning.name}”.`,
      );
      setAssigning(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const q = search.trim().toLowerCase();
  const shown = q
    ? employees.filter((e) => [e.name, e.email, e.department ?? ''].some((v) => v.toLowerCase().includes(q)))
    : employees;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Groups</h1>
        <p className="mt-1 text-xs text-slate-500">
          Build named groups of staff — Finance, Operations, Pilots — then target a campaign at a
          group so each team gets its own simulation.
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <Card title="Create a group">
        <form onSubmit={create} className="flex flex-wrap items-end gap-2">
          <input
            className={`${inputClass} max-w-xs`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Finance"
          />
          <Button type="submit" disabled={busy || !newName.trim()}>
            Create
          </Button>
        </form>
      </Card>

      <Card title="Your groups">
        {!loaded ? (
          <SkeletonRows rows={4} />
        ) : (
          <Table head={['Group', 'Members', '']}>
            {groups.map((g) => (
              <tr key={g.id} className="border-b border-slate-100">
                <td className="px-2 py-2 font-medium text-slate-800">{g.name}</td>
                <td className="px-2 py-2">
                  <Badge>{String(g._count.members)}</Badge>
                </td>
                <td className="px-2 py-2">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => openEditor(g)}>
                      Manage members
                    </Button>
                    <Button variant="ghost" onClick={() => openAssign(g)} disabled={busy}>
                      Assign course
                    </Button>
                    <Button variant="ghost" onClick={() => rename(g)} disabled={busy}>
                      Rename
                    </Button>
                    <ConfirmButton
                      label="Delete"
                      question={`Delete group “${g.name}”? The staff themselves are not removed.`}
                      onConfirm={() => remove(g.id)}
                      disabled={busy}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {!groups.length && (
              <EmptyRow colSpan={3} title="No groups yet — create one above." />
            )}
          </Table>
        )}
      </Card>

      {editing && (
        <Card
          title={`Members — ${editing.name}`}
          actions={
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Close
            </Button>
          }
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
              aria-label="Search staff by name, email or department"
                className={`${inputClass} flex-1`}
                type="search"
                placeholder="Search staff by name, email or department…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                type="button"
                className="whitespace-nowrap rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                onClick={() => setMemberIds((prev) => [...new Set([...prev, ...shown.map((e) => e.id)])])}
              >
                Select all shown ({shown.length})
              </button>
              <button
                type="button"
                className="whitespace-nowrap rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                onClick={() => setMemberIds([])}
              >
                Clear
              </button>
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
              {employees.length === 0 && (
                <p className="px-1 py-2 text-[11px] text-slate-500">No employees on the roster yet.</p>
              )}
              {employees.length > 0 && shown.length === 0 && (
                <p className="px-1 py-2 text-[11px] text-slate-500">No staff match “{search}”.</p>
              )}
              {shown.map((e) => (
                <label key={e.id} className="flex items-center gap-2 px-1 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={memberIds.includes(e.id)}
                    onChange={(ev) =>
                      setMemberIds(ev.target.checked ? [...memberIds, e.id] : memberIds.filter((id) => id !== e.id))
                    }
                  />
                  <span className="font-medium text-slate-700">{e.name}</span>
                  <span className="text-slate-400">{e.email}</span>
                  {e.department && <Badge>{e.department}</Badge>}
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">{memberIds.length} selected</span>
              <Button onClick={saveMembers} disabled={busy}>
                Save members
              </Button>
            </div>
          </div>
        </Card>
      )}

      {assigning && (
        <Card
          title={`Assign a course — ${assigning.name}`}
          actions={
            <Button variant="ghost" onClick={() => setAssigning(null)}>
              Close
            </Button>
          }
        >
          <p className="text-xs text-slate-500">
            Every current member of this group will receive the course, with an email link. Members
            added later are not included — assign again when the group changes.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-[16rem] flex-1">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Course</span>
                <select
                  className={`${inputClass} mt-1`}
                  value={moduleId}
                  onChange={(e) => setModuleId(e.target.value)}
                >
                  <option value="">Choose a course…</option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Button
              size="md"
              onClick={confirmAssign}
              disabled={busy || !moduleId || assignMembers.length === 0}
            >
              {busy
                ? 'Assigning…'
                : `Assign to ${assignMembers.length} member${assignMembers.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
