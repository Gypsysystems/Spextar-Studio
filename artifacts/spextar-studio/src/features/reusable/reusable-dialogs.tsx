import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ServiceError } from '@/services/contracts';
import {
  reusableEditSchema, reusableIdentitySchema, reusableInputSchema,
  type ReusableEdit, type ReusableInput, type ReusableItem, type ReusableScope, type ReusableStatus, type UpdatePolicy,
} from '@/domain/reusable-content';
import { policyHelp, policyLabels, scopeLabels, statusLabels } from './reusable-panels';

export function ReusableMutationError({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'The change could not be saved.';
  const issues = error instanceof ServiceError ? error.issues : [];
  return (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive [overflow-wrap:anywhere]" data-testid="reusable-mutation-error">
      <p className="font-medium">{message}</p>
      {issues.length > 0 && <ul className="mt-1 list-disc pl-4">{issues.map((i) => <li key={i}>{i}</li>)}</ul>}
    </div>
  );
}

function issuesOf(r: { success: boolean; error?: { issues: { message: string }[] } }) {
  return r.success ? null : (r.error?.issues ?? []).map((i) => i.message).filter((m, n, a) => a.indexOf(m) === n).join(' ');
}
export function suggestSlug(name: string) {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
}
function parseTags(raw: string) {
  const out: string[] = [];
  for (const t of raw.split(/[,\n]/)) { const v = t.trim(); if (v && !out.includes(v)) out.push(v); }
  return out;
}

function Shell({ open, pending, title, description, onClose, children }: { open: boolean; pending: boolean; title: string; description: string; onClose: () => void; children: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !pending) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto" onInteractOutside={(e) => pending && e.preventDefault()} onEscapeKeyDown={(e) => pending && e.preventDefault()} data-testid="reusable-dialog">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
function Footer({ pending, label, onClose, blocked }: { pending: boolean; label: string; onClose: () => void; blocked?: boolean }) {
  return (
    <DialogFooter className="gap-2">
      <Button type="button" variant="outline" onClick={onClose} disabled={pending} data-testid="reusable-cancel">Cancel</Button>
      <Button type="submit" disabled={pending || blocked} data-testid="reusable-submit">{pending ? 'Saving…' : label}</Button>
    </DialogFooter>
  );
}
function Readonly({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <code className="block break-all rounded-md border bg-muted px-3 py-2 font-mono text-[13px]" data-testid={testId}>{value}</code>
    </div>
  );
}

export type ScopeAvailability = { loading: boolean; error: boolean; workspace: boolean; project: boolean };
export type FormSubmit = { mode: 'create'; input: ReusableInput } | { mode: 'edit'; input: ReusableEdit };

function ReusableForm({ mode, item, scopes, pending, error, onClose, onSubmit }: {
  mode: 'create' | 'edit'; item?: ReusableItem; scopes: ScopeAvailability; pending: boolean; error: unknown; onClose: () => void; onSubmit: (v: FormSubmit) => void;
}) {
  const allowed = (s: ReusableScope) => !scopes.loading && !scopes.error && scopes[s];
  const [name, setName] = useState(item?.name ?? '');
  const [slug, setSlug] = useState(item?.slug ?? '');

  const [scope, setScope] = useState<ReusableScope | ''>(allowed('project') ? 'project' : allowed('workspace') ? 'workspace' : '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [status, setStatus] = useState<ReusableStatus>(item?.status ?? 'draft');
  const [policy, setPolicy] = useState<UpdatePolicy>(item?.updatePolicy ?? 'notify');
  const [tags, setTags] = useState((item?.tags ?? []).join(', '));
  const [settings, setSettings] = useState(JSON.stringify(item?.settings ?? {}, null, 2));
  const [localError, setLocalError] = useState<string | null>(null);

  let settingsError: string | null = null;
  let parsedSettings: unknown = null;
  try {
    parsedSettings = JSON.parse(settings);
    if (!parsedSettings || typeof parsedSettings !== 'object' || Array.isArray(parsedSettings)) settingsError = 'Settings must be a JSON object.';
  } catch { settingsError = 'Settings is not valid JSON.'; }
  const scopeBlocked = mode === 'create' && (scope === '' || !allowed(scope));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (settingsError) return setLocalError(settingsError);
    const base = { name, description: description.trim() ? description : null, status, updatePolicy: policy, tags: parseTags(tags), settings: parsedSettings };
    if (mode === 'create') {
      if (scopeBlocked) return setLocalError('Choose a scope you are allowed to create in.');
      const r = reusableInputSchema.safeParse({ ...base, scope, slug });
      if (!r.success) return setLocalError(issuesOf(r));
      setLocalError(null); onSubmit({ mode, input: r.data as ReusableInput });
    } else {
      const r = reusableEditSchema.safeParse(base);
      if (!r.success) return setLocalError(issuesOf(r));
      setLocalError(null); onSubmit({ mode, input: r.data as ReusableEdit });
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate data-testid="reusable-form">
      <fieldset disabled={pending} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ru-name">Name</Label>
            <Input id="ru-name" maxLength={120} value={name} data-testid="reusable-field-name"
              onChange={(e) => { const v = e.target.value; setName(v); if (mode === 'create') setSlug(suggestSlug(v)); }} />
          </div>

        </div>
        {mode === 'create' ? (
          <div className="space-y-1.5">
            <Label htmlFor="ru-scope">Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as ReusableScope)} disabled={scopes.loading || scopes.error}>
              <SelectTrigger id="ru-scope" data-testid="reusable-field-scope"><SelectValue placeholder={scopes.loading ? 'Checking permissions…' : 'No scope available'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="project" disabled={!allowed('project')}>Project (this project only)</SelectItem>
                <SelectItem value="workspace" disabled={!allowed('workspace')}>Workspace (shared across projects)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground" data-testid="reusable-scope-help">
              {scopes.loading ? 'Permissions are loading; creation is paused.' : scopes.error ? 'Permissions could not be checked; creation is blocked.' : 'Scope cannot change after creation.'}
            </p>
          </div>
        ) : <Readonly label="Scope" value={item ? scopeLabels[item.scope] : ''} testId="reusable-field-scope-readonly" />}
        <div className="space-y-1.5">
          <Label htmlFor="ru-desc">Description <span className="text-muted-foreground">(optional)</span></Label>
          <Textarea id="ru-desc" rows={2} value={description} data-testid="reusable-field-description" onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ru-status">Lifecycle status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ReusableStatus)}>
              <SelectTrigger id="ru-status" data-testid="reusable-field-status"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(statusLabels) as ReusableStatus[]).map((s) => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ru-policy">Linked-update policy</Label>
            <Select value={policy} onValueChange={(v) => setPolicy(v as UpdatePolicy)}>
              <SelectTrigger id="ru-policy" data-testid="reusable-field-policy"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(policyLabels) as UpdatePolicy[]).map((p) => <SelectItem key={p} value={p}>{policyLabels[p]}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{policyHelp[policy]}</p>
          </div>
        </div>
        <p className="text-[12px] text-muted-foreground">Status and policy are metadata only. Saving does not publish, review or propagate anything.</p>
        <div className="space-y-1.5">
          <Label htmlFor="ru-tags">Tags</Label>
          <Input id="ru-tags" value={tags} data-testid="reusable-field-tags" onChange={(e) => setTags(e.target.value)} placeholder="safety, onboarding" />
          <p className="text-xs text-muted-foreground">Comma-separated. Spaces are trimmed and duplicates removed.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ru-settings">Settings (JSON object)</Label>
          <Textarea id="ru-settings" rows={6} spellCheck={false} className="font-mono text-[12.5px]" value={settings} aria-invalid={!!settingsError}
            data-testid="reusable-field-settings" onChange={(e) => setSettings(e.target.value)} />
          {settingsError
            ? <p className="text-xs text-destructive" data-testid="reusable-settings-error">{settingsError} Saving is blocked until it is fixed.</p>
            : <p className="text-xs text-muted-foreground">Unknown keys are preserved exactly.</p>}
        </div>
      </fieldset>
      {localError && <p role="alert" className="text-[13px] text-destructive [overflow-wrap:anywhere]" data-testid="reusable-form-error">{localError}</p>}
      <ReusableMutationError error={error} />
      <Footer pending={pending} onClose={onClose} blocked={!!settingsError || scopeBlocked} label={mode === 'create' ? 'Create' : 'Save changes'} />
    </form>
  );
}

export function ReusableFormDialog(props: Parameters<typeof ReusableForm>[0] & { open: boolean }) {
  const { open, ...rest } = props;
  return (
    <Shell open={open} pending={rest.pending} onClose={rest.onClose} title={rest.mode === 'create' ? 'New reusable content' : 'Edit reusable content'}
      description={rest.mode === 'create' ? 'Defines metadata. Open the draft afterwards to write the body.' : 'Scope and identity stay unchanged.'}>
      {open && <ReusableForm key={rest.item?.id ?? 'new'} {...rest} />}
    </Shell>
  );
}

function IdentityForm({ mode, item, pending, error, onClose, onSubmit }: {
  mode: 'rename' | 'duplicate'; item: ReusableItem; pending: boolean; error: unknown; onClose: () => void; onSubmit: (v: { name: string; slug: string }) => void;
}) {
  const [name, setName] = useState(mode === 'duplicate' ? `${item.name} copy`.slice(0, 120) : item.name);
  const [slug, setSlug] = useState(mode === 'duplicate' ? suggestSlug(`${item.slug}-copy`) : item.slug);
  const [localError, setLocalError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'rename') {
      const r = reusableIdentitySchema.pick({ name: true }).safeParse({ name });
      if (!r.success) return setLocalError(issuesOf(r));
      setLocalError(null); return onSubmit({ name: r.data.name, slug: item.slug });
    }
    const r = reusableIdentitySchema.safeParse({ name, slug });
    if (!r.success) return setLocalError(issuesOf(r));
    if (r.data.slug === item.slug) return setLocalError('Use a new slug for the copy.');
    setLocalError(null); onSubmit(r.data);
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate data-testid="reusable-form">
      <fieldset disabled={pending} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ru-id-name">Name</Label>
          <Input id="ru-id-name" maxLength={120} value={name} onChange={(e) => { setName(e.target.value); if (mode === 'duplicate') setSlug(suggestSlug(e.target.value)); }} data-testid="reusable-field-name" />
        </div>

      </fieldset>
      {localError && <p role="alert" className="text-[13px] text-destructive" data-testid="reusable-form-error">{localError}</p>}
      <ReusableMutationError error={error} />
      <Footer pending={pending} onClose={onClose} label={mode === 'rename' ? 'Rename' : 'Duplicate'} />
    </form>
  );
}

export function ReusableIdentityDialog(props: Parameters<typeof IdentityForm>[0] & { open: boolean }) {
  const { open, ...rest } = props;
  return (
    <Shell open={open} pending={rest.pending} onClose={rest.onClose} title={rest.mode === 'rename' ? 'Rename' : 'Duplicate'}
      description={rest.mode === 'rename' ? 'Changes the display name only. Scope and identity are preserved.' : 'Creates a new item in the same scope. The body draft is copied when possible.'}>
      {open && <IdentityForm key={`${rest.mode}-${rest.item.id}`} {...rest} />}
    </Shell>
  );
}
