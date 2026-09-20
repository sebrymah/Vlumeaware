'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, uploadWithProgress } from '@/lib/api';
import { Guard, useActingTenant } from '@/components/guard';
import { Button, Card, Field, Notice, inputClass } from '@/components/ui';

interface Branding {
  name: string;
  brandPrimaryColor: string | null;
  certificateTemplate: string;
  /** A signed, displayable URL — null when no logo has been uploaded. */
  logoUrl: string | null;
}

const TEMPLATES = [
  {
    id: 'formal',
    name: 'Formal',
    blurb: 'Centred and double-ruled. The certificate someone frames or files.',
  },
  {
    id: 'branded',
    name: 'Branded',
    blurb: 'Your colour down the edge, your logo at the top. A modern credential.',
  },
  {
    id: 'record',
    name: 'Audit record',
    blurb: 'Labelled fields and a verification panel. Reads as evidence for an auditor.',
  },
] as const;

export default function SettingsPage() {
  return (
    <Guard allow={['client_admin']}>
      <Settings />
    </Guard>
  );
}

function Settings() {
  const tenantId = useActingTenant();
  const [tenant, setTenant] = useState<Branding | null>(null);
  const [template, setTemplate] = useState('branded');
  const [colour, setColour] = useState('#0B7C57');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const t = await api.get<Branding>(`/tenants/${tenantId}/branding`);
      setTenant(t);
      setTemplate(t.certificateTemplate ?? 'branded');
      setColour(t.brandPrimaryColor ?? '#0B7C57');
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await api.patch(`/tenants/${tenantId}/branding`, {
        certificateTemplate: template,
        brandPrimaryColor: colour,
      });
      setOk('Saved. Certificates issued from now on use these settings.');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadLogo() {
    const file = logoRef.current?.files?.[0];
    if (!file) {
      setError('Choose a PNG or JPEG logo to upload.');
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const form = new FormData();
      form.append('logo', file);
      await uploadWithProgress(`/tenants/${tenantId}/branding/logo`, form, () => {});
      setOk('Logo saved. It appears on your certificates from now on.');
      if (logoRef.current) logoRef.current.value = '';
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!tenant) {
    return <p className="text-sm text-slate-500">{error ?? 'Loading…'}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Branding</h1>
        <p className="mt-1 text-xs text-slate-500">
          How {tenant.name} appears to your employees. Your logo and Vlumeaware&rsquo;s both appear on
          every certificate.
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <Card title="Certificate layout">
        <div className="grid gap-3 sm:grid-cols-3">
          {TEMPLATES.map((t) => {
            const selected = template === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplate(t.id)}
                aria-pressed={selected}
                className={`rounded-xl border p-3 text-left transition ${
                  selected
                    ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-100'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <TemplatePreview id={t.id} colour={colour} />
                <div className="mt-3 text-sm font-semibold text-slate-900">{t.name}</div>
                <p className="mt-1 text-xs text-slate-500">{t.blurb}</p>
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="Brand colour">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Hex colour" hint="Used on certificates and on the pages your employees see.">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={colour}
                onChange={(e) => setColour(e.target.value)}
                aria-label="Brand colour"
                className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-white p-1"
              />
              <input
                className={`${inputClass} w-32 font-mono`}
                value={colour}
                onChange={(e) => setColour(e.target.value)}
                aria-label="Brand colour hex value"
              />
            </div>
          </Field>
        </div>
      </Card>

      <Card title="Your logo">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <div className="text-xs text-slate-500">Current</div>
            <div className="mt-1 flex h-16 w-44 items-center justify-center rounded-lg border border-slate-200 bg-white px-3">
              {tenant.logoUrl ? (
                <img src={tenant.logoUrl} alt={`${tenant.name} logo`} className="max-h-12 w-auto" />
              ) : (
                <span className="text-xs text-slate-400">None. Your name is used instead</span>
              )}
            </div>
          </div>
          <Field
            label="Replace logo"
            hint="PNG or JPEG, up to 2 MB. SVG cannot be embedded in a PDF."
          >
            <input
              ref={logoRef}
              type="file"
              accept="image/png,image/jpeg"
              className="text-xs text-slate-600"
            />
          </Field>
          <Button variant="ghost" onClick={uploadLogo} disabled={busy}>
            Upload logo
          </Button>
        </div>
      </Card>

      <Button onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save branding'}
      </Button>
    </div>
  );
}

/** A miniature of each layout, so the choice is visual rather than a guess. */
function TemplatePreview({ id, colour }: { id: string; colour: string }) {
  const bar = 'rounded-full bg-slate-200';
  if (id === 'formal') {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border border-slate-200 bg-white p-2">
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-1.5 border-2 px-3"
          style={{ borderColor: colour }}
        >
          <div className="h-1 w-10 rounded-full" style={{ background: colour }} />
          <div className={`h-2 w-20 ${bar}`} />
          <div className="h-1 w-8 rounded-full" style={{ background: colour }} />
          <div className={`h-1 w-16 ${bar}`} />
        </div>
      </div>
    );
  }
  if (id === 'record') {
    return (
      <div className="h-24 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="h-5 w-full" style={{ background: colour }} />
        <div className="flex gap-2 p-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <div className={`h-2 w-16 ${bar}`} />
            <div className={`h-1 w-full ${bar}`} />
            <div className={`h-1 w-full ${bar}`} />
            <div className={`h-1 w-3/4 ${bar}`} />
          </div>
          <div className="h-12 w-10 rounded bg-slate-100" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-24 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="w-3" style={{ background: colour }} />
      <div className="flex flex-1 flex-col justify-center gap-1.5 p-3">
        <div className="h-1 w-10 rounded-full" style={{ background: colour }} />
        <div className={`h-3 w-24 ${bar}`} />
        <div className={`h-1 w-full ${bar}`} />
        <div className={`h-1 w-2/3 ${bar}`} />
      </div>
    </div>
  );
}
