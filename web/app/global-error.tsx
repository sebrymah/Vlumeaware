'use client';

/**
 * The last resort: an error in the root layout, before any of the app shell exists.
 * This file must render its own <html> and <body>, and has to stand alone — no
 * providers, no session, no console chrome.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#F1F5F4',
          color: '#0F1B16',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <main style={{ maxWidth: 420, padding: 24, textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>
            Vlumeaware could not start this page
          </h1>
          <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6, color: '#475569' }}>
            Nothing was changed. Reload the page; if it keeps happening, send the reference below
            to your Vlumetech contact.
          </p>
          {error?.digest && (
            <p
              style={{
                marginTop: 16,
                padding: '8px 12px',
                border: '1px solid #E2E8F0',
                borderRadius: 8,
                background: '#fff',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 12,
                color: '#475569',
              }}
            >
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              padding: '8px 16px',
              border: 0,
              borderRadius: 8,
              background: '#0B7C57',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
