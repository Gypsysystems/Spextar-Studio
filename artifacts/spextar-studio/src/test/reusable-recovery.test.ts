import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { StructuredDraftController } from '@/features/content/topic-draft-controller';
import { draftEntry, disposeDeletedDrafts, disposeTopicDrafts } from '@/features/content/topic-draft-registry';
import { reusableRecovery, clearReusableIdentityRecovery } from '@/services/reusable-recovery';
import { contentKey } from '@/domain/topic-content';
import { reusableBody, reusableContext as context, reusableDouble } from './reusable-fixtures';

const editedBody = (text = 'Locally edited body') => ({ ...reusableBody, content: [{ ...reusableBody.content[0], content: [{ type: 'text', text }] }] });
const controllers: StructuredDraftController[] = [];
afterEach(() => { controllers.forEach(c => c.stop()); controllers.length = 0; vi.useRealTimers(); });
async function mount(canEdit = true, backend = true) {
  const f = reusableDouble();
  const port = reusableRecovery(context, 'reuse-a', backend);
  const saved = vi.fn();
  const controller = new StructuredDraftController({
    get: () => f.reusable.getDraft(context, 'reuse-a'),
    save: (content, revision) => f.reusable.saveDraft(context, 'reuse-a', content, revision),
  }, canEdit, port, saved);
  controllers.push(controller);
  controller.start();
  await vi.waitFor(() => expect(controller.getSnapshot().loaded).toBe(true));
  return { ...f, controller, port, saved };
}

describe('Reusable draft save engine and scoped crash recovery', () => {
  it('debounces changes, preserves JSON/node IDs and clears only matching recovery on a confirmed save', async () => {
    vi.useFakeTimers();
    const f = await mount();
    f.controller.changeDocument(editedBody());
    expect(f.controller.getSnapshot().status).toBe('unsaved');
    expect(f.port.read()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(699);
    expect(f.calls.filter(c => c.patch)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.controller.getSnapshot()).toMatchObject({ status: 'saved', revision: 3, content: editedBody() });
    expect(f.saved).toHaveBeenCalledOnce();
    expect(f.port.read()).toHaveLength(0);
  });
  it('recovers edits after a controller is stopped/reopened, requiring explicit restore/discard', async () => {
    const original = await mount();
    original.controller.changeDocument(editedBody());
    original.controller.stop();
    const recovered = await mount();
    expect(recovered.controller.getSnapshot().recovery).toHaveLength(1);
    expect(recovered.controller.editable()).toBe(false);
    recovered.controller.restore();
    expect(recovered.controller.getSnapshot().content).toEqual(editedBody());
    await recovered.controller.flush(true);
    expect(recovered.port.read()).toHaveLength(0);
    expect(recovered.controller.getSnapshot().revision).toBe(3);
  });
  it('retains both copies on conflict and only explicit restore adopts the freshly reloaded server revision', async () => {
    const f = await mount();
    f.controller.changeDocument(editedBody());
    f.db.reusable_content_drafts[0].revision = 3;
    f.db.reusable_content_drafts[0].content = editedBody('Another browser');
    await f.controller.flush();
    expect(f.controller.getSnapshot().status).toBe('conflict');
    expect(f.db.reusable_content_drafts[0].content).toEqual(editedBody('Another browser'));
    expect(f.port.read()).toHaveLength(1);
    await f.controller.reload();
    expect(f.controller.getSnapshot()).toMatchObject({ revision: 3, content: editedBody('Another browser') });
    expect(f.controller.editable()).toBe(false);
    f.controller.restore(); await f.controller.flush(true);
    expect(f.controller.getSnapshot()).toMatchObject({ status: 'saved', revision: 4, content: editedBody() });
  });
  it('retains failed edits, supports an explicit retry, and does not silently retry errors', async () => {
    vi.useFakeTimers();
    const f = await mount();
    f.errors.set('write:reusable_content_drafts', { code: 'network' });
    f.controller.changeDocument(editedBody()); await f.controller.flush();
    expect(f.controller.getSnapshot().status).toBe('error');
    const attempts = f.calls.filter(c => c.patch).length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.calls.filter(c => c.patch)).toHaveLength(attempts);
    expect(f.port.read()).toHaveLength(1);
    f.errors.clear(); await f.controller.retry();
    expect(f.controller.getSnapshot().status).toBe('saved');
  });
  it('does not edit/save/recover for read-only roles', async () => {
    const f = await mount(false);
    f.controller.changeDocument(editedBody()); await f.controller.flush(true);
    expect(f.controller.editable()).toBe(false);
    expect(f.calls.some(c => c.patch)).toBe(false);
    expect(f.port.read()).toHaveLength(0);
  });
  it('keeps demo recovery out of browser storage', async () => {
    const set = vi.spyOn(Storage.prototype, 'setItem'), get = vi.spyOn(Storage.prototype, 'getItem');
    const port = reusableRecovery(context, 'reuse-a', false);
    port.remember(editedBody(), 1); expect(port.read()).toEqual([]);
    port.clearMatching(editedBody()); port.remove([]);
    expect(set).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
  });
  it('isolates recovery by identity/workspace/project/item and never removes an intervening edit', () => {
    const a = reusableRecovery(context, 'reuse-a', true);
    a.remember(editedBody(), 2); const first = a.read();
    a.remember(editedBody('newer'), 2); a.remove(first);
    expect(a.read()).toHaveLength(1);
    for (const [c, id] of [[{ ...context, userId: 'other-user' }, 'reuse-a'], [{ ...context, workspaceId: 'other-ws' }, 'reuse-a'],
      [{ ...context, projectId: 'other-project' }, 'reuse-a'], [context, 'other-item']] as const) {
      expect(reusableRecovery(c, id, true).read()).toEqual([]);
    }
    const b = reusableRecovery({ ...context, userId: 'other-user' }, 'reuse-a', true);
    b.remember(editedBody(), 2);
    clearReusableIdentityRecovery(context.userId);
    expect(a.read()).toEqual([]); expect(b.read()).toHaveLength(1);
  });
  it('reports storage failure without losing the in-memory body or blocking server save', async () => {
    const f = await mount();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    f.controller.changeDocument(editedBody());
    expect(f.controller.getSnapshot().recoveryWarning).toMatch(/Recovery could not be stored/);
    await f.controller.flush(true);
    expect(f.controller.getSnapshot()).toMatchObject({ status: 'saved', content: editedBody() });
  });
  it('ignores malformed/foreign recovery envelopes without deleting the original bytes', () => {
    const port = reusableRecovery(context, 'reuse-a', true);
    port.remember(editedBody(), 2);
    const original = port.read()[0];
    for (const raw of ['not-json', JSON.stringify({ ...JSON.parse(original.raw), scope: 'foreign' }),
      JSON.stringify({ ...JSON.parse(original.raw), baseRevision: '2' }),
      JSON.stringify({ ...JSON.parse(original.raw), content: { type: 'doc', content: 'invalid' } })]) {
      localStorage.setItem(original.key, raw);
      expect(port.read()).toEqual([]);
      expect(localStorage.getItem(original.key)).toBe(raw);
    }
  });
  it('ignores malformed recovery records and keeps unsupported server content losslessly read-only', async () => {
    const f = reusableDouble();
    const unknown = { ...reusableBody, version: 99, content: [{ type: 'futureNode', attrs: { raw: true } }] };
    f.db.reusable_content_drafts[0].content = unknown;
    const c = new StructuredDraftController({ get: () => f.reusable.getDraft(context, 'reuse-a'), save: vi.fn() }, true, reusableRecovery(context, 'reuse-a', true));
    controllers.push(c); c.start(); await vi.waitFor(() => expect(c.getSnapshot().loaded).toBe(true));
    expect(contentKey(c.getSnapshot().content)).toBe(contentKey(unknown));
    expect(c.editable()).toBe(false);
  });
  it('excludes reusable controllers from F2 deletion teardown but disposes them on identity teardown', async () => {
    const f = await mount(), client = new QueryClient();
    const stop = vi.spyOn(f.controller, 'stop');
    draftEntry(client, JSON.stringify(['reusable', context.userId, context.workspaceId, context.projectId, 'reuse-a']), () => f.controller, 'reusable');
    disposeDeletedDrafts(client, context.projectId, 'document-a');
    expect(stop).not.toHaveBeenCalled();
    disposeTopicDrafts(client);
    expect(stop).toHaveBeenCalledOnce();
    client.clear();
  });
});
