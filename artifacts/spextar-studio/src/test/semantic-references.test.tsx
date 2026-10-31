import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Editor } from '@tiptap/core';
import { ServicesProvider } from '@/providers/services-provider';
import { StructuredEditor } from '@/features/editor/structured-editor';
import { ReferenceProvider, VariableValue } from '@/features/editor/semantic-reference-preview';
import { ReferenceUsage } from '@/features/content/reference-usage';
import { collectSemanticReferences } from '@/domain/semantic-references';
import { editorDocument, mergeEditorDocument, structuredContentIssue } from '@/domain/structured-content';
import { contentKey, type TopicContent } from '@/domain/topic-content';
import { whereUsed } from '@/services/semantic-references';
import { reusableDouble, reusableAt, reusableContext } from './reusable-fixtures';

const scope = { workspaceId: 'ws-a', projectId: 'project-a' };
const body: TopicContent = {
  type: 'doc',
  version: 1,
  metadata: { preserve: true },
  content: [
    {
      type: 'paragraph',
      attrs: { id: 'p', conditions: { version: 1, values: [{ categoryId: 'cat-a', valueId: 'val-a' }] } },
      content: [
        { type: 'text', text: 'Product: ' },
        { type: 'variableReference', attrs: { id: 'v-node', referenceVersion: 1, variableId: 'var-a' } },
      ],
    },
    { type: 'reusableReference', attrs: { id: 'r-node', referenceVersion: 1, reusableId: 'reuse-a' } },
  ],
};
function seeded(role = 'author') {
  const f = reusableDouble(role);
  f.db.project_variables.push({
    id: 'var-a',
    project_id: 'project-a',
    name: 'Product name',
    key: 'product_name',
    value_type: 'text',
    value: 'Resolved product',
    required: true,
    description: null,
    output_values: { 'pdf-manual': 'PDF product' },
    created_at: reusableAt,
    updated_at: reusableAt,
  });
  f.db.condition_categories.push({
    id: 'cat-a',
    project_id: 'project-a',
    name: 'Audience',
    key: 'audience',
    description: null,
    settings: {},
    unassigned_behavior: 'include',
    value_match_mode: 'any',
    created_at: reusableAt,
    updated_at: reusableAt,
  });
  f.db.condition_values.push({
    id: 'val-a',
    category_id: 'cat-a',
    name: 'Developer',
    key: 'developer',
    sort_order: 0,
    created_at: reusableAt,
    updated_at: reusableAt,
  });
  f.db.documents.push({
    id: 'doc-a',
    project_id: 'project-a',
    title: 'Saved document',
    slug: 'saved-document',
    description: null,
    status: 'draft',
    settings: {},
    created_by: 'user-a',
    created_at: reusableAt,
    updated_at: reusableAt,
  });
  f.db.topics.push({
    id: 'topic-a',
    document_id: 'doc-a',
    parent_topic_id: null,
    title: 'Saved topic',
    slug: 'saved-topic',
    status: 'draft',
    sort_order: 0,
    settings: {},
    created_by: 'user-a',
    created_at: reusableAt,
    updated_at: reusableAt,
  });
  f.db.topic_drafts.push({
    topic_id: 'topic-a',
    content: structuredClone(body),
    revision: 1,
    updated_at: reusableAt,
    updated_by: 'user-a',
  });
  return f;
}
function mount(initial = body, editable = true, f = seeded()) {
  const change = vi.fn();
  function Surface() {
    const [content, setContent] = useState(initial);
    return (
      <StructuredEditor
        referenceContext={scope}
        content={content}
        editable={editable}
        onChange={(c) => {
          setContent(c);
          change(c);
        }}
      />
    );
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrap = (child: React.ReactNode) => (
    <QueryClientProvider client={queryClient}>
      <ServicesProvider services={f.services}>{child}</ServicesProvider>
    </QueryClientProvider>
  );
  return { f, change, user: userEvent.setup(), wrap, ...render(wrap(<Surface />)) };
}
describe('versioned semantic references', () => {
  it('round-trips every reference and stable node identity while retaining root metadata', () => {
    expect(structuredContentIssue(body)).toBeNull();
    const back = mergeEditorDocument(body, editorDocument(body));
    expect(back).toEqual(body);
    expect(collectSemanticReferences(back)).toEqual([
      { kind: 'condition', definitionId: 'val-a', categoryId: 'cat-a', nodeId: 'p' },
      { kind: 'variable', definitionId: 'var-a', nodeId: 'v-node' },
      { kind: 'reusable', definitionId: 'reuse-a', nodeId: 'r-node' },
    ]);
    expect(
      structuredContentIssue({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Legacy' }] }],
      }),
    ).toBeNull();
  });
  it.each([
    { type: 'variableReference', attrs: { referenceVersion: 2, variableId: 'var-a' } },
    { type: 'variableReference', attrs: { referenceVersion: 1 } },
    { type: 'reusableReference', attrs: { referenceVersion: 1, reusableId: '../bad' } },
    { type: 'paragraph', attrs: { conditions: { version: 2, values: [] } } },
    {
      type: 'paragraph',
      attrs: {
        conditions: {
          version: 1,
          values: [
            { categoryId: 'c', valueId: 'v' },
            { categoryId: 'c', valueId: 'v' },
          ],
        },
      },
    },
  ])('rejects unsupported or malformed reference data losslessly: %j', (node) => {
    const document = {
      type: 'doc',
      version: 1,
      content: node.type === 'variableReference' ? [{ type: 'paragraph', content: [node] }] : [node],
    } as unknown as TopicContent;
    const before = contentKey(document);
    expect(structuredContentIssue(document)).not.toBeNull();
    expect(contentKey(document)).toBe(before);
  });
  it('resolves default values, condition labels and current reusable content in read-only mode without writes', async () => {
    const { f, change } = mount(body, false);
    const area = await screen.findByRole('textbox', { name: 'Topic body' });
    await waitFor(() => expect(area).toHaveTextContent('Resolved product'));
    await waitFor(() => expect(area).toHaveTextContent('Original body'));
    expect(area).toHaveTextContent('Linked reusable content');
    expect(screen.getByRole('group', { name: 'Applied conditional tags' })).toHaveTextContent('Audience: Developer');
    expect(screen.getByRole('button', { name: 'Insert variable' })).toBeDisabled();
    expect(area).toHaveAttribute('contenteditable', 'false');
    expect(change).not.toHaveBeenCalled();
    expect(f.calls.filter((c) => c.patch || c.insert || c.deleted)).toEqual([]);
  });
  it.each(['bulletList', 'orderedList'] as const)(
    'keeps tagged %s containers semantically valid in linked read-only previews',
    async (type) => {
      const f = seeded();
      const draft: TopicContent = {
        type: 'doc',
        version: 1,
        content: [
          {
            type,
            attrs: {
              id: 'tagged-list',
              ...(type === 'orderedList' ? { start: 4, type: 'I' } : {}),
              conditions: { version: 1, values: [{ categoryId: 'cat-a', valueId: 'val-a' }] },
            },
            content: ['First tagged item', 'Second tagged item'].map((text, i) => ({
              type: 'listItem',
              attrs: { id: `item-${i}` },
              content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
            })),
          },
        ],
      };
      f.db.reusable_content_drafts[0].content = draft;
      const before = structuredClone(draft);
      const { change } = mount(body, false, f);
      const area = await screen.findByRole('textbox', { name: 'Topic body' });
      await waitFor(() => expect(area).toHaveTextContent('First tagged item'));
      const preview = area.querySelector('.se-linked-body')!;
      await waitFor(() => expect(preview).toHaveTextContent('Audience: Developer'));
      const list = within(preview as HTMLElement).getByRole('list');
      expect(Array.from(list.children).map((n) => n.tagName)).toEqual(['LI', 'LI']);
      expect(within(list).getAllByRole('listitem')).toHaveLength(2);
      expect(list).not.toHaveTextContent('Audience: Developer');
      expect(list.previousElementSibling).toHaveTextContent('Audience: Developer');
      if (type === 'orderedList') {
        expect(list).toHaveAttribute('start', '4');
        expect(list).toHaveAttribute('type', 'I');
      }
      expect(preview.textContent).not.toMatch(/cat-a|val-a|tagged-list|item-0|reuse-a/);
      expect(f.db.reusable_content_drafts[0].content).toEqual(before);
      expect(collectSemanticReferences(draft)).toEqual([
        { kind: 'condition', definitionId: 'val-a', categoryId: 'cat-a', nodeId: 'tagged-list' },
      ]);
      expect(area).toHaveAttribute('contenteditable', 'false');
      expect(change).not.toHaveBeenCalled();
      expect(f.calls.filter((c) => c.patch || c.insert || c.deleted)).toEqual([]);
    },
  );
  it('uses the selected output override when an output context is explicit', async () => {
    const f = seeded();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ServicesProvider services={f.services}>
          <ReferenceProvider scope={scope}>
            <VariableValue id="var-a" output="pdf-manual" />
          </ReferenceProvider>
        </ServicesProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('PDF product')).toBeVisible();
  });
  it('shows missing references visibly without leaking their identifiers or substituting unrelated definitions', async () => {
    const f = seeded();
    f.db.project_variables = [];
    f.db.reusable_contents = [];
    f.db.condition_values = [];
    mount(body, false, f);
    expect(await screen.findByText('Missing variable')).toBeVisible();
    expect(await screen.findByText('Missing reusable content')).toBeVisible();
    expect(await screen.findByText('Missing conditional tag')).toBeVisible();
    expect(document.body.textContent).not.toMatch(/var-a|reuse-a|val-a/);
  });
  it('bounds reusable cycles instead of recursively expanding forever', async () => {
    const f = seeded();
    f.db.reusable_content_drafts[0].content = {
      type: 'doc',
      version: 1,
      content: [{ type: 'reusableReference', attrs: { referenceVersion: 1, reusableId: 'reuse-a' } }],
    };
    mount(body, false, f);
    expect(await screen.findByText('Linked content cycle or nesting limit reached')).toBeVisible();
  });
  it('inserts at the frozen caret and applies/removes block tags with focus returned to the editor', async () => {
    const { user, change } = mount({
      type: 'doc',
      version: 1,
      content: [{ type: 'paragraph', attrs: { id: 'original-p' }, content: [{ type: 'text', text: 'AB' }] }],
    });
    const area = await screen.findByRole('textbox', { name: 'Topic body' });
    const engine = (area as HTMLElement & { editor: Editor }).editor;
    await waitFor(() => expect(area).toHaveAttribute('contenteditable', 'true'));
    act(() => {
      engine.commands.setTextSelection(2);
    });
    await user.click(screen.getByRole('button', { name: 'Insert variable' }));
    await user.selectOptions(await screen.findByLabelText('Variable', { exact: true }), 'var-a');
    await user.click(screen.getByRole('button', { name: 'Insert reference' }));
    await waitFor(() => expect(area).toHaveTextContent('AResolved productB'));
    await waitFor(() => expect(document.activeElement).toBe(area));
    const saved = change.mock.lastCall![0] as TopicContent;
    expect(collectSemanticReferences(saved)).toMatchObject([{ kind: 'variable', definitionId: 'var-a' }]);
    await user.click(screen.getByRole('button', { name: 'Conditional tags' }));
    await user.selectOptions(screen.getByLabelText('Conditional value'), 'val-a');
    await user.click(screen.getByRole('button', { name: 'Apply tag' }));
    expect(collectSemanticReferences(change.mock.lastCall![0]).some((r) => r.kind === 'condition')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Conditional tags' }));
    await user.click(screen.getByRole('button', { name: 'Remove tag' }));
    expect(collectSemanticReferences(change.mock.lastCall![0]).some((r) => r.kind === 'condition')).toBe(false);
    expect(engine.state.doc.firstChild?.attrs.id).toBe('original-p');
  });
  it('retains reference JSON through revision saves and rename, with accurate persisted where-used locations', async () => {
    const f = seeded();
    await f.services.topicDrafts.save({ ...reusableContext, documentId: 'doc-a', topicId: 'topic-a' }, body, 1);
    await f.services.variables.rename('project-a', 'var-a', { name: 'Renamed product', key: 'renamed_product' });
    expect(
      (await f.services.topicDrafts.get({ ...reusableContext, documentId: 'doc-a', topicId: 'topic-a' }))?.content,
    ).toEqual(body);
    const usages = await whereUsed(f.services, scope, { kind: 'variable', definitionId: 'var-a' });
    expect(usages).toEqual([
      {
        projectId: 'project-a',
        projectName: 'Project A',
        documentId: 'doc-a',
        documentTitle: 'Saved document',
        topicId: 'topic-a',
        topicTitle: 'Saved topic',
        nodeId: 'v-node',
      },
    ]);
    expect(await whereUsed(f.services, scope, { kind: 'category', definitionId: 'cat-a' })).toHaveLength(1);
    expect(await whereUsed(f.services, scope, { kind: 'reusable', definitionId: 'reuse-a' })).toHaveLength(1);
  });
  it('finds workspace-shared uses in another readable project without double-counting library drafts', async () => {
    const f = seeded();
    f.db.projects.push({ ...f.db.projects[0], id: 'project-c', name: 'Other readable project', slug: 'pc' });
    f.db.project_members.push({ project_id: 'project-c', user_id: 'user-a', role: 'viewer' });
    f.db.documents.push({ ...f.db.documents[0], id: 'doc-c', project_id: 'project-c' });
    f.db.topics.push({ ...f.db.topics[0], id: 'topic-c', document_id: 'doc-c' });
    const sharedBody = {
      type: 'doc',
      version: 1,
      content: [
        { type: 'reusableReference', attrs: { id: 'shared-use', referenceVersion: 1, reusableId: 'reuse-shared' } },
      ],
    };
    f.db.topic_drafts[0].content = sharedBody;
    f.db.topic_drafts.push({ ...f.db.topic_drafts[0], topic_id: 'topic-c' });
    f.db.reusable_content_drafts.push({
      reusable_content_id: 'reuse-shared',
      content: sharedBody,
      revision: 1,
      updated_at: reusableAt,
      updated_by: 'user-a',
    });
    const usages = await whereUsed(f.services, scope, { kind: 'reusable', definitionId: 'reuse-shared' });
    expect(usages).toHaveLength(3);
    expect(usages.filter((u) => u.topicId).map((u) => u.projectId)).toEqual(['project-a', 'project-c']);
    expect(usages.filter((u) => u.reusableId)).toHaveLength(1);
    expect(f.calls.some((c) => c.patch || c.insert || c.deleted)).toBe(false);
  });
  it('enumerates projects beyond the API page size for shared-reference scans', async () => {
    const f = seeded();
    f.db.projects = Array.from({ length: 1001 }, (_, i) => ({
      ...f.db.projects[0],
      id: `project-${i}`,
      name: `Project ${i}`,
      slug: `p${i}`,
    }));
    const projects = await f.services.projects.listProjects('ws-a');
    expect(projects).toHaveLength(1001);
    expect(f.calls.filter((c) => c.table === 'projects' && c.columns.includes('created_by')).length).toBeGreaterThan(1);
  });
  it('refuses a usage count when a saved body has unknown reference semantics', async () => {
    const f = seeded();
    f.db.topic_drafts[0].content = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'variableReference', attrs: { referenceVersion: 2, variableId: 'var-a' } }],
        },
      ],
    };
    await expect(whereUsed(f.services, scope, { kind: 'variable', definitionId: 'var-a' })).rejects.toMatchObject({
      code: 'unavailable',
    });
  });
  it('reports no count on a failed scan instead of reporting a partial result', async () => {
    const f = seeded();
    vi.spyOn(f.services.reusable, 'getDraft').mockRejectedValue(new Error('unavailable'));
    await expect(whereUsed(f.services, scope, { kind: 'variable', definitionId: 'var-a' })).rejects.toThrow(
      'unavailable',
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ServicesProvider services={f.services}>
          <ReferenceUsage scope={scope} target={{ kind: 'variable', definitionId: 'var-a' }} />
        </ServicesProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('No count is available');
    expect(screen.queryByText(/1 saved reference/)).not.toBeInTheDocument();
  });
  it.each(['reviewer', 'viewer'])('%s cannot save semantic references through the service', async (role) => {
    const f = seeded(role);
    await expect(
      f.services.topicDrafts.save({ ...reusableContext, documentId: 'doc-a', topicId: 'topic-a' }, body, 1),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(f.calls.some((c) => c.patch || c.insert || c.deleted)).toBe(false);
  });
});
