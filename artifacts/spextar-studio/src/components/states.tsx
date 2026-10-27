import type { ReactNode } from 'react';
import { AlertTriangle, Compass, FlaskConical, Plug, RotateCw, type LucideIcon } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type ScopeKind = 'demo' | 'placeholder' | 'not-connected' | 'connected';

const scopeStyles: Record<ScopeKind, { icon: LucideIcon; label: string; cls: string }> = {
  demo: { icon: FlaskConical, label: 'Demo', cls: 'border-primary/25 bg-accent text-accent-foreground' },
  placeholder: { icon: Compass, label: 'Placeholder', cls: 'border-amber-500/30 bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300' },
  'not-connected': { icon: Plug, label: 'Not connected', cls: 'border-border bg-muted text-muted-foreground' },
  connected: { icon: Plug, label: 'Connected', cls: 'border-primary/25 bg-accent text-accent-foreground' },
};

/** Explicit scope marker separating demo/placeholder behaviour from real functionality. */
export function ScopeMarker({ kind, children, className }: { kind: ScopeKind; children?: ReactNode; className?: string }) {
  const s = scopeStyles[kind];
  const Icon = s.icon;
  return (
    <span
      data-testid={`scope-${kind}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.08em]',
        s.cls,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {children ?? s.label}
    </span>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-md border bg-card px-4 py-4">
          <Skeleton className="h-8 w-12" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="hidden h-3 w-16 sm:block" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6 md:p-10" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-8 w-80 max-w-full" />
      <Skeleton className="h-4 w-[28rem] max-w-full" />
      <ListSkeleton rows={4} />
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Something did not load' }: { error: unknown; onRetry: () => void; title?: string }) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-6">
      <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry} data-testid="button-retry">
        <RotateCw className="mr-1.5 h-3.5 w-3.5" /> Retry
      </Button>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="grid-paper flex flex-col items-center rounded-lg border border-dashed px-6 py-14 text-center" data-testid="state-empty">
      <span className="flex h-11 w-11 items-center justify-center rounded-md border bg-card text-primary shadow-sm">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="mt-4 font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function NotFoundPanel({
  what,
  detail,
  backHref = '/workspaces',
  backLabel = 'Back to Workspaces',
}: {
  what: string;
  detail?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start px-6 py-20 fade-up" data-testid="state-not-found">
      <span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">404 · Not found</span>
      <h1 className="mt-3 text-2xl font-semibold">{what} not found</h1>
      <p className="mt-2 text-muted-foreground">
        {detail ?? 'It may have been removed, or the link points to a different workspace.'}
      </p>
      <Button asChild className="mt-6" data-testid="link-not-found-back">
        <Link href={backHref}>{backLabel}</Link>
      </Button>
    </div>
  );
}
