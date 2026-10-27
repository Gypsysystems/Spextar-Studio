import { useEditorState, type Editor } from '@tiptap/react';
import { navigateHeading } from './paste-safety';

/** Positions follow transactions rather than cached DOM offsets or persisted data. */
export function DocumentNavigation({ editor }: { editor: Editor }) {
  const headings = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const items: { position: number; label: string; level: number }[] = [];
      e.state.doc.descendants((node, position) => {
        if (node.type.name === 'heading') items.push({ position, label: node.textContent || 'Untitled heading', level: node.attrs.level });
      });
      return items;
    },
  });
  if (!headings.length) return null;
  return (
    <nav className="se-document-nav" aria-label="Topic heading navigation">
      <label htmlFor={`${editor.instanceId}-headings`} title="Previous/next heading: Ctrl/Cmd+Alt+Up/Down">Jump to heading</label>
      <select id={`${editor.instanceId}-headings`} aria-label="Jump to heading" value=""
        title="Previous/next heading: Ctrl/Cmd+Alt+Up/Down"
        onChange={(event) => { if (event.target.value !== '') navigateHeading(editor.view, Number(event.target.value)); }}>
        <option value="">Select a heading ({headings.length})</option>
        {headings.map((heading) => <option key={heading.position} value={heading.position}>
          {'— '.repeat(heading.level - 1)}{heading.label}
        </option>)}
      </select>
    </nav>
  );
}
