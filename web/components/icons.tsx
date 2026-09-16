'use client';

/** Compact inline line-icon set (stroke = currentColor). */
const PATHS: Record<string, string> = {
  hook: 'M12 3v9a4 4 0 1 1-4-4 M12 3h3a2 2 0 0 1 2 2', // fishing hook
  grad: 'M22 10 12 5 2 10l10 5 10-5Z M6 12v5c0 1 3 3 6 3s6-2 6-3v-5', // graduation cap
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  chart: 'M3 3v18h18 M7 14l3-3 3 3 5-6',
  building: 'M3 21h18 M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16 M9 8h.01 M12 8h.01 M15 8h.01 M9 12h.01 M12 12h.01 M15 12h.01',
  check: 'M20 6 9 17l-5-5',
  film: 'M2 4h20v16H2Z M7 4v16 M17 4v16 M2 9h5 M2 15h5 M17 9h5 M17 15h5',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  award: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z M8.2 13.9 7 22l5-3 5 3-1.2-8.1',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1Z M4 22v-7',
  chevron: 'm6 9 6 6 6-6',
  play: 'M8 5v14l11-7z',
  video: 'M23 7l-7 5 7 5V7Z M1 5h15v14H1Z',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5 5l-3 7v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3-7Z',
  mail: 'M4 4h16v16H4Z M22 6l-10 7L2 6',
  sparkles: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2 2 M16 16l2 2 M18 6l-2 2 M8 16l-2 2',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
};

export function Icon({ name, className = 'h-4 w-4' }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {(PATHS[name] ?? PATHS.check).split(' M').map((seg, i) => (
        <path key={i} d={(i === 0 ? seg : 'M' + seg)} />
      ))}
    </svg>
  );
}
