import { Node, mergeAttributes } from '@tiptap/core';
import { calloutKinds, calloutLabels, type CalloutKind } from '@/domain/structured-content';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    spextarCallout: {
      setCallout: (kind: CalloutKind) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

/** SPEXTAR JSON is authoritative; HTML is only an accessible editing/clipboard view. */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return { kind: {
      default: 'note',
      parseHTML: (element) => element.getAttribute('data-callout-kind'),
      renderHTML: (attrs) => ({ 'data-callout-kind': attrs.kind }),
    } };
  },
  parseHTML() {
    return [{ tag: 'aside[data-callout-kind]', contentElement: '.se-callout-content',
      getAttrs: (element) => (calloutKinds as readonly string[]).includes(element.getAttribute('data-callout-kind') ?? '') ? {} : false }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const label = calloutLabels[node.attrs.kind as CalloutKind];
    return ['aside', mergeAttributes(HTMLAttributes, { class: 'se-callout', role: 'note', 'aria-label': label }),
      ['div', { class: 'se-callout-label', contenteditable: 'false', 'aria-hidden': 'true' }, label],
      ['div', { class: 'se-callout-content' }, 0]];
  },
  addCommands() {
    return {
      setCallout: (kind) => ({ editor, commands }) => {
        if (!(calloutKinds as readonly string[]).includes(kind)) return false;
        return editor.isActive(this.name) ? commands.updateAttributes(this.name, { kind }) : commands.wrapIn(this.name, { kind });
      },
      unsetCallout: () => ({ commands }) => commands.lift(this.name),
    };
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { selection } = this.editor.state;
        const { $from } = selection;
        // A blank final paragraph exits the block without inserting placeholder text.
        if (!selection.empty || $from.parent.type.name !== 'paragraph' || $from.parent.content.size
          || $from.depth < 2 || $from.node(-1).type.name !== this.name
          || $from.index(-1) !== $from.node(-1).childCount - 1) return false;
        return this.editor.commands.lift(this.name);
      },
    };
  },
});
