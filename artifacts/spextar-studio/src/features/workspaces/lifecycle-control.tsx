import { useState } from 'react';
import type { LifecycleScope } from '@/domain/lifecycle';
import { Button } from '@/components/ui/button';
import { createLazyDialog } from '@/components/lazy-dialog';
import { useServices } from '@/providers/services-provider';

const LifecycleDialog = createLazyDialog('Manage details', () =>
  import('./lifecycle-dialog').then((m) => ({ default: m.LifecycleDialog })));

/** Lightweight entry point: forms and destructive confirmation stay outside the initial graph. */
export function LifecycleControl({ scope, label, disabled, deleteOnly = false }: {
  scope: LifecycleScope; label: string; disabled?: boolean; deleteOnly?: boolean;
}) {
  const { mode, lifecycle } = useServices();
  const [open, setOpen] = useState(false);
  if (mode !== 'backend' || !lifecycle) return null;
  return <>
    <Button type="button" variant={deleteOnly ? 'destructive' : 'outline'} size="sm"
      disabled={disabled} onClick={() => setOpen(true)} data-testid={`button-manage-${scope.kind}`}>
      {label}
    </Button>
    {open && <LifecycleDialog scope={scope} deleteOnly={deleteOnly} open={open} onOpenChange={setOpen} />}
  </>;
}
