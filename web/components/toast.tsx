'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Transient confirmation for an action whose result would otherwise be announced
 * wherever the form happens to sit on the page — which, for a save at the bottom
 * of a long screen, is off-screen.
 *
 * Deliberately small: one stack, polite announcements, no dependency. Errors stay
 * inline next to the control that caused them, where they can be read alongside the
 * input; a toast that vanishes is the wrong place for something you must act on.
 */
type Kind = 'ok' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  kind: Kind;
}

const ToastContext = createContext<{ show: (message: string, kind?: Kind) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  // A page rendered outside the provider should not crash; it simply loses toasts.
  return ctx ?? { show: () => {} };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, kind: Kind = 'ok') => {
      const id = nextId.current++;
      setItems((prev) => [...prev.slice(-2), { id, message, kind }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  const styles: Record<Kind, string> = {
    ok: 'border-brand-200 bg-white text-slate-800',
    error: 'border-red-200 bg-white text-red-800',
    info: 'border-slate-200 bg-white text-slate-700',
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-pop ${styles[t.kind]}`}
          >
            <span aria-hidden="true" className={t.kind === 'error' ? 'text-red-500' : 'text-brand-600'}>
              {t.kind === 'error' ? '!' : '✓'}
            </span>
            <span className="flex-1 leading-relaxed">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="-mr-1 -mt-1 rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
