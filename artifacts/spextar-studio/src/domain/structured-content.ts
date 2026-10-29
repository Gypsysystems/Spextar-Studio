import { conditionAssignableNodes, referenceId, validConditions } from './semantic-references';
import { checkedContent, type JSONValue, type TopicContent } from './topic-content';
import { ServiceError } from '@/services/contracts';

/** SPEXTAR's version-1 authoring vocabulary. No editor-library types cross this boundary. */
export const identifiedNodes = ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem',
  'codeBlock', 'horizontalRule', 'table', 'tableRow', 'tableCell', 'tableHeader', 'callout', 'variableReference', 'reusableReference'] as const;
export const calloutKinds = ['note', 'tip', 'caution', 'warning'] as const;
export type CalloutKind = typeof calloutKinds[number];
export const calloutLabels: Record<CalloutKind, string> = { note: 'Note', tip: 'Tip', caution: 'Caution', warning: 'Warning' };
type ObjectJSON = { [key: string]: JSONValue };
const object = (value: JSONValue | undefined): value is ObjectJSON => !!value && typeof value === 'object' && !Array.isArray(value);
const inline = new Set(['text', 'hardBreak', 'variableReference']);
const blocks = new Set<string>(identifiedNodes.filter((name) => !['listItem', 'tableRow', 'tableCell', 'tableHeader', 'variableReference'].includes(name)));
const attributes: Record<string, string[]> = {
  variableReference: ['referenceVersion', 'variableId'], reusableReference: ['referenceVersion', 'reusableId'],
  callout: ['kind'],
  heading: ['level'], orderedList: ['start', 'type'], codeBlock: ['language'],
  tableCell: ['colspan', 'rowspan', 'colwidth', 'align'], tableHeader: ['colspan', 'rowspan', 'colwidth', 'align'],
};
export function validLink(href: string): boolean {
  if (!href || /[\u0000-\u0020\u007f]/.test(href)) return false;
  if (!/^(https?:|mailto:|tel:|\/|#|\?|\.\.?\/)/i.test(href)) return false;
  try { return ['https:', 'http:', 'mailto:', 'tel:'].includes(new URL(href, 'https://spextar.invalid').protocol); }
  catch { return false; }
}
const positive = (value: JSONValue | undefined) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** Reject rather than letting an editor schema strip unknown nodes, attributes or marks. */
export function structuredContentIssue(input: TopicContent): string | null {
  try { checkedContent(input); } catch { return 'The saved body is not valid document JSON.'; }
  if (input.type !== 'doc' || (input.version !== undefined && input.version !== 1) || !Array.isArray(input.content))
    return 'This document format/version is not supported by this editor.';
  let count = 0;
  const check = (value: JSONValue, parent: string): string | null => {
    if (++count > 30000 || !object(value) || typeof value.type !== 'string') return 'Invalid or oversized document structure.';
    const type = value.type;
    if (!inline.has(type) && !identifiedNodes.includes(type as typeof identifiedNodes[number])) return `Unsupported node: ${type}.`;
    if (Object.keys(value).some((key) => !['type', ...(type === 'text' ? ['text', 'marks'] :
      type === 'hardBreak' ? ['marks'] : ['attrs', 'content'])].includes(key))) return `Unsupported ${type} properties.`;
    const allowedChild = parent === 'doc' || parent === 'callout' || parent === 'blockquote' || parent === 'listItem' || parent === 'tableCell' || parent === 'tableHeader'
      ? blocks.has(type) : parent === 'paragraph' || parent === 'heading' ? inline.has(type)
        : parent === 'codeBlock' ? type === 'text' : parent === 'bulletList' || parent === 'orderedList' ? type === 'listItem'
          : parent === 'table' ? type === 'tableRow' : parent === 'tableRow' ? ['tableCell', 'tableHeader'].includes(type) : false;
    if (!allowedChild) return `Invalid ${type} placement.`;
    if (type === 'text' && (typeof value.text !== 'string' || !value.text.length)) return 'Invalid text node.';
    if (value.marks !== undefined) {
      if (!Array.isArray(value.marks) || (parent === 'codeBlock' && value.marks.length)) return 'Unsupported marks.';
      const seen = new Set<string>();
      for (const mark of value.marks) {
        if (!object(mark) || typeof mark.type !== 'string' || !['bold', 'italic', 'underline', 'strike', 'code', 'link'].includes(mark.type)
          || seen.has(mark.type) || Object.keys(mark).some((key) => !['type', 'attrs'].includes(key))) return 'Unsupported or duplicate mark.';
        seen.add(mark.type);
        if (mark.type === 'link') {
          if (!object(mark.attrs) || typeof mark.attrs.href !== 'string' || !validLink(mark.attrs.href)
            || Object.keys(mark.attrs).some((key) => !['href', 'target', 'rel', 'class', 'title'].includes(key))
            || Object.values(mark.attrs).some((v) => v !== null && typeof v !== 'string')
            || (mark.attrs.target !== undefined && mark.attrs.target !== null && !['_blank', '_self'].includes(mark.attrs.target as string))
            || (typeof mark.attrs.rel === 'string' && mark.attrs.rel.toLowerCase().split(/\s+/).includes('opener'))) return 'Unsupported or unsafe link.';
        } else if (mark.attrs !== undefined && (!object(mark.attrs) || Object.keys(mark.attrs).length)) return 'Unsupported mark attributes.';
      }
      if (seen.has('code') && seen.size > 1) return 'Inline code cannot contain other marks.';
    }
    const attrs = value.attrs;
    if (attrs !== undefined && (!object(attrs) || Object.keys(attrs).some((key) => !['id', ...(conditionAssignableNodes.includes(type) ? ['conditions'] : []), ...(attributes[type] ?? [])].includes(key))))
      return `Unsupported ${type} attributes.`;
    if (['variableReference', 'reusableReference'].includes(type) && (!object(attrs) || attrs.referenceVersion !== 1 || !referenceId(attrs[type === 'variableReference' ? 'variableId' : 'reusableId']))) return 'Unsupported semantic reference.';
    if (object(attrs)) {
      if (!validConditions(attrs.conditions)) return 'Unsupported conditional assignment.';
      if (attrs.id !== undefined && attrs.id !== null && (typeof attrs.id !== 'string' || !/^[\w.:-]{1,200}$/.test(attrs.id))) return 'Invalid node identity.';
      if (type === 'callout' && !(calloutKinds as readonly unknown[]).includes(attrs.kind)) return 'Unsupported callout kind.';
      if (type === 'heading' && ![1, 2, 3].includes(attrs.level as number)) return 'Only heading levels 1–3 are supported.';
      if (type === 'orderedList' && ((attrs.start !== undefined && !positive(attrs.start))
        || (attrs.type !== undefined && attrs.type !== null && !['1', 'a', 'A', 'i', 'I'].includes(attrs.type as string)))) return 'Unsupported numbered list settings.';
      if (type === 'codeBlock' && attrs.language !== undefined && attrs.language !== null && typeof attrs.language !== 'string') return 'Invalid code language.';
      if (['tableCell', 'tableHeader'].includes(type)) {
        for (const span of ['rowspan', 'colspan']) if (attrs[span] !== undefined && (!positive(attrs[span]) || (attrs[span] as number) > 128)) return 'Invalid table span.';
        if (attrs.align !== undefined && attrs.align !== null && !['left', 'right', 'center', 'justify'].includes(attrs.align as string)) return 'Unsupported cell alignment.';
        if (attrs.colwidth !== undefined && attrs.colwidth !== null && (!Array.isArray(attrs.colwidth)
          || attrs.colwidth.length !== (attrs.colspan ?? 1) || attrs.colwidth.some((width) => !positive(width) || (width as number) > 10000))) return 'Invalid table column widths.';
      }
    } else if (type === 'heading') return 'Missing heading level.';
    if (type === 'callout' && !object(attrs)) return 'Missing callout kind.';
    const children = value.content ?? [];
    if (!Array.isArray(children)) return 'Invalid node children.';
    if (['text', 'hardBreak', 'horizontalRule', 'variableReference', 'reusableReference'].includes(type) && children.length) return 'Unexpected leaf-node children.';
    // A row can contain no own cells when preceding rowspans cover its entire
    // width. The containing table's grid check proves that coverage below.
    if (['callout', 'blockquote', 'bulletList', 'orderedList', 'listItem', 'table', 'tableCell', 'tableHeader'].includes(type) && !children.length) return 'Empty structural container.';
    if (type === 'listItem' && (!object(children[0]) || children[0].type !== 'paragraph')) return 'List items must start with a paragraph.';
    for (const child of children) { const issue = check(child, type); if (issue) return issue; }
    if (type === 'table' && !validTable(children as ObjectJSON[])) return 'The saved table has an inconsistent grid; its JSON has been preserved.';
    return null;
  };
  for (const node of input.content) { const issue = check(node, 'doc'); if (issue) return issue; }
  return null;
}
function validTable(rows: ObjectJSON[]): boolean {
  const grid: boolean[][] = rows.map(() => []);
  for (let r = 0; r < rows.length; r++) {
    let col = 0;
    for (const cell of (rows[r].content ?? []) as ObjectJSON[]) {
      while (grid[r][col]) col++;
      const attrs = cell.attrs as ObjectJSON | undefined;
      const width = (attrs?.colspan ?? 1) as number, height = (attrs?.rowspan ?? 1) as number;
      if (r + height > rows.length || col + width > 128) return false;
      for (let y = r; y < r + height; y++) for (let x = col; x < col + width; x++) {
        if (grid[y][x]) return false;
        grid[y][x] = true;
      }
      col += width;
    }
  }
  const width = grid[0]?.length ?? 0;
  return width > 0 && grid.every((row) => row.length === width && Array.from({ length: width }, (_, i) => row[i]).every(Boolean));
}
export const supportsStructuredEditing = (content: TopicContent) => structuredContentIssue(content) === null;

/** IDs are stable within a Topic; external references use (Topic UUID, node UUID).
 * Opening legacy JSON does not write it. IDs are persisted with the next explicit edit/restore. */
export function ensureNodeIds(content: TopicContent): TopicContent {
  const issue = structuredContentIssue(content);
  if (issue) throw new ServiceError(issue, 'validation');
  const result = structuredClone(content);
  const seen = new Set<string>();
  const walk = (node: ObjectJSON) => {
    if ((identifiedNodes as readonly string[]).includes(node.type as string)) {
      const attrs = object(node.attrs) ? node.attrs : {};
      let id = typeof attrs.id === 'string' ? attrs.id : '';
      if (!id || seen.has(id)) id = crypto.randomUUID();
      seen.add(id); node.attrs = { ...attrs, id };
    }
    if (Array.isArray(node.content)) node.content.forEach((child) => { if (object(child)) walk(child); });
  };
  (result.content as ObjectJSON[]).forEach(walk);
  return result;
}
export function editorDocument(content: TopicContent): TopicContent {
  const normalized = ensureNodeIds(content);
  return { type: 'doc', content: (normalized.content as JSONValue[]).length ? normalized.content : [{ type: 'paragraph', attrs: { id: crypto.randomUUID() } }] };
}
export function mergeEditorDocument(base: TopicContent, json: unknown): TopicContent {
  if (!supportsStructuredEditing(base)) throw new ServiceError('Unsupported saved JSON must not be replaced by the editor.', 'validation');
  const engine = checkedContent(json);
  if (engine.type !== 'doc' || Object.keys(engine).some((key) => !['type', 'content'].includes(key)))
    throw new ServiceError('The editing engine returned an unsupported document envelope.', 'validation');
  // New optional editor attributes must not rewrite ordinary legacy bodies merely
  // because the engine emits its null default on every existing block.
  const body = structuredClone(engine.content);
  const clean = (value: JSONValue) => {
    if (!object(value)) return;
    if (object(value.attrs) && value.attrs.conditions === null) delete value.attrs.conditions;
    if (Array.isArray(value.content)) value.content.forEach(clean);
  };
  if (Array.isArray(body)) body.forEach(clean);
  return ensureNodeIds({ ...base, type: 'doc', content: body });
}
