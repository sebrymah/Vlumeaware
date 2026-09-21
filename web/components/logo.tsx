/**
 * The Vlumeaware mark: an open ring returning into itself with the person at
 * its centre. It draws the closed loop the product is built on — a click comes
 * back around as training — and is deliberately not a padlock, shield or hook,
 * which every other vendor in the category already uses.
 *
 * Two strokes and a dot, so it survives 16px and one colour.
 */
export function LogoMark({
  size = 24,
  className,
  color,
}: {
  size?: number;
  className?: string;
  /** Overrides the accent. Pass a single colour for one-colour contexts. */
  color?: string;
}) {
  const ring = color ?? 'var(--logo-ring, #0B7C57)';
  const dot = color ?? 'var(--logo-dot, #0F1B16)';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M24 7a17 17 0 1 1-12.02 4.98" stroke={ring} strokeWidth="6" strokeLinecap="round" />
      <path
        d="M11 4.5 11.5 12.5 19.5 12"
        stroke={ring}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="24" r="7" fill={dot} />
    </svg>
  );
}

/** Mark plus wordmark. The name is the accessible label; the mark is decorative. */
export function Logo({
  size = 20,
  className = 'text-base',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold text-slate-900 ${className}`}>
      <LogoMark size={size} />
      <span>
        Vlume<span className="text-brand-600">aware</span>
      </span>
    </span>
  );
}
