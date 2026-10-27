import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useLocation } from 'wouter';
import { AlertTriangle, CheckCircle2, Download, FileJson, Loader2, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScopeMarker } from '@/components/states';
import { useImportProject } from '@/hooks/use-studio-data';
import { useToast } from '@/hooks/use-toast';
import { IMPORT_EXAMPLE, MAX_IMPORT_BYTES, formatIssues, importSchema, type ImportPayload } from '@/services/import-schema';
import { ServiceError } from '@/services/contracts';
import { projectBase } from '@/features/project/sections';
import { cn } from '@/lib/utils';

type Parsed =
  | { state: 'idle' }
  | { state: 'invalid'; fileName: string; issues: string[] }
  | { state: 'valid'; fileName: string; raw: unknown; data: ImportPayload };

export function ImportProjectDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const importer = useImportProject(workspaceId);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed>({ state: 'idle' });
  const [dragging, setDragging] = useState(false);

  const close = (next: boolean) => {
    if (!next) {
      setParsed({ state: 'idle' });
      importer.reset();
    }
    onOpenChange(next);
  };

  const readFile = async (file: File) => {
    importer.reset();
    if (!file.name.toLowerCase().endsWith('.json')) {
      setParsed({ state: 'invalid', fileName: file.name, issues: ['Only .json files are accepted'] });
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setParsed({ state: 'invalid', fileName: file.name, issues: ['File is larger than 1 MB'] });
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      setParsed({ state: 'invalid', fileName: file.name, issues: ['File is not valid JSON'] });
      return;
    }
    const result = importSchema.safeParse(raw);
    if (!result.success) setParsed({ state: 'invalid', fileName: file.name, issues: formatIssues(result.error) });
    else setParsed({ state: 'valid', fileName: file.name, raw, data: result.data });
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void readFile(f);
    e.target.value = '';
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void readFile(f);
  };

  const downloadExample = () => {
    const blob = new Blob([JSON.stringify(IMPORT_EXAMPLE, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spextar-import-example.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const submit = () => {
    if (parsed.state !== 'valid') return;
    importer.mutate(parsed.raw, {
      onSuccess: (res) => {
        toast({
          title: 'Project imported',
          description: `${res.project.name}: ${res.documentCount} documents, ${res.topicCount} topics.`,
        });
        close(false);
        navigate(projectBase(workspaceId, res.project.id));
      },
    });
  };

  const serverIssues =
    importer.error instanceof ServiceError && importer.error.issues.length
      ? importer.error.issues
      : importer.error
        ? [importer.error instanceof Error ? importer.error.message : 'Import failed']
        : [];

  const docs = parsed.state === 'valid' ? parsed.data.project.documents : [];
  const topicCount = docs.reduce((n, d) => n + d.topics.length, 0);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-[560px]" data-testid="dialog-import-project">
        <DialogHeader>
          <DialogTitle>Import project</DialogTitle>
          <DialogDescription>
            Upload a SPEXTAR import file (JSON, version 1). The file is validated before anything is created.
          </DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'grid-paper flex flex-col items-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors',
            dragging && 'border-primary bg-accent',
          )}
        >
          <FileJson className="h-7 w-7 text-primary" aria-hidden />
          <p className="mt-3 text-sm font-medium">Drop a .json file here</p>
          <p className="mt-1 text-xs text-muted-foreground">Up to 1 MB · 50 documents · 200 topics per document</p>
          <input ref={inputRef} type="file" accept=".json,application/json" className="sr-only" onChange={onChange} data-testid="input-import-file" aria-label="Choose import file" />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} data-testid="button-choose-file">
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Choose file
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={downloadExample} data-testid="button-download-example">
              <Download className="mr-1.5 h-3.5 w-3.5" /> Example file
            </Button>
          </div>
        </div>

        <div aria-live="polite">
          {parsed.state === 'invalid' && (
            <div role="alert" className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm" data-testid="text-import-errors">
              <p className="flex items-center gap-2 font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" /> {parsed.fileName} cannot be imported
              </p>
              <ul className="mt-2 space-y-1 font-mono text-[11.5px] text-foreground/80">
                {parsed.issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          )}
          {parsed.state === 'valid' && (
            <div className="rounded-md border bg-card p-3 text-sm" data-testid="text-import-preview">
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {parsed.data.project.name}
                {parsed.data.project.key && <span className="font-mono text-xs text-muted-foreground">{parsed.data.project.key}</span>}
              </p>
              <p className="mt-1 text-muted-foreground">
                {docs.length} documents · {topicCount} topics · from {parsed.fileName}
              </p>
            </div>
          )}
          {serverIssues.length > 0 && (
            <div role="alert" className="mt-3 rounded-md border border-destructive/25 bg-destructive/5 p-3 font-mono text-[11.5px]">
              {serverIssues.map((i) => (
                <p key={i}>{i}</p>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <ScopeMarker kind="demo">Imported into this browser</ScopeMarker>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => close(false)} data-testid="button-cancel-import">
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={parsed.state !== 'valid' || importer.isPending} data-testid="button-submit-import">
              {importer.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Import project
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
