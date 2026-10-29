import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { changeCondition, referencesIn, type SemanticCatalog } from '@/domain/semantic-references';
import { editorDocument, mergeEditorDocument, structuredContentIssue } from '@/domain/structured-content';
import { checkedContent, type TopicContent } from '@/domain/topic-content';
import { studioExtensions } from '@/features/editor/editor-extensions';
import { referenceDOM, conditionLabel } from '@/features/editor/semantic-extensions';
import { clipboardIssue } from '@/features/editor/paste-safety';
import { findTopicMatches } from '@/features/editor/topic-search';
import { readReferenceUsage, readSemanticCatalog } from '@/services/reference-reads';
import type { Services } from '@/services/contracts';

const variable = { id: 'variable-a', projectId: 'project-a', name: 'ProductName', key: 'product_name',
  valueType: 'text' as const, value: 'Default', description: null, required: false, outputValues: { 'web-help': 'Web value' },
  createdAt: '2026-10-29T00:00:00Z', updatedAt: '2026-10-29T00:00:00Z' };
const catalog: SemanticCatalog = { variables: [variable], categories: [], values: [], reusable: [] };
const text: TopicContent = { type: 'doc', version: 1, metadata: { preserve: true }, content: [
  { type: 'paragraph', attrs: { id: 'p-one' }, content: [{ type: 'text', text: 'Before' },
    { type: 'variableReference', attrs: { id: 'ref-one', refVersion: 1, targetId: 'variable-a' } }, { type: 'text', text: 'After' }] },
  { type: 'reusableReference', attrs: { id: 'ref-two', refVersion: 1, targetId: 'reuse-a' } },
] };
const editors: Editor[] = [];
afterEach(() => { editors.splice(0).forEach(editor => editor.destroy()); });
function engine(content = text, editable = true) {
  const editor = new Editor({ extensions: studioExtensions(), content: editorDocument(content), editable });
  editors.push(editor); return editor;
}
function double(content: TopicContent = text, mode: 'backend' | 'demo' = 'backend') {
  const session = { mode, userId: 'user-a', organizationId: 'org-a' };
  const body = { type: 'doc', version: 1, content: [{ type: 'paragraph', attrs: { id: 'linked-p' }, content: [
    { type: 'variableReference', attrs: { id: 'nested-ref', refVersion: 1, targetId: 'variable-a' } },
  ] }] };
  const services = {
    mode, auth: { getSession: vi.fn().mockResolvedValue(session) },
    projects: { listProjects: vi.fn().mockResolvedValue([{ id: 'project-a', name: 'Project' }]) },
    documents: { listDocuments: vi.fn().mockResolvedValue([{ id: 'doc-a', title: 'Document', topics: [{ id: 'topic-a', title: 'Topic' }] }]) },
    topicDrafts: { get: vi.fn().mockResolvedValue({ content, revision: 4 }), save: vi.fn() },
    variables: { list: vi.fn().mockResolvedValue([variable]) },
    conditions: { listCategories: vi.fn().mockResolvedValue([]), listValues: vi.fn().mockResolvedValue([]) },
    reusable: { list: vi.fn().mockResolvedValue([{ id: 'reuse-a', workspaceId: 'ws-a', projectId: 'project-a', scope: 'project', name: 'Linked' }]),
      getDraft: vi.fn().mockResolvedValue({ content: body, revision: 2, reusableContentId: 'reuse-a' }) },
  };
  return services;
}
describe('SPEXTAR owned versioned semantic JSON', () => {
  it('round-trips stable IDs, root version/metadata, semantic nodes and ordinary marked content', () => {
    const editor = engine();
    const roundtrip = mergeEditorDocument(text, editor.getJSON());
    expect(roundtrip.version).toBe(1); expect(roundtrip.metadata).toEqual({ preserve: true });
    expect(referencesIn(roundtrip)).toEqual(referencesIn(text));
    expect(JSON.stringify(roundtrip)).not.toContain('Web value');
    expect(structuredContentIssue(roundtrip)).toBeNull();
  });
  it('inserts an inline reference in bold text and supports exact undo/redo', () => {
    const editor = engine({ type: 'doc', version: 1, content: [{ type: 'paragraph', attrs: { id: 'p' }, content: [{ type: 'text', text: 'Words' }] }] });
    editor.commands.setTextSelection(3); editor.commands.toggleBold();
    expect(editor.commands.insertContent({ type: 'variableReference', attrs: { refVersion: 1, targetId: 'variable-a' } })).toBe(true);
    const saved = editor.getJSON();
    expect(structuredContentIssue(mergeEditorDocument({ type: 'doc', version: 1, content: [] }, saved))).toBeNull();
    expect(referencesIn(saved as TopicContent)).toHaveLength(1);
    editor.commands.undo(); expect(referencesIn(editor.getJSON() as TopicContent)).toHaveLength(0);
    editor.commands.redo(); expect(editor.getJSON()).toEqual(saved);
  });
  it('keeps search/replacement text ranges on each side of a reference atom', () => {
    const editor = engine();
    expect(findTopicMatches(editor.state.doc, 'BeforeAfter', false).matches).toHaveLength(0);
    expect(findTopicMatches(editor.state.doc, 'Before', false).matches).toHaveLength(1);
  });
  it('does not allow a read-only editor transaction to insert or remove reference content', () => {
    const editor = engine(text, false); const before = editor.getJSON();
    editor.commands.insertContent('Changed'); editor.commands.deleteSelection();
    expect(editor.getJSON()).toEqual(before);
  });
  it('adds/removes values without changing their IDs, with same-category OR and cross-category AND grouping', () => {
    const one = changeCondition(null, 'audience', 'writer');
    const two = changeCondition(one, 'audience', 'admin');
    const three = changeCondition(two, 'platform', 'web');
    expect(one[0].valueIds).toEqual(['writer']);
    expect(three).toHaveLength(2); expect(three.find(r => r.categoryId === 'audience')?.valueIds).toEqual(['writer', 'admin']);
    expect(changeCondition(changeCondition(two, 'audience', 'admin', true), 'audience', 'writer', true)).toEqual([]);
    expect(changeCondition(one, 'audience', 'writer')).toEqual(one);
  });
  it.each([
    { type: 'variableReference', attrs: { targetId: 'a', refVersion: 2 } },
    { type: 'reusableReference', attrs: { targetId: '', refVersion: 1 } },
    { type: 'variableReference', attrs: { targetId: 'a', refVersion: 1, label: 'Unowned label' } },
    { type: 'paragraph', attrs: { conditions: [{ version: 1, categoryId: 'a', valueIds: [] }] } },
    { type: 'paragraph', attrs: { conditions: [{ version: 2, categoryId: 'a', valueIds: ['v'] }] } },
  ])('rejects malformed or unknown reference shapes without mutating input', node => {
    const body = checkedContent({ type: 'doc', version: 1, content: node.type === 'variableReference'
      ? [{ type: 'paragraph', content: [node] }] : [node] });
    const original = JSON.stringify(body);
    expect(structuredContentIssue(body)).not.toBeNull(); expect(JSON.stringify(body)).toBe(original);
  });
  it('never silently pastes or flattens semantic clipboard content', () => {
    expect(clipboardIssue('<p><span data-semantic-reference="variableReference">ProductName</span></p>')).toContain('semantic references');
    expect(clipboardIssue('<p data-condition-assignments="true">Conditional</p>')).toContain('semantic references');
  });
  it('resolves renamed variables safely and never includes IDs or executable HTML in presentation', () => {
    expect(referenceDOM('variableReference', 'variable-a', catalog).textContent).toContain('Web value');
    const renamed = { ...catalog, variables: [{ ...variable, name: 'Renamed', value: '<script>bad()</script>', outputValues: {} }] };
    const dom = referenceDOM('variableReference', 'variable-a', renamed);
    expect(dom.textContent).toContain('Renamed'); expect(dom.querySelector('script')).toBeNull();
    expect(referenceDOM('variableReference', 'missing-private-id', catalog).textContent).toBe('Variable unavailable');
    expect(referenceDOM('reusableReference', 'missing-private-id', catalog).textContent).not.toContain('missing-private-id');
    expect(conditionLabel([{ version: 1, categoryId: 'missing', valueIds: ['missing-value'] }], catalog)).toBe('Category unavailable: Value unavailable');
  });
  it('previews linked structured drafts without flattening and stops cycles', async () => {
    const services = double();
    const loaded = await readSemanticCatalog(services as unknown as Services, { workspaceId: 'ws-a', projectId: 'project-a' });
    expect(referenceDOM('reusableReference', 'reuse-a', loaded).textContent).toContain('Web value');
    const cyclic = { ...loaded, reusable: loaded.reusable.map(r => ({ ...r, draft: { ...r.draft!, content: text } })) };
    expect(referenceDOM('reusableReference', 'reuse-a', cyclic).textContent).toContain('Circular');
  });
});
describe('read-only derived reference usage and service isolation', () => {
  const context = { workspaceId: 'ws-a', projectId: 'project-a' };
  it('counts persisted direct and linked occurrences, including exact topic revisions', async () => {
    const services = double();
    const found = await readReferenceUsage(services as unknown as Services, context, { kind: 'variable', id: 'variable-a' });
    expect(found).toHaveLength(2); expect(found[0]).toMatchObject({ documentTitle: 'Document', topicTitle: 'Topic', revision: 4 });
    expect(found[1].viaLinkedContent).toBe(true);
    expect(services.topicDrafts.get).toHaveBeenCalledWith({ userId: 'user-a', projectId: 'project-a', documentId: 'doc-a', topicId: 'topic-a' });
    expect(services.topicDrafts.save).not.toHaveBeenCalled();
  });
  it('returns honest zero results only after inspecting known saved bodies', async () => {
    const services = double({ type: 'doc', version: 1, content: [] });
    expect(await readReferenceUsage(services as unknown as Services, context, { kind: 'variable', id: 'variable-a' })).toEqual([]);
    expect(services.topicDrafts.get).toHaveBeenCalledOnce();
  });
  it('fails rather than claiming complete usage after an inaccessible or malformed draft', async () => {
    const services = double({ type: 'doc', version: 99, content: [] });
    await expect(readReferenceUsage(services as unknown as Services, context, { kind: 'variable', id: 'variable-a' })).rejects.toThrow('complete usage');
    services.topicDrafts.get.mockRejectedValueOnce(new Error('Denied'));
    await expect(readReferenceUsage(services as unknown as Services, context, { kind: 'variable', id: 'variable-a' })).rejects.toThrow('Denied');
  });
  it('rejects foreign catalog definitions, including workspace-shared scope checks', async () => {
    const services = double();
    services.variables.list.mockResolvedValue([{ ...variable, projectId: 'foreign' }]);
    await expect(readSemanticCatalog(services as unknown as Services, context)).rejects.toThrow('verified');
  });
  it('keeps demo usage session-only and never calls backend draft methods', async () => {
    const services = double(undefined, 'demo');
    const found = await readReferenceUsage(services as unknown as Services, context, { kind: 'variable', id: 'variable-a' },
      [{ ...context, documentId: 'doc-a', topicId: 'topic-a', content: { ...text, content: (text.content as never[]).slice(0, 1) } }]);
    expect(found).toHaveLength(1); expect(services.topicDrafts.get).not.toHaveBeenCalled(); expect(services.topicDrafts.save).not.toHaveBeenCalled();
  });
  it('rejects identity changes during a usage scan', async () => {
    const services = double();
    services.auth.getSession.mockResolvedValueOnce({ mode: 'backend', userId: 'user-a', organizationId: 'org-a' })
      .mockResolvedValueOnce({ mode: 'backend', userId: 'user-b', organizationId: 'org-a' });
    await expect(readReferenceUsage(services as unknown as Services, context, { kind: 'variable', id: 'variable-a' })).rejects.toThrow('identity changed');
  });
});
