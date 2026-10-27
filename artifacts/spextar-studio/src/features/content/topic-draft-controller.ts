import { contentKey, contentText, emptyContent, withText, type DraftScope, type TopicContent, type TopicDraft } from '@/domain/topic-content';
import { ServiceError, type TopicDraftService } from '@/services/contracts';
import { clearMatchingRecovery, readRecovery, rememberRecovery, removeRecovery } from '@/services/topic-draft-recovery';
import { ensureNodeIds, supportsStructuredEditing } from '@/domain/structured-content';

export interface DraftRecovery {
  key: string; raw: string; copy: { content: TopicContent; baseRevision: number | null; editedAt: number };
}
export interface DraftRecoveryPort {
  read(): DraftRecovery[];
  remember(content: TopicContent, revision: number | null): void;
  clearMatching(content: TopicContent): void;
  remove(records: DraftRecovery[]): void;
}
type DraftSnapshot = Pick<TopicDraft, 'content' | 'revision' | 'updatedAt' | 'updatedBy'>;
export interface StructuredDraftTransport {
  get(): Promise<DraftSnapshot | null>;
  save(content: TopicContent, revision: number | null): Promise<DraftSnapshot>;
}
export interface DraftState {
  status: 'loading' | 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict';
  loaded: boolean;
  content: TopicContent;
  text: string;
  revision: number | null;
  error: string | null;
  recoveryWarning: string | null;
  recovery: DraftRecovery[];
}

/** One controller per identity+content scope. No write-on-unmount or blind retry.
 * Local edits are synchronously recoverable before a debounce/network request begins.
 */
export class StructuredDraftController {
  private state: DraftState = {
    status: 'loading', loaded: false, content: emptyContent(), text: '', revision: null,
    error: null, recoveryWarning: null, recovery: [],
  };
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private alive = false;
  private epoch = 0;
  private running = false;
  private saved: DraftSnapshot | null = null;
  private readonly debounce = 700;
  constructor(
    private readonly service: StructuredDraftTransport,
    readonly canEdit: boolean,
    private readonly recovery: DraftRecoveryPort,
    private readonly afterSave: () => void = () => {},
    private readonly deleting: () => 'pending' | 'deleted' | undefined = () => undefined,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private update(patch: Partial<DraftState>) {
    if (!this.alive) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  start = () => { if (!this.alive) { this.alive = true; void this.reload(); } };
  stop = () => { this.alive = false; this.epoch++; clearTimeout(this.timer); };
  hasUnsaved = () => ['unsaved', 'saving', 'conflict'].includes(this.state.status)
    || (this.state.status === 'error' && this.state.loaded);
  editable = () => this.alive && this.canEdit && this.state.loaded && !this.state.recovery.length
    && supportsStructuredEditing(this.state.content) && this.state.status !== 'loading';
  private recoveryAction(action: () => void) {
    try { action(); this.update({ recoveryWarning: null }); }
    catch (error) { this.update({ recoveryWarning: error instanceof Error ? error.message : 'Browser recovery is unavailable.' }); }
  }
  private remember() {
    this.recoveryAction(() => this.recovery.remember(this.state.content, this.state.revision));
  }
  reload = async () => {
    if (!this.alive || this.running) return;
    clearTimeout(this.timer);
    const epoch = ++this.epoch;
    this.update({ status: 'loading', error: null });
    try {
      const row = await this.service.get();
      if (!this.alive || epoch !== this.epoch) return;
      this.saved = row;
      const content = row?.content ?? emptyContent();
      let recovery: DraftRecovery[] = [];
      if (this.canEdit) this.recoveryAction(() => {
        this.recovery.clearMatching(content);
        recovery = this.recovery.read();
      });
      this.update({ content, text: contentText(content), revision: row?.revision ?? null, loaded: true, status: 'saved', error: null, recovery });
    } catch (error) {
      if (epoch === this.epoch) this.update({ status: 'error', loaded: false, error: error instanceof Error ? error.message : 'Could not load the saved draft.' });
    }
  };
  /** Legacy plain-paragraph entry point; never used to serialize structured editor output. */
  change = (text: string) => {
    if (!this.editable()) return;
    this.edited(withText(this.state.content, text));
  };
  changeDocument = (content: TopicContent) => {
    if (!this.editable()) return;
    this.edited(ensureNodeIds(content));
  };
  private edited(content: TopicContent) {
    const text = contentText(content);
    const conflict = this.state.status === 'conflict';
    this.update({ text, content, status: conflict ? 'conflict' : 'unsaved', error: conflict ? this.state.error : null });
    this.remember();
    clearTimeout(this.timer);
    if (!conflict) this.timer = setTimeout(() => void this.flush(), this.debounce);
  }
  restore = () => {
    if (!this.canEdit || !this.state.loaded || !this.state.recovery.length) return;
    if (!supportsStructuredEditing(this.state.content) || !supportsStructuredEditing(this.state.recovery[0].copy.content)) return;
    const content = ensureNodeIds(this.state.recovery[0].copy.content);
    // Explicit restore adopts ONLY the saved revision currently shown to the user.
    // A concurrent change after this point is still rejected by the database CAS.
    this.update({ content, text: contentText(content), recovery: [], status: 'unsaved', error: null });
    this.remember();
    this.timer = setTimeout(() => void this.flush(), this.debounce);
  };
  discard = () => {
    this.recoveryAction(() => this.recovery.remove(this.state.recovery));
    this.update({ recovery: [] });
  };
  retry = () => this.state.loaded ? this.flush(true) : this.reload();
  refreshIfClean = () => { if (this.state.status === 'saved' && !this.state.recovery.length) void this.reload(); };
  flush = async (explicit = false) => {
    clearTimeout(this.timer);
    if (!this.alive || this.running || !this.editable()
      || (!explicit && ['conflict', 'error'].includes(this.state.status))) return;
    const deletion = this.deleting();
    if (deletion === 'deleted') return;
    if (deletion === 'pending') { this.timer = setTimeout(() => void this.flush(explicit), 100); return; }
    const content = this.state.content;
    if (contentKey(content) === contentKey(this.saved?.content ?? emptyContent())) {
      this.recoveryAction(() => this.recovery.clearMatching(content));
      this.update({ status: 'saved', error: null });
      return;
    }
    const expected = this.state.revision;
    const epoch = this.epoch;
    this.running = true;
    this.update({ status: 'saving', error: null });
    try {
      const row = await this.service.save(content, expected);
      if (!this.alive || epoch !== this.epoch) return;
      this.saved = row;
      const unchanged = contentKey(this.state.content) === contentKey(content);
      this.update({
        revision: row.revision, status: unchanged ? 'saved' : 'unsaved', error: null,
        ...(unchanged ? { content: row.content, text: contentText(row.content) } : {}),
      });
      this.recoveryAction(() => this.recovery.clearMatching(content));
      if (!unchanged) {
        this.remember();
        this.timer = setTimeout(() => void this.flush(), this.debounce);
      }
      this.afterSave();
    } catch (error) {
      if (this.alive && epoch === this.epoch) this.update({
        status: error instanceof ServiceError && error.code === 'conflict' ? 'conflict' : 'error',
        error: error instanceof Error ? error.message : 'Topic body was not saved. Check your connection and retry.',
      });
    } finally { this.running = false; }
  };
}

/** Preserve the Topic API while sharing the exact save/conflict/recovery engine. */
export class TopicDraftController extends StructuredDraftController {
  constructor(service: TopicDraftService, scope: DraftScope, canEdit: boolean, afterSave: () => void = () => {},
    deleting: () => 'pending' | 'deleted' | undefined = () => undefined) {
    super({ get: () => service.get(scope), save: (content, revision) => service.save(scope, content, revision) }, canEdit, {
      read: () => readRecovery(scope),
      remember: (content, revision) => rememberRecovery(scope, content, revision),
      clearMatching: content => clearMatchingRecovery(scope, content),
      remove: records => removeRecovery(records),
    }, afterSave, deleting);
  }
}
