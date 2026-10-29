import { Extension, Node } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { conditionedNodes, conditionAssignments, type SemanticCatalog } from '@/domain/semantic-references';
import { structuredContentIssue } from '@/domain/structured-content';
import type { JSONValue, TopicContent } from '@/domain/topic-content';
import { resolveVariable } from '@/domain/project-variables';

export function conditionLabel(raw: unknown, catalog?: SemanticCatalog): string {
  const parsed = conditionAssignments.safeParse(raw);
  if (!parsed.success) return 'Conditional assignment unavailable';
  return parsed.data.map(a => {
    const category = catalog?.categories.find(c => c.id === a.categoryId);
    return `${category?.name ?? 'Category unavailable'}: ${a.valueIds.map(id =>
      catalog?.values.find(v => v.id === id && v.categoryId === a.categoryId)?.name ?? 'Value unavailable').join(' OR ')}`;
  }).join(' AND ');
}

/** Safe DOM renderer for linked CURRENT drafts. Never writes resolved content into topic JSON. */
function renderBody(content: TopicContent, catalog: SemanticCatalog | undefined, visited: Set<string>, depth: number): HTMLElement {
  const root = document.createElement('div');
  root.className = 'se-linked-body';
  if (depth > 8 || structuredContentIssue(content)) {
    root.textContent = 'Linked content cannot be displayed safely. Its saved content is unchanged.';
    root.setAttribute('role', 'alert'); return root;
  }
  let count = 0;
  const render = (value: JSONValue): globalThis.Node => {
    if (++count > 10000) return document.createTextNode('Content preview limit reached.');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return document.createTextNode('');
    const attrs = value.attrs && typeof value.attrs === 'object' && !Array.isArray(value.attrs) ? value.attrs : {};
    if (value.type === 'variableReference' || value.type === 'reusableReference') {
      return referenceDOM(String(value.type), String(attrs.targetId), catalog, visited, depth + 1);
    }
    if (value.type === 'text') {
      let result: globalThis.Node = document.createTextNode(String(value.text));
      if (Array.isArray(value.marks)) for (const mark of value.marks) {
        if (!mark || typeof mark !== 'object' || Array.isArray(mark)) continue;
        const tag = ({ bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code', link: 'span' } as Record<string, string>)[String(mark.type)];
        if (tag) { const element = document.createElement(tag); element.append(result); result = element; }
      }
      return result;
    }
    const tags: Record<string, string> = { paragraph: 'p', heading: `h${attrs.level ?? 2}`, blockquote: 'blockquote',
      bulletList: 'ul', orderedList: 'ol', listItem: 'li', codeBlock: 'pre', hardBreak: 'br',
      horizontalRule: 'hr', table: 'table', tableRow: 'tr', tableCell: 'td', tableHeader: 'th', callout: 'aside' };
    const element = document.createElement(tags[String(value.type)] ?? 'div');
    if (attrs.conditions) {
      const label = document.createElement('span'); label.className = 'se-condition-label';
      label.textContent = conditionLabel(attrs.conditions, catalog); element.append(label);
    }
    if (value.type === 'callout') { const label = document.createElement('strong'); label.textContent = `${attrs.kind}: `; element.append(label); }
    if (['tableCell', 'tableHeader'].includes(String(value.type))) {
      for (const key of ['colspan', 'rowspan']) if (typeof attrs[key] === 'number') element.setAttribute(key, String(attrs[key]));
    }
    if (Array.isArray(value.content)) value.content.forEach(child => element.append(render(child)));
    return element;
  };
  if (Array.isArray(content.content)) content.content.forEach(value => root.append(render(value)));
  return root;
}

export function referenceDOM(type: string, targetId: string, catalog?: SemanticCatalog, visited = new Set<string>(), depth = 0): HTMLElement {
  const element = document.createElement(type === 'variableReference' ? 'span' : 'div');
  element.className = 'se-semantic-reference';
  element.contentEditable = 'false';
  if (type === 'variableReference') {
    const variable = catalog?.variables.find(v => v.id === targetId);
    element.textContent = variable ? `${variable.name}: ${resolveVariable(variable, 'web-help')}` : 'Variable unavailable';
    element.setAttribute('aria-label', variable ? `Variable ${variable.name}, ${resolveVariable(variable, 'web-help')}` : 'Missing or inaccessible variable');
    return element;
  }
  const linked = catalog?.reusable.find(r => r.item.id === targetId);
  const heading = document.createElement('strong');
  heading.textContent = linked ? `Linked: ${linked.item.name}` : 'Reusable content unavailable'; element.append(heading);
  if (visited.has(targetId) || depth > 8) {
    element.append(document.createTextNode(' — Circular or excessively deep reference; preview stopped.'));
    element.setAttribute('role', 'alert'); return element;
  }
  if (!linked?.draft) { element.append(document.createTextNode(' — No accessible saved draft.')); return element; }
  const revision = document.createElement('div');
  revision.className = 'text-xs text-muted-foreground'; revision.textContent = `Current draft · revision ${linked.draft.revision}`;
  element.append(revision, renderBody(linked.draft.content, catalog, new Set([...visited, targetId]), depth));
  return element;
}

export function semanticExtensions(catalog: () => SemanticCatalog | undefined) {
  const reference = (name: 'variableReference' | 'reusableReference') => Node.create({
    name, group: name === 'variableReference' ? 'inline' : 'block',
    inline: name === 'variableReference', atom: true, selectable: true,
    addAttributes() {
      return { targetId: { default: null }, refVersion: { default: 1 } };
    },
    // Clipboard HTML cannot carry cross-project references into another topic.
    parseHTML() { return []; },
    renderHTML({ HTMLAttributes }) { return [name === 'variableReference' ? 'span' : 'div',
      { ...HTMLAttributes, 'data-semantic-reference': name }, name === 'variableReference' ? 'Variable reference' : 'Linked reusable content']; },
    addNodeView() {
      return ({ node, editor }) => {
        let current = node;
        const dom = document.createElement(name === 'variableReference' ? 'span' : 'div');
        let previous: SemanticCatalog | undefined;
        let previousTarget: string | undefined;
        const refresh = () => {
          const next = catalog();
          if (dom.childNodes.length && next === previous && current.attrs.targetId === previousTarget) return;
          previous = next; previousTarget = current.attrs.targetId as string;
          dom.replaceChildren(referenceDOM(name, previousTarget, next));
          dom.contentEditable = 'false';
        };
        refresh(); editor.on('transaction', refresh);
        return { dom, update(next) { if (next.type !== current.type) return false; current = next; refresh(); return true; },
          destroy() { editor.off('transaction', refresh); }, ignoreMutation: () => true };
      };
    },
  });
  const conditions = Extension.create({
    name: 'semanticConditions',
    addGlobalAttributes() { return [{ types: [...conditionedNodes], attributes: {
      conditions: { default: null, parseHTML: () => null,
        renderHTML: attrs => attrs.conditions?.length ? { 'data-condition-assignments': 'true' } : {} },
    } }]; },
    addProseMirrorPlugins() {
      return [new Plugin({ props: {
        decorations(state) {
          const decorations: Decoration[] = [];
          state.doc.descendants((node, pos) => {
            if (node.attrs.conditions?.length) {
              const label = conditionLabel(node.attrs.conditions, catalog());
              decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'se-conditioned', 'data-condition-label': label, 'aria-label': label }));
            }
          });
          return DecorationSet.create(state.doc, decorations);
        },
      } })];
    },
  });
  return [reference('variableReference'), reference('reusableReference'), conditions];
}
