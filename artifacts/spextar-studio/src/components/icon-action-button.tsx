import { forwardRef } from 'react';
import { ArrowRight, Copy, FileText, Trash2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Compact actions retain explicit names, focus tooltips, and dialog-trigger refs. */
export const IconActionButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, 'children'> & {
  action: 'details' | 'duplicate' | 'delete' | 'open';
  label: string;
  children?: React.ReactNode;
}>(function IconActionButton({ action, label, children, ...props }, ref) {
  const Icon = { details: FileText, duplicate: Copy, delete: Trash2, open: ArrowRight }[action];
  const content = <Icon aria-hidden="true" focusable="false" />;
  return <Tooltip disableHoverableContent><TooltipTrigger asChild>
    <Button variant="outline" {...props} size="icon" aria-label={label} ref={ref}>
      {children ?? content}
    </Button>
  </TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
});
