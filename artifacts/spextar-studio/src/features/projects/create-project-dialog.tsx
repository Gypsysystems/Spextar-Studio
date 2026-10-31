import { z } from 'zod';
import { useServices } from '@/providers/services-provider';
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useCreateProject } from '@/hooks/use-studio-data';
import { projectBase } from '@/features/project/sections';

const inputSchema = z.object({ name: z.string().trim().min(3, 'Use at least 3 characters').max(80, 'Keep it under 80 characters'), description: z.string().trim().max(400, 'Keep it under 400 characters'), product: z.string().trim().max(80) });

export function CreateProjectDialog({ workspaceId, open, onOpenChange }: { workspaceId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { mode } = useServices();
  const create = useCreateProject(workspaceId);
  const [, navigate] = useLocation();
  const [validation, setValidation] = useState('');
  const [name, setName] = useState('');
  const [product, setProduct] = useState('');
  const [description, setDescription] = useState('');
  useEffect(() => { if (open) { setValidation(''); setName(''); setProduct(''); setDescription(''); create.reset(); } }, [open]);
  return <Dialog open={open} onOpenChange={next => { if (!create.isPending) onOpenChange(next); }}>
    <DialogContent className="sm:max-w-[520px]" data-testid="dialog-create-project">
      <DialogHeader><DialogTitle>Create project</DialogTitle><DialogDescription>A project holds the documents and topics for one deliverable set.</DialogDescription></DialogHeader>
      <form noValidate className="space-y-4" onSubmit={e => {
        e.preventDefault();
        const parsed = inputSchema.safeParse({ name, description, product: mode === 'demo' ? product : '' });
        if (!parsed.success) { setValidation(parsed.error.issues.map(i => i.message).join(' ')); return; }
        setValidation('');
        // A random suffix avoids same-name collisions without retrying ambiguous writes.
        const key = 'P' + crypto.randomUUID().replaceAll('-', '').slice(0, 9).toUpperCase();
        create.mutate({ ...parsed.data, key }, { onSuccess: project => { onOpenChange(false); navigate(projectBase(workspaceId, project.id)); } });
      }}>
        <label className="block text-sm">Project name<Input autoFocus required minLength={3} maxLength={80} value={name} onChange={e => setName(e.target.value)} data-testid="input-project-name" /></label>
        {mode === 'demo' && <label className="block text-sm">Product (optional)<Input maxLength={80} value={product} onChange={e => setProduct(e.target.value)} data-testid="input-project-product" /></label>}
        <label className="block text-sm">Description (optional)<Textarea rows={3} maxLength={400} value={description} onChange={e => setDescription(e.target.value)} data-testid="input-project-description" /></label>
        {validation && <p role="alert" className="text-sm text-destructive">{validation}</p>}
        {create.error && <p role="alert" className="text-sm text-destructive">{create.error.message}</p>}
        <DialogFooter><Button variant="ghost" type="button" disabled={create.isPending} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={create.isPending} data-testid="button-submit-create-project">{create.isPending ? 'Creating…' : 'Create project'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
