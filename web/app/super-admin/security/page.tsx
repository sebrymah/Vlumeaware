'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

const QR_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';

/** Load the QR library once. It renders locally, so the secret never leaves the browser. */
function loadQrLib(): Promise<unknown> {
  const w = window as unknown as { QRCode?: unknown; __qrPromise?: Promise<unknown> };
  if (w.QRCode) return Promise.resolve(w.QRCode);
  if (w.__qrPromise) return w.__qrPromise;
  w.__qrPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = QR_SRC;
    s.async = true;
    s.onload = () => resolve((window as unknown as { QRCode?: unknown }).QRCode);
    s.onerror = () => reject(new Error('Could not load the QR generator'));
    document.head.appendChild(s);
  });
  return w.__qrPromise;
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
  const [qrFailed, setQrFailed] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('enroll') === '1') {
      setEnrollMode(true);
    }
  }, []);

  // Render the QR once we have an otpauth URI and the container is mounted.
  useEffect(() => {
    if (!setup || !qrRef.current) return;
    let cancelled = false;
    loadQrLib()
      .then((QRCode) => {
        if (cancelled || !qrRef.current) return;
        qrRef.current.innerHTML = '';
        const Ctor = QRCode as unknown as new (el: HTMLElement, opts: Record<string, unknown>) => unknown;
        // eslint-disable-next-line no-new
        new Ctor(qrRef.current, {
          text: setup.otpauthUrl,
          width: 176,
          height: 176,
          colorDark: '#0F1B16',
          colorLight: '#ffffff',
        });
      })
      .catch(() => {
        if (!cancelled) setQrFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [setup]);

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
              <span className="font-medium text-slate-800">1. Scan this with your authenticator app.</span>
              <div className="mt-2 flex flex-wrap items-start gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-3" style={{ lineHeight: 0 }}>
                  <div ref={qrRef} aria-label="Two-factor QR code" style={{ width: 176, height: 176 }} />
                  {qrFailed && (
                    <div style={{ width: 176 }} className="text-center text-[11px] leading-normal text-slate-500">
                      QR couldn’t load — use the manual key instead.
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Can’t scan? Enter this key</div>
                  <div className="mt-1 select-all break-all font-mono text-[13px] text-slate-900">{setup.secret}</div>
                  <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Or open the setup link</div>
                  <a className="mt-1 block break-all font-mono text-[12px] text-brand-700 underline" href={setup.otpauthUrl}>{setup.otpauthUrl}</a>
                </div>
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
