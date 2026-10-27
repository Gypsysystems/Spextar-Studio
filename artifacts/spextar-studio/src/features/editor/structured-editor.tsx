import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import {
  Bold, Code, Heading1, Heading2, Heading3, Italic, Link2, List, ListOrdered, Minus, Pilcrow,
  Quote, Redo2, Search, SquareCode, Strikethrough, Table2, Underline, Undo2,
} from 'lucide-react';
import type { TopicContent } from '@/domain/topic-content';
import { contentKey } from '@/domain/topic-content';
import { calloutKinds, calloutLabels, editorDocument, mergeEditorDocument, structuredContentIssue, validLink } from '@/domain/structured-content';
import { replaceEditorDocument, studioExtensions } from './editor-extensions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import './structured-editor.css';
import { TopicSearchPanel } from './topic-search-panel';
import { TableToolbar } from './table-toolbar';

type Props = { content: TopicContent; editable: boolean; onChange: (content: TopicContent) => void; loading?: boolean };

export function StructuredEditor({ content, editable, onChange, loading = false }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const baseRef = useRef(content);
  const lastKey = useRef(contentKey(content));
  const issue = useMemo(() => structuredContentIssue(content), [content]);
  // Lazily computed once: durable IDs are generated only for the first supported document.
  const [initial] = useState((): { doc: TopicContent | null; error: string | null } => {
    if (issue) return { doc: null, error: null };
    try { return { doc: editorDocument(content), error: null }; }
    catch (error) { return { doc: null, error: error instanceof Error ? error.message : 'The document could not be opened safely.' }; }
  });
  const [engineError, setEngineError] = useState<string | null>(initial.error);
  const blocked = !!issue || !!engineError;
  const canEdit = editable && !loading && !blocked;
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;

  const editor = useEditor({
    extensions: studioExtensions(),
    content: initial.doc,
    editable: false,
    enableContentCheck: true,
    emitContentError: true,
    shouldRerenderOnTransaction: false,
    onContentError: ({ error }) => setEngineError(error.message || 'Unsupported structured content.'),
    onUpdate: ({ editor: e }) => {
      if (!canEditRef.current) return;
      let next: TopicContent;
      try {
        next = mergeEditorDocument(baseRef.current, e.getJSON());
        const nextIssue = structuredContentIssue(next);
        if (nextIssue) throw new Error(nextIssue);
      } catch (err) {
        // Fail closed: stop editing at once and never emit partial content.
        canEditRef.current = false;
        e.setEditable(false, false);
        setEngineError(err instanceof Error ? err.message : 'The edited body could not be converted safely.');
        return;
      }
      lastKey.current = contentKey(next);
      baseRef.current = next;
      onChangeRef.current(next);
    },
    editorProps: {
      attributes: {
        role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Topic body', 'data-testid': 'input-topic-body',
        'data-placeholder': 'Write the topic body.',
      },
    },
  }, []);

  // Genuine external load / reload / restore only; own echoes match lastKey.
  useEffect(() => {
    const key = contentKey(content);
    baseRef.current = content;
    if (!editor || key === lastKey.current) return; // own echo or identical content: keep caret, history, error
    lastKey.current = key;
    if (structuredContentIssue(content)) { editor.setEditable(false, false); return; }
    try {
      replaceEditorDocument(editor, content);
      setEngineError(null);
    } catch (err) {
      editor.setEditable(false, false);
      setEngineError(err instanceof Error ? err.message : 'Unsupported structured content.');
    }
  }, [content, editor]);

  // Synchronous guard so a failed validation never leaves a writable editor for a frame.
  if (editor && !canEdit && editor.isEditable) editor.setEditable(false, false);
  useEffect(() => {
    if (!editor) return;
    if (editor.isEditable !== canEdit) {
      editor.setEditable(canEdit, false);
      // Publish command availability after an editability transition without
      // letting trailing-node normalization turn that UI update into a save.
      editor.view.dispatch(editor.state.tr.setMeta('skipTrailingNode', true));
    }
    const dom = editor.view.dom;
    dom.setAttribute('aria-readonly', String(!canEdit));
    dom.setAttribute('aria-busy', String(loading));
  }, [editor, canEdit, loading]);

  if (blocked) {
    return (
      <div className="se-root">
        <p role="note" className="mt-4 text-xs text-muted-foreground">
          This draft contains content the structured editor cannot represent ({issue ?? engineError}). It is shown read-only and its original JSON is preserved unchanged.
        </p>
        <pre className="se-fallback" role="textbox" aria-label="Topic body" aria-readonly="true" tabIndex={0} data-testid="input-topic-body">
          {JSON.stringify(content, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <div className="se-root mt-4">
      {editor && <Toolbar editor={editor} enabled={canEdit} />}
      {loading && !editor?.getText() ? (
        <div className="se-skeleton" aria-hidden><span style={{ width: '82%' }} /><span style={{ width: '64%' }} /><span style={{ width: '71%' }} /></div>
      ) : null}
      <EditorContent editor={editor} className="se-surface" hidden={loading && !editor?.getText()} />
    </div>
  );
}

function Toolbar({ editor, enabled }: { editor: Editor; enabled: boolean }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const searchButton = useRef<HTMLButtonElement>(null);
  const closeSearch = () => { setSearchOpen(false); editor.commands.setTopicSearch(''); searchButton.current?.focus(); };
  useEffect(() => {
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !['f', 'h'].includes(event.key.toLowerCase())
        || !(event.target instanceof Node) || !editor.view.dom.closest('.se-root')?.contains(event.target)) return;
      event.preventDefault(); setSearchOpen(true);
      requestAnimationFrame(() => editor.view.dom.closest('.se-root')?.querySelector<HTMLInputElement>('[data-topic-find]')?.focus());
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, [editor]);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const can = e.can();
      return {
        p: e.isActive('paragraph'), h1: e.isActive('heading', { level: 1 }), h2: e.isActive('heading', { level: 2 }), h3: e.isActive('heading', { level: 3 }),
        bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'), code: e.isActive('code'),
        codeBlock: e.isActive('codeBlock'), quote: e.isActive('blockquote'), bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'),
        link: e.isActive('link'), table: e.isActive('table'),
        calloutKind: calloutKinds.find((kind) => e.isActive('callout', { kind })),
        canCallout: can.setCallout('note'), canUnsetCallout: can.unsetCallout(),
        canBold: can.toggleBold(), canItalic: can.toggleItalic(), canUnderline: can.toggleUnderline?.() ?? false,
        canStrike: can.toggleStrike(), canCode: can.toggleCode(), canCodeBlock: can.toggleCodeBlock(),
        canQuote: can.toggleBlockquote(), canBullet: can.toggleBulletList(), canOrdered: can.toggleOrderedList(),
        canP: can.setParagraph(), canH: can.toggleHeading({ level: 1 }), canUndo: can.undo(), canRedo: can.redo(),
        canHr: can.setHorizontalRule(), canLink: can.setLink({ href: 'https://example.com' }),
        canTable: can.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
      };
    },
  });
  const [linkRange, setLinkRange] = useState<{ from: number; to: number } | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const run = (fn: (c: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => fn(editor.chain().focus()).run();

  const btn = (label: string, icon: ReactNode, onClick: () => void, can: boolean, pressed?: boolean, extra?: string) => (
    <button type="button" className="se-btn" aria-label={label} title={label} aria-pressed={pressed}
      disabled={!enabled || !can} onMouseDown={(e) => e.preventDefault()} onClick={onClick} data-testid={`button-editor-${extra ?? label.toLowerCase().replace(/\W+/g, '-')}`}>
      {icon}
    </button>
  );

  const onKey = (e: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const items = Array.from(bar.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (!items.length) return;
    e.preventDefault();
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
      : (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    items[n].focus();
  };

  return (
    <>
      <div ref={bar} role="toolbar" aria-label="Topic body formatting" className="se-toolbar" onKeyDown={onKey}>
        <div className="se-group" role="group" aria-label="Topic search">
          <button ref={searchButton} type="button" className="se-btn" aria-label="Find and replace" title="Find and replace (Ctrl/Cmd+F)"
            aria-expanded={searchOpen} onMouseDown={(e) => e.preventDefault()}
            onClick={() => searchOpen ? closeSearch() : setSearchOpen(true)}><Search /></button>
        </div>
        <div className="se-group" role="group" aria-label="History">
          {btn('Undo', <Undo2 />, () => run((c) => c.undo()), s.canUndo)}
          {btn('Redo', <Redo2 />, () => run((c) => c.redo()), s.canRedo)}
        </div>
        <div className="se-group" role="group" aria-label="Block type">
          {btn('Paragraph', <Pilcrow />, () => run((c) => c.setParagraph()), s.canP, s.p)}
          {btn('Heading 1', <Heading1 />, () => run((c) => c.toggleHeading({ level: 1 })), s.canH, s.h1)}
          {btn('Heading 2', <Heading2 />, () => run((c) => c.toggleHeading({ level: 2 })), s.canH, s.h2)}
          {btn('Heading 3', <Heading3 />, () => run((c) => c.toggleHeading({ level: 3 })), s.canH, s.h3)}
        </div>
        <div className="se-group" role="group" aria-label="Text formatting">
          {btn('Bold', <Bold />, () => run((c) => c.toggleBold()), s.canBold, s.bold)}
          {btn('Italic', <Italic />, () => run((c) => c.toggleItalic()), s.canItalic, s.italic)}
          {btn('Underline', <Underline />, () => run((c) => c.toggleUnderline()), s.canUnderline, s.underline)}
          {btn('Strikethrough', <Strikethrough />, () => run((c) => c.toggleStrike()), s.canStrike, s.strike)}
          {btn('Inline code', <Code />, () => run((c) => c.toggleCode()), s.canCode, s.code)}
          {btn(s.link ? 'Edit link' : 'Add link', <Link2 />, () => { const { from, to } = editor.state.selection; setLinkRange({ from, to }); }, s.canLink || s.link, s.link, 'link')}
        </div>
        <div className="se-group" role="group" aria-label="Blocks">
          {btn('Code block', <SquareCode />, () => run((c) => c.toggleCodeBlock()), s.canCodeBlock, s.codeBlock)}
          {btn('Blockquote', <Quote />, () => run((c) => c.toggleBlockquote()), s.canQuote, s.quote)}
          {btn('Bullet list', <List />, () => run((c) => c.toggleBulletList()), s.canBullet, s.bullet)}
          {btn('Ordered list', <ListOrdered />, () => run((c) => c.toggleOrderedList()), s.canOrdered, s.ordered)}
          {btn('Horizontal rule', <Minus />, () => run((c) => c.setHorizontalRule()), s.canHr)}
        </div>
        <div className="se-group" role="group" aria-label="Technical callouts">
          {calloutKinds.map((kind) => <span key={kind}>
            {btn(`${calloutLabels[kind]} callout`, <span>{calloutLabels[kind]}</span>,
              () => run((c) => c.setCallout(kind)), s.canCallout, s.calloutKind === kind)}
          </span>)}
          {s.calloutKind && btn('Remove callout', <span>Unwrap</span>,
            () => run((c) => c.unsetCallout()), s.canUnsetCallout)}
        </div>
        <div className="se-group se-table-tools" role="group" aria-label="Table">
          {btn('Insert table', <Table2 />, () => run((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true })), s.canTable && !s.table)}
          {s.table && <TableToolbar editor={editor} enabled={enabled} />}
        </div>
      </div>
      {searchOpen && <TopicSearchPanel editor={editor} editable={enabled} onClose={closeSearch} />}
      {linkRange && <LinkDialog editor={editor} range={linkRange} onClose={() => setLinkRange(null)} />}
    </>
  );
}

function clampRange(editor: Editor, r: { from: number; to: number }) {
  const max = editor.state.doc.content.size;
  const from = Math.max(0, Math.min(r.from, max));
  return { from, to: Math.max(from, Math.min(r.to, max)) };
}

function LinkDialog({ editor, range, onClose }: { editor: Editor; range: { from: number; to: number }; onClose: () => void }) {
  // Frozen at open time; the editor selection may move while the dialog has focus.
  const [frozen] = useState(() => {
    const r = clampRange(editor, range);
    const linkType = editor.schema.marks.link;
    const $from = editor.state.doc.resolve(r.from);
    const mark = linkType
      ? editor.state.doc.nodeAt(r.from)?.marks.find((m) => m.type === linkType) ?? $from.marks().find((m) => m.type === linkType)
      : undefined;
    const href = typeof mark?.attrs.href === 'string' ? mark.attrs.href : '';
    const selected = r.from === r.to ? '' : editor.state.doc.textBetween(r.from, r.to, ' ');
    return { ...r, href, selected };
  });
  const existing = frozen.href;
  const needsText = !existing && frozen.from === frozen.to;
  const [href, setHref] = useState(existing);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  const finish = (apply?: () => boolean) => {
    if (done.current) return;
    done.current = true;
    let ok = true;
    try { ok = apply ? apply() : true; } catch { ok = false; }
    if (!apply || !ok) {
      const r = clampRange(editor, frozen);
      editor.chain().focus().setTextSelection(r).run();
    }
    onClose();
  };

  const save = () => {
    const url = href.trim();
    if (!url || !validLink(url)) { setError('Enter a valid http, https, mailto, tel or relative URL.'); return; }
    const label = text.trim();
    if (needsText && !label) { setError('Enter the link text.'); return; }
    finish(() => {
      const r = clampRange(editor, frozen);
      const chain = editor.chain().focus().setTextSelection(r);
      if (needsText) {
        return chain.insertContentAt(r.from, { type: 'text', text: label, marks: [{ type: 'link', attrs: { href: url } }] })
          .setTextSelection(r.from + label.length).run();
      }
      return existing && r.from === r.to
        ? chain.extendMarkRange('link').setLink({ href: url }).run()
        : chain.setLink({ href: url }).run();
    });
  };
  const remove = () => finish(() => {
    const r = clampRange(editor, frozen);
    return editor.chain().focus().setTextSelection(r).extendMarkRange('link').unsetLink().run();
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) finish(); }}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit link' : 'Add link'}</DialogTitle>
          <DialogDescription>
            {existing ? 'Change or remove this link.' : frozen.selected ? `Link the selected text "${frozen.selected.slice(0, 60)}".` : 'Insert new linked text at the cursor.'} Use http, https, mailto, tel or a relative URL.
          </DialogDescription>
        </DialogHeader>
        <form noValidate className="space-y-3" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); save(); }}>
          <div className="space-y-1.5">
            <label htmlFor="se-link-url" className="text-[13px] text-muted-foreground">URL</label>
            <Input id="se-link-url" type="url" inputMode="url" autoComplete="off" spellCheck={false} autoFocus value={href} aria-invalid={!!error} aria-describedby={error ? 'se-link-error' : undefined}
              onChange={(e) => { setHref(e.target.value); setError(null); }} placeholder="https://" data-testid="input-link-url" />
          </div>
          {needsText && <div className="space-y-1.5">
            <label htmlFor="se-link-text" className="text-[13px] text-muted-foreground">Link text</label>
            <Input id="se-link-text" value={text} onChange={(e) => { setText(e.target.value); setError(null); }} data-testid="input-link-text" />
          </div>}
          {error && <p id="se-link-error" role="alert" className="text-xs text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            {existing && <Button type="button" variant="outline" onClick={remove} data-testid="button-link-remove">Remove link</Button>}
            <Button type="button" variant="ghost" onClick={() => finish()}>Cancel</Button>
            <Button type="submit" data-testid="button-link-save">Save link</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
