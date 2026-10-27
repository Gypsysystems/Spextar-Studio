import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ServiceError } from '@/services/contracts';
import {
  categoryEditSchema, categoryInputSchema, conditionNameSchema, conditionValueEditSchema, conditionValueInputSchema, suggestConditionKey,
  type CategoryEdit, type CategoryInput, type ConditionCategory, type ConditionRename, type ConditionValue, type ConditionValueEdit, type ConditionValueInput,
} from '@/domain/project-conditions';

const KEY_HELP = 'Lowercase letter first; then lowercase letters, digits or underscores. Maximum 80 characters. Cannot change after creation.';

export function ConditionMutationError({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'The change could not be saved.';
  const issues = error instanceof ServiceError ? error.issues : [];
  return (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive" data-testid="text-condition-mutation-error">
      <p className="font-medium">{message}</p>
      {issues.length > 0 && <ul className="mt-1 list-disc pl-4">{issues.map((i) => <li key={i}>{i}</li>)}</ul>}
    </div>
  );
}

function issuesOf(r: { success: boolean; error?: { issues: { message: string }[] } }) {
  return r.success ? null : (r.error?.issues ?? []).map((i) => i.message).filter((m, n, a) => a.indexOf(m) === n).join(' ');
}

function Shell({ open, pending, title, description, testId, onClose, children }: {
  open: boolean; pending: boolean; title: string; description: string; testId: string; onClose: () => void; children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !pending) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto" onInteractOutside={(e) => pending && e.preventDefault()} onEscapeKeyDown={(e) => pending && e.preventDefault()} data-testid={testId}>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function Footer({ pending, label, onClose, prefix }: { pending: boolean; label: string; onClose: () => void; prefix: string }) {
  return (
    <DialogFooter className="gap-2">
      <Button type="button" variant="outline" onClick={onClose} disabled={pending} data-testid={`button-${prefix}-cancel`}>Cancel</Button>
      <Button type="submit" disabled={pending} data-testid={`button-${prefix}-save`}>{pending ? 'Saving…' : label}</Button>
    </DialogFooter>
  );
}

function ReadonlyKey({ value, testId }: { value: string; testId: string }) {
  return (
    <div className="space-y-1.5">
      <Label>Key</Label>
      <code className="block break-all rounded-md border bg-muted px-3 py-2 font-mono text-[13px]" data-testid={testId}>{value}</code>
      <p className="text-xs text-muted-foreground">Keys and IDs are preserved so existing references stay stable.</p>
    </div>
  );
}

/* Category create/edit. Form body mounts only while open, so list refetches never reset typed state. */
function CategoryForm({ mode, category, pending, error, onClose, onSubmit }: {
  mode: 'create' | 'edit'; category?: ConditionCategory; pending: boolean; error: unknown; onClose: () => void;
  onSubmit: (v: { mode: 'create'; input: CategoryInput } | { mode: 'edit'; input: CategoryEdit }) => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [key, setKey] = useState(category?.key ?? '');
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState(category?.description ?? '');
  const [unassigned, setUnassigned] = useState<'include' | 'exclude'>(category?.unassignedBehavior ?? 'include');
  const [match, setMatch] = useState<'any' | 'all'>(category?.valueMatchMode ?? 'any');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const base = { name, description: description.trim() ? description : null, unassignedBehavior: unassigned, valueMatchMode: match };
    if (mode === 'create') {
      const r = categoryInputSchema.safeParse({ ...base, key });
      if (!r.success) return setLocalError(issuesOf(r));
      setLocalError(null); onSubmit({ mode, input: r.data });
    } else {
      const r = categoryEditSchema.safeParse(base);
      if (!r.success) return setLocalError(issuesOf(r));
      setLocalError(null); onSubmit({ mode, input: r.data });
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <fieldset disabled={pending} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" maxLength={120} value={name} data-testid="input-category-name"
              onChange={(e) => { const v = e.target.value; setName(v); if (mode === 'create' && !keyTouched) setKey(suggestConditionKey(v)); }} />
          </div>
          {mode === 'create' ? (
            <div className="space-y-1.5">
              <Label htmlFor="cat-key">Key</Label>
              <Input id="cat-key" className="font-mono" value={key} aria-describedby="cat-key-help" data-testid="input-category-key"
                onChange={(e) => { setKeyTouched(true); setKey(e.target.value); }} />
              <p id="cat-key-help" className="text-xs text-muted-foreground">{KEY_HELP}</p>
            </div>
          ) : <ReadonlyKey value={category?.key ?? ''} testId="text-category-form-key" />}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cat-desc">Description <span className="text-muted-foreground">(optional)</span></Label>
          <Textarea id="cat-desc" rows={2} value={description} data-testid="input-category-description" onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cat-unassigned">Content with no tag from this category</Label>
            <Select value={unassigned} onValueChange={(v) => setUnassigned(v as 'include' | 'exclude')}>
              <SelectTrigger id="cat-unassigned" data-testid="select-category-unassigned"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="include">Include (default)</SelectItem>
                <SelectItem value="exclude">Exclude</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-match">Multiple values in this category</Label>
            <Select value={match} onValueChange={(v) => setMatch(v as 'any' | 'all')}>
              <SelectTrigger id="cat-match" data-testid="select-category-match"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Match any (OR, default)</SelectItem>
                <SelectItem value="all">Match all (AND)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-[12px] text-muted-foreground">Different categories always combine with AND. These rules apply once content assignment is available. Other category settings are kept unchanged.</p>
      </fieldset>
      {localError && <p role="alert" className="text-[13px] text-destructive" data-testid="text-category-form-error">{localError}</p>}
      <ConditionMutationError error={error} />
      <Footer pending={pending} onClose={onClose} prefix="category" label={mode === 'create' ? 'Create category' : 'Save changes'} />
    </form>
  );
}

export function CategoryFormDialog({ open, mode, category, pending, error, onClose, onSubmit }: Parameters<typeof CategoryForm>[0] & { open: boolean }) {
  return (
    <Shell open={open} pending={pending} onClose={onClose} testId="dialog-category-form" title={mode === 'create' ? 'New condition category' : 'Edit category'}
      description="A category groups related values, such as Audience or Platform.">
      {open && <CategoryForm key={category?.id ?? 'new'} mode={mode} category={category} pending={pending} error={error} onClose={onClose} onSubmit={onSubmit} />}
    </Shell>
  );
}

function RenameForm({ currentName, currentKey, kind, pending, error, onClose, onSubmit }: {
  currentName: string; currentKey: string; kind: 'category' | 'value'; pending: boolean; error: unknown; onClose: () => void; onSubmit: (i: ConditionRename) => void;
}) {
  const [name, setName] = useState(currentName);
  const [localError, setLocalError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = conditionNameSchema.safeParse({ name });
    if (!r.success) return setLocalError(issuesOf(r));
    setLocalError(null); onSubmit(r.data);
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <fieldset disabled={pending} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="cond-rename">Name</Label>
          <Input id="cond-rename" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} data-testid={`input-rename-${kind}-name`} />
        </div>
        <ReadonlyKey value={currentKey} testId={`text-rename-${kind}-key`} />
      </fieldset>
      {localError && <p role="alert" className="text-[13px] text-destructive" data-testid={`text-rename-${kind}-error`}>{localError}</p>}
      <ConditionMutationError error={error} />
      <Footer pending={pending} onClose={onClose} prefix={`rename-${kind}`} label="Rename" />
    </form>
  );
}

export function ConditionRenameDialog(props: Parameters<typeof RenameForm>[0] & { open: boolean; targetId: string }) {
  const { open, targetId, ...rest } = props;
  return (
    <Shell open={open} pending={rest.pending} onClose={rest.onClose} testId={`dialog-rename-${rest.kind}`} title={rest.kind === 'category' ? 'Rename category' : 'Rename value'}
      description="Changes the display name only. The key and ID are preserved.">
      {open && <RenameForm key={targetId} {...rest} />}
    </Shell>
  );
}

function ValueForm({ mode, value, suggestedOrder, pending, error, onClose, onSubmit }: {
  mode: 'create' | 'edit'; value?: ConditionValue; suggestedOrder: number; pending: boolean; error: unknown; onClose: () => void;
  onSubmit: (v: { mode: 'create'; input: ConditionValueInput } | { mode: 'edit'; input: ConditionValueEdit }) => void;
}) {
  const [name, setName] = useState(value?.name ?? '');
  const [key, setKey] = useState(value?.key ?? '');
  const [keyTouched, setKeyTouched] = useState(false);
  const [order, setOrder] = useState(String(value?.sortOrder ?? suggestedOrder));
  const [localError, setLocalError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const sortOrder = /^\d+$/.test(order.trim()) ? Number(order.trim()) : NaN;
    if (!Number.isSafeInteger(sortOrder)) return setLocalError('Order must be a whole number of 0 or more.');
    if (mode === 'create') {
      const r = conditionValueInputSchema.safeParse({ name, key, sortOrder });
      if (!r.success) return setLocalError(issuesOf(r));
      setLocalError(null); onSubmit({ mode, input: r.data });
    } else {
      const r = conditionValueEditSchema.safeParse({ name, sortOrder });
      if (!r.success) return setLocalError(issuesOf(r));
      setLocalError(null); onSubmit({ mode, input: r.data });
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <fieldset disabled={pending} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="val-name">Name</Label>
            <Input id="val-name" maxLength={120} value={name} data-testid="input-value-name"
              onChange={(e) => { const v = e.target.value; setName(v); if (mode === 'create' && !keyTouched) setKey(suggestConditionKey(v)); }} />
          </div>
          {mode === 'create' ? (
            <div className="space-y-1.5">
              <Label htmlFor="val-key">Key</Label>
              <Input id="val-key" className="font-mono" value={key} aria-describedby="val-key-help" data-testid="input-value-key"
                onChange={(e) => { setKeyTouched(true); setKey(e.target.value); }} />
              <p id="val-key-help" className="text-xs text-muted-foreground">{KEY_HELP}</p>
            </div>
          ) : <ReadonlyKey value={value?.key ?? ''} testId="text-value-form-key" />}
        </div>
        <div className="space-y-1.5 sm:max-w-[200px]">
          <Label htmlFor="val-order">Order</Label>
          <Input id="val-order" type="number" inputMode="numeric" min={0} step={1} value={order} aria-describedby="val-order-help" data-testid="input-value-order" onChange={(e) => setOrder(e.target.value)} />
          <p id="val-order-help" className="text-xs text-muted-foreground">Lower numbers list first. Equal orders use stable IDs. Only this value changes.</p>
        </div>
      </fieldset>
      {localError && <p role="alert" className="text-[13px] text-destructive" data-testid="text-value-form-error">{localError}</p>}
      <ConditionMutationError error={error} />
      <Footer pending={pending} onClose={onClose} prefix="value" label={mode === 'create' ? 'Add value' : 'Save changes'} />
    </form>
  );
}

export function ValueFormDialog(props: Parameters<typeof ValueForm>[0] & { open: boolean }) {
  const { open, ...rest } = props;
  return (
    <Shell open={open} pending={rest.pending} onClose={rest.onClose} testId="dialog-value-form" title={rest.mode === 'create' ? 'Add value' : 'Edit value'}
      description="Values are the tags authors will choose within this category.">
      {open && <ValueForm key={rest.value?.id ?? 'new'} {...rest} />}
    </Shell>
  );
}
