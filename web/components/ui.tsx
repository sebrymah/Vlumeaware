'use client';

import type { ReactNode } from 'react';

export function Card({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/60">
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const styles = {
    primary: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    ghost: 'border border-slate-700 hover:border-slate-600 text-slate-200',
    danger: 'bg-red-700 hover:bg-red-600 text-white',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  draft: 'bg-slate-700 text-slate-200',
  active: 'bg-emerald-900 text-emerald-200',
  paused: 'bg-amber-900 text-amber-200',
  completed: 'bg-sky-900 text-sky-200',
  killed: 'bg-red-900 text-red-200',
  yes: 'bg-emerald-900 text-emerald-200',
  no: 'bg-red-900 text-red-200',
};

export function Badge({ children }: { children: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-[11px] font-medium ${BADGE[children] ?? 'bg-slate-700 text-slate-200'}`}
    >
      {children}
    </span>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-800 text-slate-500">
            {head.map((h) => (
              <th key={h} className="px-2 py-2 font-medium uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-slate-300">{children}</tbody>
      </table>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-emerald-600';

export function Notice({ kind, children }: { kind: 'error' | 'info' | 'ok'; children: ReactNode }) {
  const styles = {
    error: 'border-red-800 bg-red-950/60 text-red-200',
    info: 'border-slate-700 bg-slate-900 text-slate-300',
    ok: 'border-emerald-800 bg-emerald-950/60 text-emerald-200',
  }[kind];
  return <div className={`rounded border px-3 py-2 text-xs ${styles}`}>{children}</div>;
}

export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
