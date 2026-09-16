'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Guard, useActingTenant } from '@/components/guard';
import { Badge, Button, Card, Notice, inputClass } from '@/components/ui';

interface Template {
  id: string;
  title: string;
  category: string;
  difficultyTier: string;
  industryTag: string | null;
  subjectLine: string;
  bodyHtml: string;
  senderSpoofName: string;
  redFlags: string[];
  source: string;
}

export default function TemplatesPage() {
  return (
    <Guard allow={['client_admin']}>
      <Templates />
    </Guard>
  );
}

function Templates() {
  const tenantId = useActingTenant();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [industry, setIndustry] = useState('');
  const [industries, setIndustries] = useState<string[]>([]);
  const [tier, setTier] = useState('');
  const [preview, setPreview] = useState<Template | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (category) qs.set('category', category);
      if (industry) qs.set('industryTag', industry);
      if (tier) qs.set('difficultyTier', tier);
      const [t, c, ind] = await Promise.all([
        api.get<Template[]>(`/phishing-templates${qs.toString() ? `?${qs}` : ''}`),
        api.get<string[]>('/phishing-templates/categories'),
        api.get<string[]>('/phishing-templates/industries'),
      ]);
      setTemplates(t);
      setCategories(c);
      setIndustries(ind);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [category, industry, tier]);

  useEffect(() => {
    void load();
  }, [load]);

  async function clone(template: Template) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await api.post(`/tenants/${tenantId}/scenarios/from-template/${template.id}`);
      setOk(`"${template.title}" added to your library as an editable draft. Edit it under Scenarios; it needs Vlumetech approval before use.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, Template[]>();
    for (const t of templates) {
      const arr = map.get(t.category) ?? [];
      arr.push(t);
      map.set(t.category, arr);
    }
    return [...map.entries()];
  }, [templates]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Template library</h1>
        <p className="mt-1 text-xs text-slate-500">
          Ready-to-use phishing simulations grounded in common attack patterns. Clone one into your
          library, then edit it to fit your business.
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-400">
          Category
          <select className={`${inputClass} mt-1`} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Industry
          <select className={`${inputClass} mt-1`} value={industry} onChange={(e) => setIndustry(e.target.value)}>
            <option value="">All</option>
            {industries.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Difficulty
          <select className={`${inputClass} mt-1`} value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="">Any</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
        <span className="text-xs text-slate-500">{templates.length} templates</span>
      </div>

      {grouped.map(([cat, items]) => (
        <Card key={cat} title={cat}>
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((t) => (
              <div key={t.id} className="rounded border border-slate-800 bg-slate-900/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-slate-100">{t.title}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      From: {t.senderSpoofName} · “{t.subjectLine}”
                    </div>
                  </div>
                  <Badge>{t.difficultyTier}</Badge>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button variant="ghost" onClick={() => setPreview(t)}>
                    Preview
                  </Button>
                  <Button onClick={() => clone(t)} disabled={busy}>
                    Clone to my library
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          onClick={() => setPreview(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">{preview.title}</h3>
                <p className="text-[11px] text-slate-500">
                  {preview.category} · {preview.difficultyTier}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Close
              </Button>
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              From {preview.senderSpoofName} · Subject: {preview.subjectLine}
            </p>
            <div
              className="mt-2 rounded border border-slate-700 bg-white p-3 text-black"
              dangerouslySetInnerHTML={{
                __html: preview.bodyHtml.split('{{TRACKING_URL}}').join('#').split('{{EMPLOYEE_NAME}}').join('Amina Bello'),
              }}
            />
            <h4 className="mt-4 text-xs font-semibold text-slate-300">Red flags taught</h4>
            <ul className="mt-1 space-y-1">
              {preview.redFlags.map((f) => (
                <li key={f} className="text-[11px] text-slate-400">
                  • {f}
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <Button onClick={() => { void clone(preview); setPreview(null); }} disabled={busy}>
                Clone to my library
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
