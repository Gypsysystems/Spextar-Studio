import { Skeleton } from '@/components/ui/skeleton';
import { lazy, Suspense, useRef, type ComponentType } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Defer form-only dependencies without changing the loaded form or its state. */
export function createLazyDialog<P extends DialogProps>(
  title: string,
  load: () => Promise<{ default: ComponentType<P> }>,
) {
  const Content = lazy(load);
  function DownloadState({ failed, restoreFocus, ...props }: DialogProps & { failed?: boolean; restoreFocus: (event: Event) => void }) {
    return <Dialog {...props}>
      <DialogContent onCloseAutoFocus={restoreFocus}>
        <DialogHeader>
          <DialogTitle>{failed ? `${title} unavailable` : title}</DialogTitle>
          <DialogDescription>
            {failed ? 'The form could not be downloaded. Reload Studio to try again, or close this dialog to continue.' : 'Preparing your form.'}
          </DialogDescription>
        </DialogHeader>
        <div role={failed ? 'alert' : 'status'} className="text-sm text-muted-foreground">
          {failed ? 'No changes were made.' : <div aria-label="Preparing form" className="block space-y-4 py-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-24 w-full" /></div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          {failed && <Button onClick={() => window.location.reload()}>Reload Studio</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>;
  }
  return function LazyDialog(props: P) {
    const requested = useRef(false);
    const open = useRef(false);
    const opener = useRef<HTMLElement | null>(null);
    if (props.open && !open.current)
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    open.current = props.open;
    requested.current ||= props.open;
    const restoreFocus = (event: Event) => {
      // Loading -> form/error is a handoff, not a close. Only a real close
      // restores the original opener, never an element in the loading dialog.
      event.preventDefault();
      if (!open.current && opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    };
    // Keep a successfully loaded form mounted on close, as before.
    if (!requested.current) return null;
    return <ErrorBoundary FallbackComponent={() => <DownloadState {...props} restoreFocus={restoreFocus} failed />}>
      <Suspense fallback={<DownloadState {...props} restoreFocus={restoreFocus} />}>
        <Content {...props} />
      </Suspense>
    </ErrorBoundary>;
  };
}
