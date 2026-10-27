import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { topicSearchKey } from './topic-search';

export function TopicSearchPanel({ editor, editable, onClose }: { editor: Editor; editable: boolean; onClose: () => void }) {
  const search = useEditorState({ editor, selector: ({ editor: e }) => topicSearchKey.getState(e.state)! });
  const [replacement, setReplacement] = useState('');
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const navigate = (direction: 1 | -1) => { editor.commands.navigateTopicMatch(direction); setNotice(''); };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'Enter' && e.target === input.current) { e.preventDefault(); navigate(e.shiftKey ? -1 : 1); }
  };
  const replace = (all: boolean) => {
    const count = all ? search.matches.length : 1;
    const ok = editor.commands.replaceTopicMatch(replacement, all);
    setNotice(ok ? `Replaced ${count} ${count === 1 ? 'match' : 'matches'}.` : 'Nothing replaced. Check edit permission and the current draft state.');
    replaceInput.current?.focus();
  };
  return (
    <section className="se-search-panel" role="region" aria-label="Find and replace in this topic" onKeyDown={key}>
      <div className="se-search-row">
        <label className="sr-only" htmlFor="topic-find">Find in this topic</label>
        <Input ref={input} id="topic-find" data-topic-find placeholder="Find in this topic" value={search.query} maxLength={2000}
          onChange={(e) => { editor.commands.setTopicSearch(e.target.value, search.caseSensitive); setNotice(''); }} />
        <Button size="icon" variant="ghost" aria-label="Previous match" title="Previous match (Shift+Enter)"
          disabled={!search.matches.length} onClick={() => navigate(-1)}><ChevronUp className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Next match" title="Next match (Enter)"
          disabled={!search.matches.length} onClick={() => navigate(1)}><ChevronDown className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Close find and replace" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <div className="se-search-options">
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={search.caseSensitive}
          onChange={(e) => { editor.commands.setTopicSearch(search.query, e.target.checked); setNotice(''); }} />Match case</label>
        <span role="status" aria-live="polite">{notice && `${notice} `}{search.query
          ? search.matches.length ? `${search.active + 1} of ${search.matches.length}${search.limited ? '+' : ''} matches` : 'No matches'
          : 'Topic body only'}</span>
      </div>
      <div className="se-search-row">
        <label className="sr-only" htmlFor="topic-replace">Replace with</label>
        <Input ref={replaceInput} id="topic-replace" placeholder="Replace with" value={replacement} disabled={!editable}
          onChange={(e) => { setReplacement(e.target.value); setNotice(''); }} />
        <Button size="sm" variant="outline" disabled={!editable || !search.matches.length} onClick={() => replace(false)}>Replace current</Button>
        <Button size="sm" variant="outline" disabled={!editable || !search.matches.length || search.limited} onClick={() => replace(true)}>Replace all</Button>
      </div>
      {!editable && <p className="text-xs text-muted-foreground">Search is available. Replacement requires an editable Project Admin or Author draft.</p>}
      {search.limited && <p className="text-xs text-muted-foreground">Showing the first 10,000 matches. Refine your search before replacing all.</p>}
      <p className="text-xs text-muted-foreground">Literal text within a paragraph, heading or code block; matches do not cross blocks or hard breaks.</p>
    </section>
  );
}
