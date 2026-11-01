import { ArrowRight, Copy, Trash2 } from 'lucide-react';

/** Decorative icons share one treatment; the control's text remains its name. */
export function ActionIcon({ action }: { action: 'open' | 'duplicate' | 'delete' }) {
  const Icon = { open: ArrowRight, duplicate: Copy, delete: Trash2 }[action];
  return <Icon aria-hidden="true" focusable="false" className="mr-1.5 h-4 w-4 shrink-0" />;
}
