import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { variableOutputs, type ProjectVariable, type VariableIdentity, type VariableInput, type VariableOutputId } from '@/domain/project-variables';
import { ServiceError } from '@/services/contracts';

export function MutationError({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'The change could not be saved.';
  const issues = error instanceof ServiceError ? error.issues : [];
  return (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive" data-testid="text-variable-mutation-error">
      <p className="font-medium">{message}</p>
      {issues.length > 0 && <ul className="mt-1 list-disc pl-4">{issues.map((i) => <li key={i}>{i}</li>)}</ul>}
    </div>
  );
}

function toKey(name: string) {
  const k = name.trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
  return /^[0-9]/.test(k) ? `_${k}` : k;
}

const emptyInput: VariableInput = { name: '', key: '', value: '', description: null, required: false, outputValues: {} };

export function VariableFormDialog({ open, mode, variable, pending, error, onClose, onSubmit }: {
  open: boolean; mode: 'create' | 'edit'; variable?: ProjectVariable; pending: boolean; error: unknown;
  onClose: () => void; onSubmit: (input: VariableInput) => void;
}) {
  const [form, setForm] = useState<VariableInput>(emptyInput);
  const [keyTouched, setKeyTouched] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(variable ? { name: variable.name, key: variable.key, value: variable.value, description: variable.description, required: variable.required, outputValues: { ...variable.outputValues } } : emptyInput);
    setKeyTouched(!!variable);
    setLocalError(null);
  }, [open, variable]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setLocalError('Name is required.');
    if (!form.key.trim()) return setLocalError('Key is required.');
    if (form.required && !form.value.trim()) return setLocalError('A required variable needs a default value.');
    setLocalError(null);
    const outputValues: VariableInput['outputValues'] = {};
    for (const o of variableOutputs) { const v = form.outputValues[o.id]; if (v && v.trim()) outputValues[o.id] = v; }
    onSubmit({ ...form, name: form.name.trim(), description: form.description?.trim() ? form.description : null, outputValues });
  };
  const setOutput = (id: VariableOutputId, v: string) => setForm((f) => ({ ...f, outputValues: { ...f.outputValues, [id]: v } }));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !pending) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto" onInteractOutside={(e) => pending && e.preventDefault()} onEscapeKeyDown={(e) => pending && e.preventDefault()} data-testid="dialog-variable-form">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'New variable' : 'Edit variable'}</DialogTitle>
          <DialogDescription>Text variables resolve to the default value unless an output override is set.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <fieldset disabled={pending} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="var-name">Name</Label>
                <Input id="var-name" value={form.name} data-testid="input-variable-name"
                  onChange={(e) => { const name = e.target.value; setForm((f) => ({ ...f, name, key: keyTouched ? f.key : toKey(name) })); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="var-key">Key</Label>
                <Input id="var-key" className="font-mono" value={form.key} data-testid="input-variable-key"
                  onChange={(e) => { setKeyTouched(true); setForm((f) => ({ ...f, key: e.target.value })); }} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="var-desc">Description</Label>
              <Input id="var-desc" value={form.description ?? ''} data-testid="input-variable-description"
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="var-value">Default value</Label>
              <Textarea id="var-value" rows={2} value={form.value} data-testid="input-variable-value"
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-[13.5px]">
              <Checkbox checked={form.required} onCheckedChange={(c) => setForm((f) => ({ ...f, required: c === true }))} data-testid="checkbox-variable-required" />
              Required (default value cannot be blank)
            </label>
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-[13px] font-medium">Output-specific values</p>
              <p className="text-[12.5px] text-muted-foreground">Override only when an output needs different wording. Empty resolves to the default.</p>
              {variableOutputs.map((o) => (
                <div key={o.id} className="grid items-center gap-1.5 sm:grid-cols-[120px_1fr]">
                  <Label htmlFor={`var-out-${o.id}`} className="text-[12.5px]">{o.label}</Label>
                  <Input id={`var-out-${o.id}`} value={form.outputValues[o.id] ?? ''} placeholder="Uses default" data-testid={`input-variable-output-${o.id}`}
                    onChange={(e) => setOutput(o.id, e.target.value)} />
                </div>
              ))}
            </div>
          </fieldset>
          {localError && <p role="alert" className="text-[13px] text-destructive" data-testid="text-variable-form-error">{localError}</p>}
          <MutationError error={error} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending} data-testid="button-variable-cancel">Cancel</Button>
            <Button type="submit" disabled={pending} data-testid="button-variable-save">{pending ? 'Saving…' : mode === 'create' ? 'Create variable' : 'Save changes'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function IdentityDialog({ open, mode, variable, existingKeys, pending, error, onClose, onSubmit }: {
  open: boolean; mode: 'rename' | 'duplicate'; variable?: ProjectVariable; existingKeys: string[]; pending: boolean; error: unknown;
  onClose: () => void; onSubmit: (input: VariableIdentity) => void;
}) {
  const [form, setForm] = useState<VariableIdentity>({ name: '', key: '' });
  const [localError, setLocalError] = useState<string | null>(null);
  const keysSig = existingKeys.join('|');
  useEffect(() => {
    if (!open || !variable) return;
    if (mode === 'rename') setForm({ name: variable.name, key: variable.key });
    else {
      const keys = new Set(keysSig.split('|'));
      let n = 1; let key = `${variable.key}_copy`;
      while (keys.has(key)) { n += 1; key = `${variable.key}_copy_${n}`; }
      setForm({ name: n === 1 ? `${variable.name} Copy` : `${variable.name} Copy ${n}`, key });
    }
    setLocalError(null);
  }, [open, mode, variable, keysSig]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.key.trim()) return setLocalError('Name and key are required.');
    setLocalError(null);
    onSubmit({ name: form.name.trim(), key: form.key.trim() });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !pending) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto" onInteractOutside={(e) => pending && e.preventDefault()} onEscapeKeyDown={(e) => pending && e.preventDefault()} data-testid={`dialog-variable-${mode}`}>
        <DialogHeader>
          <DialogTitle>{mode === 'rename' ? 'Rename variable' : 'Duplicate variable'}</DialogTitle>
          <DialogDescription>{mode === 'rename' ? 'Change the name and key. Values and overrides are kept.' : 'Creates a new variable with the same values and overrides.'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <fieldset disabled={pending} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="id-name">Name</Label>
              <Input id="id-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} data-testid="input-identity-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="id-key">Key</Label>
              <Input id="id-key" className="font-mono" value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} data-testid="input-identity-key" />
            </div>
          </fieldset>
          {localError && <p role="alert" className="text-[13px] text-destructive">{localError}</p>}
          <MutationError error={error} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending} data-testid="button-identity-cancel">Cancel</Button>
            <Button type="submit" disabled={pending} data-testid="button-identity-save">{pending ? 'Saving…' : mode === 'rename' ? 'Rename' : 'Duplicate'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
