import { cn } from '@/lib/utils';
import { statusDot } from '@/lib/format';

export function StatusPill({ status, label, className }: { status: string; label: string; className?: string }) {
  return (
    <span
      data-testid={`status-${status}`}
      className={cn('inline-flex items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-[11.5px] font-medium text-foreground/80', className)}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', statusDot[status] ?? 'bg-muted-foreground')} aria-hidden />
      {label}
    </span>
  );
}

export function KeyChip({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn('inline-flex h-6 min-w-[2.75rem] items-center justify-center rounded border border-primary/20 bg-accent px-1.5 font-mono text-[11px] font-medium text-accent-foreground', className)}>
      {value}
    </span>
  );
}
