import type { ReviewPackage } from '@/domain/review-package';
import type { TopicContent } from '@/domain/topic-content';
import { reusableRow, reusableDraftRow } from './reusable-fixtures';
import { reviewAt } from './review-fixtures';

export const variableNode = (id = 'variable-a') => ({ type: 'variableReference', attrs: { referenceVersion: 1, variableId: id, id: `node-${id}` } });
export const reusableNode = (id = 'reuse-a') => ({ type: 'reusableReference', attrs: { referenceVersion: 1, reusableId: id, id: `node-${id}` } });
export const semanticBody = (): TopicContent => ({ type: 'doc', version: 1, metadata: { preserved: true }, content: [
  { type: 'paragraph', attrs: { id: 'stable-p', conditions: { version: 1, values: [{ categoryId: 'category-a', valueId: 'value-a' }] } }, content: [variableNode()] }, reusableNode(),
] });
export const packageFixture = (): ReviewPackage => ({
  schemaVersion: 1, resolverVersion: 1, canonicalization: 'spextar-json-v1',
  projectId: 'project-a', workspaceId: 'ws-a', organizationId: 'org-a',
  outputContext: { variableValues: 'default', conditions: 'neutral', outputId: null },
  variables: [{ id: 'variable-a', project_id: 'project-a', name: 'Product', key: 'product', value_type: 'text', value: 'Frozen product value', description: null, required: true, output_values: { 'web-help': 'Frozen web value' }, created_at: reviewAt, updated_at: reviewAt }],
  categories: [{ id: 'category-a', project_id: 'project-a', name: 'Audience', key: 'audience', description: null, settings: {}, unassigned_behavior: 'include', value_match_mode: 'any', created_at: reviewAt, updated_at: reviewAt }],
  values: [{ id: 'value-a', category_id: 'category-a', name: 'Technician', key: 'technician', sort_order: 0, created_at: reviewAt, updated_at: reviewAt }],
  reusable: [{ item: reusableRow(), draft: reusableDraftRow({ content: { type: 'doc', version: 1, content: [{ type: 'paragraph', attrs: { id: 'nested-p' }, content: [variableNode()] }] } }) }],
});
