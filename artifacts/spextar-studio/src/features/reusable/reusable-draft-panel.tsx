import { lazy, Suspense, useMemo, useState, type ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScopeMarker } from '@/components/states';
import { ErrorBoundary, type ErrorFallbackProps } from '@/components/error-boundary';
import { useReusableDraft } from '@/hooks/use-reusable-draft';
import type { ReusableContext, ReusableItem } from '@/domain/reusable-content';
import type { TopicContent } from '@/domain/topic-content';

type EditorProps = { content: TopicContent; editable: boolean; onChange: (c: TopicContent) => void; loading?: boolean; deferRender?: boolean };
const loadEditor = () => import('@/features/editor/structured-editor').then((m) => ({ default: m.StructuredEditor as ComponentType<EditorProps> }));

const statusCopy = { loading: 'Loading…', saved: 'Saved', unsaved: 'Unsaved changes', saving: 'Saving…', error: 'Save failed', conflict: 'Conflict' } as const;

export function ReusableDraftPanel({ context, item }: { context: ReusableContext; item: ReusableItem }) {
  const { state, controller, sessionOnly } = useReusableDraft(context, item);
  const [attempt, setAttempt] = useState(0);
  const Editor = useMemo(() => lazy(loadEditor), [attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  const editable = controller.editable();

  function Fallback({ resetError }: ErrorFallbackProps) {
    return (
      <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-[13px] text-destructive" data-testid="reusable-body-editor-error">
        <p className="font-medium">The editor could not load. Your draft is unchanged.</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setAttempt((n) => n + 1); resetError(); }} data-testid="reusable-body-editor-retry">Retry</Button>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()} data-testid="reusable-body-editor-reload">Reload page</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4" data-testid="reusable-body">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold">Body draft</h3>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {sessionOnly && <ScopeMarker kind="demo">Demo · session only</ScopeMarker>}
          {!item.canEdit && <span className="rounded border px-1.5 py-0.5 text-muted-foreground" data-testid="reusable-body-readonly">Read-only</span>}
          <span className="tabular-nums text-muted-foreground" data-testid="reusable-body-revision">Revision {state.revision ?? 'none'}</span>
          <span role="status" className={state.status === 'error' || state.status === 'conflict' ? 'font-medium text-destructive' : 'text-muted-foreground'} data-testid="reusable-body-status">{statusCopy[state.status]}</span>
        </div>
      </div>
      {state.error && (
        <div role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive [overflow-wrap:anywhere]">
          <p>{state.error}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {state.status !== 'conflict' && <Button size="sm" variant="outline" onClick={() => void controller.retry()} data-testid="reusable-body-retry">Retry</Button>}
            <Button size="sm" variant="outline" onClick={() => void controller.reload()} data-testid="reusable-body-reload">Reload latest</Button>
          </div>
          {state.status === 'conflict' && <p className="mt-1 text-[12px]">Someone else saved a newer revision. Reload to continue; your local copy stays recoverable.</p>}
        </div>
      )}
      {state.recovery.length > 0 && (
        <div role="alert" className="mt-3 rounded-md border border-primary/30 bg-accent px-3 py-2 text-[13px] text-accent-foreground" data-testid="reusable-body-recovery">
          <p className="font-medium">Unsaved local changes were found in this browser.</p>
          <p className="text-[12px] opacity-80">Editing is paused until you restore or discard them.</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => controller.restore()} data-testid="reusable-body-recovery-restore">Restore</Button>
            <Button size="sm" variant="outline" onClick={() => controller.discard()} data-testid="reusable-body-recovery-discard">Discard</Button>
          </div>
        </div>
      )}
      {state.recoveryWarning && <p className="mt-2 text-[12px] text-muted-foreground" data-testid="reusable-body-recovery-warning">{state.recoveryWarning}</p>}
      <div className="mt-3">
        <ErrorBoundary FallbackComponent={Fallback} resetKey={attempt}>
          <Suspense fallback={<div className="space-y-2" aria-hidden><Skeleton className="h-9 w-full" /><Skeleton className="h-40 w-full" /></div>}>
            <Editor content={state.content} editable={editable} loading={!state.loaded} deferRender onChange={(c) => controller.changeDocument(c)} />
          </Suspense>
        </ErrorBoundary>
      </div>
      <p className="mt-2 text-[12px] text-muted-foreground">Saving the draft does not publish or update any topic that might use this content.</p>
    </div>
  );
}
