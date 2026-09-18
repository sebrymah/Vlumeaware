'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Guard } from '@/components/guard';
import { Button, Card, Field, Notice, inputClass } from '@/components/ui';
import { Icon } from '@/components/icons';

export default function SecurityPage() {
  return (
    <Guard allow={['vlumetech_superadmin']}>
      <Security />
    </Guard>
  );
}

interface Setup {
  secret: string;
  otpauthUrl: string;
}

function Security() {
  const router = useRouter();
  const [enrollMode, setEnrollMode] = useState(false);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('enroll') === '1') {
      setEnrollMode(true);
    }
  }, []);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setSetup(await api.post<Setup>('/auth/mfa/setup'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  async function activate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await api.post('/auth/mfa/activate', { code: code.trim() });
      setDone(true);
      setOk('Two-factor authentication is now on. You will be asked for a code at every sign-in.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 rounded-xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white p-5">
        <div className="rounded-lg bg-brand-100 p-2 text-brand-600"><Icon name="shield" /></div>
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Security · Two-factor authentication</h1>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">
            Vlumetech staff accounts must be protected with an authenticator app (TOTP). Set it up once;
            you’ll enter a 6-digit code at each sign-in.
          </p>
        </div>
      </div>

      {enrollMode && !done && (
        <Notice kind="info">
          Multi-factor authentication is required for staff accounts. Complete setup below to continue to the console.
        </Notice>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      {done ? (
        <Card title="You're protected">
          <p className="text-sm text-slate-600">Two-factor authentication is enabled on your account.</p>
          <div className="mt-4"><Button onClick={() => router.replace('/super-admin')}>Go to console</Button></div>
        </Card>
      ) : !setup ? (
        <Card title="Set up an authenticator">
          <p className="text-sm text-slate-600">
            Use Google Authenticator, Microsoft Authenticator, Authy, or 1Password. Click below to generate
            your key, then add it to the app.
          </p>
          <div className="mt-4"><Button onClick={start} disabled={busy}>{busy ? 'Generating…' : 'Begin setup'}</Button></div>
        </Card>
      ) : (
        <Card title="Add the key, then confirm a code">
          <ol className="mb-4 space-y-3 text-sm text-slate-600">
            <li>
              <span className="font-medium text-slate-800">1. Add this account to your authenticator.</span>
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Manual key</div>
                <div className="mt-1 select-all break-all font-mono text-[13px] text-slate-900">{setup.secret}</div>
                <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Or use the setup link</div>
                <a className="mt-1 block break-all font-mono text-[12px] text-brand-700 underline" href={setup.otpauthUrl}>{setup.otpauthUrl}</a>
              </div>
            </li>
            <li><span className="font-medium text-slate-800">2. Enter the 6-digit code it shows.</span></li>
          </ol>
          <form onSubmit={activate} className="flex items-end gap-3">
            <Field label="Authentication code">
              <input
                className={inputClass}
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                required
              />
            </Field>
            <Button type="submit" disabled={busy || code.length !== 6}>
              {busy ? 'Verifying…' : 'Turn on 2FA'}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
