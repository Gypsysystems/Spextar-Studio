import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ScopeMarker } from '@/components/states';
import { useServices } from '@/providers/services-provider';
import { useCreateWorkspace } from '@/hooks/use-studio-data';
import { useToast } from '@/hooks/use-toast';

const schema = z.object({
  name: z.string().trim().min(3, 'Use at least 3 characters').max(60),
  description: z.string().trim().max(240),
});
type Values = z.infer<typeof schema>;

export function CreateWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { mode } = useServices();
  const create = useCreateWorkspace();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', description: '' } });

  useEffect(() => {
    if (open) form.reset({ name: '', description: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = (v: Values) =>
    create.mutate(v, {
      onSuccess: (ws) => {
        toast({ title: 'Workspace created', description: ws.name });
        onOpenChange(false);
        navigate(`/workspaces/${ws.id}/projects`);
      },
      onError: (e) => form.setError('name', { message: e instanceof Error ? e.message : 'Could not create workspace' }),
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]" data-testid="dialog-create-workspace">
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
          <DialogDescription>Workspaces group projects that share a team and governance.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Workspace name</FormLabel>
                  <FormControl>
                    <Input {...field} autoFocus placeholder="Regulatory Submissions" data-testid="input-workspace-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} data-testid="input-workspace-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="items-center gap-2 sm:justify-between">
              {mode === 'demo' ? <ScopeMarker kind="demo">Saved to this browser</ScopeMarker> : <span className="text-xs text-muted-foreground">Saved securely to your organization</span>}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} data-testid="button-cancel-workspace">
                  Cancel
                </Button>
                <Button type="submit" disabled={create.isPending} data-testid="button-submit-workspace">
                  {create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Create workspace
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
