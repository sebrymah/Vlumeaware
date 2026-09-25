'use client';

import type { ReactNode } from 'react';

export function Card({
  title,
  subtitle,
  actions,
  children,
  size = 'compact',
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  /**
   * 'compact' is the console's data scale — right for a table of campaigns,
   * wrong for a page someone actually reads. 'roomy' steps the header, padding
   * and text up; the default leaves every existing caller exactly as it was.
   */
  size?: 'compact' | 'roomy';
}) {
  const roomy = size === 'roomy';
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-card">
      {(title || actions) && (
        <header
          className={`flex items-start justify-between gap-4 border-b border-slate-100 ${
            roomy ? 'px-6 py-4' : 'px-5 py-4'
          }`}
        >
          <div>
            {title && (
              <h2
                className={
                  roomy
                    ? 'text-base font-semibold text-slate-900'
                    : 'text-sm font-semibold text-slate-900'
                }
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p
                className={`text-slate-500 ${
                  roomy ? 'mt-1 text-sm leading-relaxed' : 'mt-0.5 text-xs'
                }`}
              >
                {subtitle}
              </p>
            )}
          </div>
          {actions}
        </header>
      )}
      <div className={roomy ? 'px-6 py-5' : 'px-5 py-4'}>{children}</div>
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
    primary: 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm',
    ghost: 'border border-slate-300 bg-white hover:bg-slate-50 text-slate-700',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-sm',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 ring-slate-200',
  active: 'bg-brand-50 text-brand-700 ring-brand-100',
  paused: 'bg-amber-50 text-amber-700 ring-amber-200',
  completed: 'bg-sky-50 text-sky-700 ring-sky-200',
  killed: 'bg-red-50 text-red-700 ring-red-200',
  yes: 'bg-brand-50 text-brand-700 ring-brand-100',
  no: 'bg-red-50 text-red-700 ring-red-200',
  upload: 'bg-violet-50 text-violet-700 ring-violet-200',
  link: 'bg-sky-50 text-sky-700 ring-sky-200',
  real: 'bg-red-50 text-red-700 ring-red-200',
  simulation: 'bg-slate-100 text-slate-600 ring-slate-200',
  low: 'bg-brand-50 text-brand-700 ring-brand-100',
  medium: 'bg-amber-50 text-amber-700 ring-amber-200',
  high: 'bg-orange-50 text-orange-700 ring-orange-200',
};

export function Badge({ children }: { children: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
        BADGE[children] ?? 'bg-slate-100 text-slate-600 ring-slate-200'
      }`}
    >
      {children}
    </span>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-slate-200 text-slate-400">
            {head.map((h) => (
              <th key={h} className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-slate-700">{children}</tbody>
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
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

export function Notice({ kind, children }: { kind: 'error' | 'info' | 'ok'; children: ReactNode }) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-700',
    info: 'border-slate-200 bg-slate-50 text-slate-600',
    ok: 'border-brand-200 bg-brand-50 text-brand-700',
  }[kind];
  return <div className={`rounded-lg border px-3 py-2 text-xs font-medium ${styles}`}>{children}</div>;
}

/** Friendly empty-state block with an illustration slot. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-slate-300">{icon}</div>}
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-slate-400">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
