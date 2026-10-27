import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ScopeMarker } from '@/components/states';
import { useServices } from '@/providers/services-provider';
import { useCreateProject } from '@/hooks/use-studio-data';
import { useToast } from '@/hooks/use-toast';
import { suggestKey } from '@/domain/project-identifiers';
import { projectBase } from '@/features/project/sections';

const schema = z.object({
  name: z.string().trim().min(3, 'Use at least 3 characters').max(80, 'Keep it under 80 characters'),
  key: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9]{1,9}$/, '2–10 uppercase letters or digits, starting with a letter'),
  product: z.string().trim().max(80),
  description: z.string().trim().max(400, 'Keep it under 400 characters'),
});
type Values = z.infer<typeof schema>;

export function CreateProjectDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateProject(workspaceId);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { mode } = useServices();
  const keyTouched = useRef(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', key: '', product: '', description: '' },
  });

  useEffect(() => {
    if (open) {
      form.reset({ name: '', key: '', product: '', description: '' });
      keyTouched.current = false;
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = (values: Values) => {
    create.mutate(values, {
      onSuccess: (project) => {
        toast({ title: 'Project created', description: `${project.name} (${project.key}) is saved ${mode === 'demo' ? 'in this browser' : 'to your workspace'}.` });
        onOpenChange(false);
        navigate(projectBase(workspaceId, project.id));
      },
      onError: (err) => {
        form.setError('key', { message: err instanceof Error ? err.message : 'Could not create project' });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]" data-testid="dialog-create-project">
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>
            A project holds the documents and topics for one deliverable set.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      autoFocus
                      placeholder="Meridian X5 Installation Guide"
                      data-testid="input-project-name"
                      onChange={(e) => {
                        field.onChange(e);
                        if (!keyTouched.current) form.setValue('key', e.target.value.trim() ? suggestKey(e.target.value) : '');
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
              <FormField
                control={form.control}
                name="key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Key</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="font-mono uppercase"
                        maxLength={10}
                        placeholder="MX5"
                        data-testid="input-project-key"
                        onChange={(e) => {
                          keyTouched.current = true;
                          field.onChange(e.target.value.toUpperCase());
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="product"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={mode === 'backend'} placeholder={mode === 'demo' ? 'Meridian X5' : 'Not part of F0/F1'} data-testid="input-project-product" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} placeholder="Audience, scope and release this project covers." data-testid="input-project-description" />
                  </FormControl>
                  <FormDescription>{mode === 'demo' ? 'The key prefixes document IDs and cannot repeat in a workspace.' : 'The key is saved as the project slug and cannot repeat in a workspace.'}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="items-center gap-2 sm:justify-between">
              {mode === 'demo' ? <ScopeMarker kind="demo">Saved to this browser</ScopeMarker> : <span className="text-xs text-muted-foreground">Saved securely to your workspace</span>}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} data-testid="button-cancel-create">
                  Cancel
                </Button>
                <Button type="submit" disabled={create.isPending} data-testid="button-submit-create-project">
                  {create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Create project
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
