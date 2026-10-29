import { ReactNodeViewRenderer } from '@tiptap/react';
import { VariableNode, ReusableNode } from './semantic-reference-preview';
import { Extension, Node as EditorNode } from '@tiptap/core';
import { conditionAssignableNodes } from '@/domain/semantic-references';

/** HTML never serves as an import path for semantic identities. Use the scoped picker. */
export const VariableReference = EditorNode.create({
  addNodeView: () => ReactNodeViewRenderer(VariableNode),
  name: 'variableReference',
  group: 'inline',
  inline: true,
  atom: true,
  marks: '',
  addAttributes: () => ({ referenceVersion: { default: 1 }, variableId: { default: null } }),
  parseHTML: () => [],
  renderHTML: ({ HTMLAttributes }) => [
    'span',
    {
      'data-semantic-reference': 'variable',
      'data-reference-node': HTMLAttributes.id,
      class: 'se-variable-reference',
      contenteditable: 'false',
    },
    'Variable reference',
  ],
});
export const ReusableReference = EditorNode.create({
  addNodeView: () => ReactNodeViewRenderer(ReusableNode),
  name: 'reusableReference',
  group: 'block',
  atom: true,
  addAttributes: () => ({ referenceVersion: { default: 1 }, reusableId: { default: null } }),
  parseHTML: () => [],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    {
      'data-semantic-reference': 'reusable',
      'data-reference-node': HTMLAttributes.id,
      class: 'se-reusable-reference',
      contenteditable: 'false',
    },
    'Linked reusable content',
  ],
});
export const ConditionalAssignments = Extension.create({
  name: 'conditionalAssignments',
  addGlobalAttributes: () => [
    {
      types: conditionAssignableNodes,
      attributes: {
        conditions: {
          default: null,
          parseHTML: () => null,
          renderHTML: (a) => (a.conditions ? { 'data-conditions': 'assigned' } : {}),
        },
      },
    },
  ],
});
