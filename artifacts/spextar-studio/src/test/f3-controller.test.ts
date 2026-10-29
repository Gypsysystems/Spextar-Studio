import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TopicDraftController } from '@/features/content/topic-draft-controller';
import { contentText, emptyContent, withText, type TopicContent, type TopicDraft } from '@/domain/topic-content';
import { ServiceError, type TopicDraftService } from '@/services/contracts';
import { clearDeletedRecovery, clearIdentityRecovery, readRecovery, rememberRecovery } from '@/services/topic-draft-recovery';

const scope = { userId: 'identity-a', projectId: 'project-a', documentId: 'document-a', topicId: 'topic-a' };
const body = (text: string) => withText(emptyContent(), text);
const controllers: TopicDraftController[] = [];
function setup(canEdit = true) {
  let server: TopicDraft | null = null;
  const service: TopicDraftService = {
    get: vi.fn(async () => server),
    save: vi.fn(async (_scope, content, expected) => {
      if ((server?.revision ?? null) !== expected) throw new ServiceError('Concurrent edit', 'conflict');
      server = { topicId: scope.topicId, content, revision: (server?.revision ?? 0) + 1, updatedAt: new Date().toISOString(), updatedBy: scope.userId };
      return server;
    }),
  };
  const afterSave = vi.fn();
  const controller = new TopicDraftController(service, scope, canEdit, afterSave);
  controllers.push(controller);
  return { controller, service, afterSave, setServer(value: TopicDraft) { server = value; }, getServer: () => server };
}
const boot = async (controller: TopicDraftController) => { controller.start(); await vi.advanceTimersByTimeAsync(0); };
beforeEach(() => vi.useFakeTimers());
afterEach(() => { controllers.splice(0).forEach((controller) => controller.stop()); });

describe('F3 autosave and recovery controller', () => {
  it('saves and recovers semantic callouts with metadata/IDs through conflicts and retries', async () => {
    const { controller, service, setServer, getServer } = setup();
    await boot(controller);
    controller.changeDocument({ type: 'doc', version: 1, metadata: { locale: 'en' }, content: [
      { type: 'callout', attrs: { kind: 'caution' }, content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Disconnect power first', marks: [{ type: 'bold' }] }] },
      ] },
    ] });
    const local = controller.getSnapshot().content;
    expect(readRecovery(scope)[0].copy.content).toEqual(local);
    expect(JSON.stringify(local)).toContain('"id"');
    setServer({ topicId: scope.topicId, content: body('Remote newer'), revision: 1, updatedAt: new Date().toISOString(), updatedBy: 'other' });
    await vi.advanceTimersByTimeAsync(700);
    expect(controller.getSnapshot().status).toBe('conflict');
    await controller.retry();
    expect(getServer()?.content).toEqual(body('Remote newer'));
    await controller.reload();
    controller.restore();
    vi.mocked(service.save).mockRejectedValueOnce(new ServiceError('Offline', 'network'));
    await vi.advanceTimersByTimeAsync(700);
    expect(controller.getSnapshot().status).toBe('error');
    expect(readRecovery(scope)[0].copy.content).toEqual(local);
    await controller.retry();
    expect(getServer()).toMatchObject({ content: local, revision: 2 });
    expect(readRecovery(scope)).toHaveLength(0);
    controller.stop();
    const reloaded = new TopicDraftController(service, scope, true);
    controllers.push(reloaded);
    await boot(reloaded);
    expect(reloaded.getSnapshot().content).toEqual(local);
  });
  it('recovers variable, conditional and reusable identities after failed saves without flattening them', async () => {
    const { controller, service, getServer } = setup();
    await boot(controller);
    const content: TopicContent = { type:'doc',version:1,content:[
      {type:'paragraph',attrs:{id:'conditioned-block',conditions:{version:1,values:[{categoryId:'category-a',valueId:'value-a'}]}},content:[{type:'variableReference',attrs:{id:'variable-node',referenceVersion:1,variableId:'variable-a'}}]},
      {type:'reusableReference',attrs:{id:'reusable-node',referenceVersion:1,reusableId:'reusable-a'}},
    ] };
    vi.mocked(service.save).mockRejectedValueOnce(new ServiceError('Offline','network'));
    controller.changeDocument(content);
    await vi.advanceTimersByTimeAsync(700);
    expect(controller.getSnapshot().status).toBe('error');
    expect(readRecovery(scope)[0].copy.content).toEqual(content);
    controller.stop();
    const reloaded = new TopicDraftController(service,scope,true);controllers.push(reloaded);
    await boot(reloaded);
    reloaded.restore();
    await vi.advanceTimersByTimeAsync(700);
    expect(getServer()?.content).toEqual(content);
    expect(readRecovery(scope)).toHaveLength(0);
  });
  it('does not save callout changes for read-only membership', async () => {
    const { controller, service } = setup(false);
    await boot(controller);
    controller.changeDocument({ type: 'doc', version: 1, content: [
      { type: 'callout', attrs: { kind: 'note' }, content: [{ type: 'paragraph' }] },
    ] });
    await vi.advanceTimersByTimeAsync(1000);
    expect(service.save).not.toHaveBeenCalled();
    expect(readRecovery(scope)).toHaveLength(0);
  });
  it('writes recovery immediately, debounces saves and clears matching recovery after confirmation', async () => {
    const { controller, service, afterSave } = setup();
    await boot(controller);
    expect(controller.getSnapshot()).toMatchObject({ status: 'saved', revision: null });
    controller.change('first');
    expect(readRecovery(scope)[0].copy.content).toEqual(body('first'));
    await vi.advanceTimersByTimeAsync(400);
    controller.change('final');
    await vi.advanceTimersByTimeAsync(699);
    expect(service.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(service.save).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({ status: 'saved', revision: 1, text: 'final' });
    expect(readRecovery(scope)).toHaveLength(0);
    expect(afterSave).toHaveBeenCalledOnce();
  });
  it('retains edits made during an in-flight save and serializes the next revision', async () => {
    const { controller, service } = setup();
    await boot(controller);
    let finish!: (row: TopicDraft) => void;
    vi.mocked(service.save).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    controller.change('first');
    await vi.advanceTimersByTimeAsync(700);
    expect(controller.getSnapshot().status).toBe('saving');
    controller.change('latest');
    finish({ topicId: scope.topicId, content: body('first'), revision: 1, updatedAt: new Date().toISOString(), updatedBy: scope.userId });
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getSnapshot()).toMatchObject({ status: 'unsaved', text: 'latest', revision: 1 });
    expect(readRecovery(scope)[0].copy.baseRevision).toBe(1);
    controller.stop();
  });
  it('offers recovery after remount and only restores after an explicit decision', async () => {
    const { controller, service } = setup();
    await boot(controller);
    controller.change('crash recovery');
    controller.stop();
    const restored = new TopicDraftController(service, scope, true);
    controllers.push(restored);
    await boot(restored);
    expect(restored.getSnapshot().text).toBe('');
    expect(restored.getSnapshot().recovery).toHaveLength(1);
    expect(restored.editable()).toBe(false);
    expect(service.save).not.toHaveBeenCalled();
    restored.restore();
    await vi.advanceTimersByTimeAsync(700);
    expect(restored.getSnapshot()).toMatchObject({ text: 'crash recovery', status: 'saved', revision: 1 });
    expect(readRecovery(scope)).toHaveLength(0);
  });
  it('discards recovery without writing to the backend', async () => {
    rememberRecovery(scope, body('discard this'), null);
    const { controller, service } = setup();
    await boot(controller);
    controller.discard();
    expect(controller.editable()).toBe(true);
    expect(readRecovery(scope)).toHaveLength(0);
    expect(service.save).not.toHaveBeenCalled();
  });
  it('retains conflict content; retry cannot overwrite; reload then explicit restore uses the new revision', async () => {
    const { controller, service, setServer } = setup();
    await boot(controller);
    controller.change('mine');
    setServer({ topicId: scope.topicId, content: body('other browser'), revision: 1, updatedAt: new Date().toISOString(), updatedBy: 'other' });
    await vi.advanceTimersByTimeAsync(700);
    expect(controller.getSnapshot()).toMatchObject({ text: 'mine', status: 'conflict', revision: null });
    await controller.retry();
    expect(controller.getSnapshot().status).toBe('conflict');
    expect(service.save).toHaveBeenLastCalledWith(scope, body('mine'), null);
    await controller.reload();
    expect(controller.getSnapshot()).toMatchObject({ text: 'other browser', revision: 1 });
    expect(controller.getSnapshot().recovery).toHaveLength(1);
    controller.restore();
    await vi.advanceTimersByTimeAsync(700);
    expect(controller.getSnapshot()).toMatchObject({ text: 'mine', revision: 2, status: 'saved' });
  });
  it('keeps network-failed content locally and retries only on request', async () => {
    const { controller, service } = setup();
    vi.mocked(service.save).mockRejectedValueOnce(new ServiceError('Offline', 'network'));
    await boot(controller);
    controller.change('keep me');
    await vi.advanceTimersByTimeAsync(5000);
    expect(controller.getSnapshot()).toMatchObject({ status: 'error', text: 'keep me' });
    expect(service.save).toHaveBeenCalledTimes(1);
    expect(readRecovery(scope)).toHaveLength(1);
    await controller.retry();
    expect(controller.getSnapshot().status).toBe('saved');
  });
  it('recognizes an ambiguously committed save on reload without overwriting it', async () => {
    const { controller, service, setServer } = setup();
    await boot(controller);
    vi.mocked(service.save).mockImplementationOnce(async (_scope, content) => {
      setServer({ topicId: scope.topicId, content, revision: 1, updatedAt: new Date().toISOString(), updatedBy: scope.userId });
      throw new ServiceError('Response lost', 'network');
    });
    controller.change('committed');
    await vi.advanceTimersByTimeAsync(700);
    expect(controller.getSnapshot().status).toBe('error');
    await controller.reload();
    expect(controller.getSnapshot()).toMatchObject({ status: 'saved', text: 'committed', revision: 1, recovery: [] });
    expect(readRecovery(scope)).toHaveLength(0);
  });
  it('does not write on unmount and does not lose recovery after a late save completion', async () => {
    const { controller, service } = setup();
    await boot(controller);
    controller.change('unsaved');
    controller.stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(service.save).not.toHaveBeenCalled();
    expect(readRecovery(scope)).toHaveLength(1);
  });
  it('cannot recreate cleared logout recovery when an in-flight response arrives late', async () => {
    const { controller, service } = setup();
    await boot(controller);
    let finish!: (row: TopicDraft) => void;
    vi.mocked(service.save).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    controller.change('in flight');
    await vi.advanceTimersByTimeAsync(700);
    controller.change('newer private edit');
    controller.stop(); clearIdentityRecovery(scope.userId);
    finish({ topicId: scope.topicId, content: body('in flight'), revision: 1, updatedAt: new Date().toISOString(), updatedBy: scope.userId });
    await vi.advanceTimersByTimeAsync(2000);
    controller.change('late input');
    expect(readRecovery(scope)).toHaveLength(0);
    expect(service.save).toHaveBeenCalledTimes(1);
  });
  it('loads read-only content but neither restores nor saves local edits', async () => {
    rememberRecovery(scope, body('old author copy'), null);
    const { controller, service } = setup(false);
    await boot(controller);
    expect(controller.getSnapshot().recovery).toHaveLength(0);
    controller.change('blocked'); controller.restore(); await controller.retry();
    expect(controller.getSnapshot().text).toBe('');
    expect(service.save).not.toHaveBeenCalled();
  });
  it('isolates recovery by identity and topic, with targeted logout/delete cleanup', () => {
    rememberRecovery(scope, body('mine'), null);
    rememberRecovery({ ...scope, userId: 'identity-b' }, body('theirs'), null);
    rememberRecovery({ ...scope, topicId: 'topic-b' }, body('other topic'), null);
    expect(readRecovery({ ...scope, topicId: 'missing' })).toHaveLength(0);
    clearDeletedRecovery(scope.userId, scope.projectId, scope.documentId, scope.topicId);
    expect(readRecovery(scope)).toHaveLength(0);
    expect(readRecovery({ ...scope, topicId: 'topic-b' })).toHaveLength(1);
    clearIdentityRecovery(scope.userId);
    expect(readRecovery({ ...scope, topicId: 'topic-b' })).toHaveLength(0);
    expect(readRecovery({ ...scope, userId: 'identity-b' })).toHaveLength(1);
  });
  it('warns if browser recovery storage is blocked but still permits server autosave', async () => {
    const { controller } = setup();
    await boot(controller);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    controller.change('still save');
    expect(controller.getSnapshot().recoveryWarning).toMatch(/could not be stored/);
    await vi.advanceTimersByTimeAsync(700);
    expect(controller.getSnapshot().status).toBe('saved');
  });
  it('refreshes clean drafts on focus without rebasing dirty content automatically', async () => {
    const { controller, setServer } = setup();
    await boot(controller);
    setServer({ topicId: scope.topicId, content: body('external'), revision: 1, updatedAt: new Date().toISOString(), updatedBy: 'other' });
    controller.refreshIfClean();
    await vi.advanceTimersByTimeAsync(0);
    expect(contentText(controller.getSnapshot().content)).toBe('external');
    controller.change('dirty');
    setServer({ topicId: scope.topicId, content: body('new external'), revision: 2, updatedAt: new Date().toISOString(), updatedBy: 'other' });
    controller.refreshIfClean();
    expect(controller.getSnapshot()).toMatchObject({ text: 'dirty', revision: 1 });
  });
  it('recovers and conditionally saves structured JSON, including marks, IDs and root metadata', async () => {
    const { controller, service } = setup();
    await boot(controller);
    const content = { type: 'doc', version: 1, metadata: { locale: 'en' }, content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Technical heading', marks: [{ type: 'bold' }] }] },
    ] };
    controller.changeDocument(content);
    const recovery = readRecovery(scope)[0].copy.content;
    expect(recovery).toMatchObject({ metadata: { locale: 'en' } });
    expect(JSON.stringify(recovery)).toContain('"id"');
    await vi.advanceTimersByTimeAsync(700);
    expect(service.save).toHaveBeenCalledWith(scope, recovery, null);
    expect(controller.getSnapshot().content).toEqual(recovery);
    expect(readRecovery(scope)).toHaveLength(0);
  });
  it('never lets an older recovery copy replace an unsupported saved format', async () => {
    const { controller, service, setServer } = setup();
    const content = { type: 'doc', version: 2, content: [{ type: 'futureReuse', attrs: { id: 'preserve' } }] };
    setServer({ topicId: scope.topicId, content, revision: 1, updatedAt: new Date().toISOString(), updatedBy: 'other' });
    rememberRecovery(scope, body('older plain body'), null);
    await boot(controller);
    expect(controller.editable()).toBe(false);
    controller.restore();
    await vi.advanceTimersByTimeAsync(900);
    expect(service.save).not.toHaveBeenCalled();
    expect(controller.getSnapshot().content).toEqual(content);
    expect(readRecovery(scope)).toHaveLength(1);
  });
  it('keeps structured recovery and IDs intact through a conflict, retry, reload and explicit restore', async () => {
    const { controller, getServer, setServer } = setup();
    setServer({ topicId: scope.topicId, content: body('original'), revision: 1, updatedAt: new Date().toISOString(), updatedBy: scope.userId });
    await boot(controller);
    controller.changeDocument({ type: 'doc', version: 1, metadata: { source: 'local' }, content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Local heading', marks: [{ type: 'italic' }] }] },
    ] });
    const local = controller.getSnapshot().content;
    const remote = { type: 'doc', version: 1, metadata: { source: 'remote' }, content: [
      { type: 'paragraph', attrs: { id: 'remote-block' }, content: [{ type: 'text', text: 'Newer remote' }] },
    ] };
    setServer({ topicId: scope.topicId, content: remote, revision: 2, updatedAt: new Date().toISOString(), updatedBy: 'other' });
    await vi.advanceTimersByTimeAsync(700);
    expect(controller.getSnapshot().status).toBe('conflict');
    expect(readRecovery(scope)[0].copy.content).toEqual(local);
    await controller.retry();
    expect(getServer()?.content).toEqual(remote);
    await controller.reload();
    expect(controller.getSnapshot().content).toEqual(remote);
    controller.restore();
    await vi.advanceTimersByTimeAsync(700);
    expect(getServer()).toMatchObject({ content: local, revision: 3 });
    expect(controller.getSnapshot().content).toEqual(local);
    expect(readRecovery(scope)).toHaveLength(0);
  });
});
