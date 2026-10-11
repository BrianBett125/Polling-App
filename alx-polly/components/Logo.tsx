import { cn } from '@/lib/utils';

/** The brand mark: three poll bars on a gradient tile. Decorative; the wordmark carries the name. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('bg-brand inline-flex size-9 items-center justify-center rounded-xl shadow-soft', className)}
    >
      <svg viewBox="0 0 24 24" className="size-5 text-white" fill="currentColor">
        <rect x="3.5" y="12" width="4.5" height="8.5" rx="1.6" opacity="0.85" />
        <rect x="9.75" y="4" width="4.5" height="16.5" rx="1.6" />
        <rect x="16" y="9" width="4.5" height="11.5" rx="1.6" opacity="0.7" />
      </svg>
    </span>
  );
}

/** Mark plus wordmark. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="font-display text-lg font-bold tracking-tight" style={{ fontFamily: 'var(--font-bricolage), var(--font-geist-sans), system-ui, sans-serif' }}>
        ALX Polly
      </span>
    </span>
  );
}
