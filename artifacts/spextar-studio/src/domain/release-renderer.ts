import { canonicalReviewJson } from './review-package';
import { orderTopics } from './topic-tree';
import type { Review } from './reviews';
import { publishCandidate } from './releases';
import type { JSONValue, TopicContent } from './topic-content';
import { jsonObject } from './semantic-references';
/** Pinned renderer/resolver v1. Pure frozen input only; no Services or HTML. */
export function renderReleaseV1(input: Review): { topics: Array<{ id: string; title: string; content: TopicContent }>; warnings: string[] } {
  const review = publishCandidate(input), p = review.dependency_package!;
  const warnings = new Set<string>(); let count = 0, bytes = 0;
  const charge=(text:string)=>{bytes+=new TextEncoder().encode(text).length;if(bytes>33554432)throw new Error('Release rendering limit exceeded.');};
  const nodes = (raw: JSONValue[], trail: string[]): JSONValue[] => raw.flatMap((node): JSONValue[] => {
    if (++count > 100000 || !jsonObject(node)) throw new Error('Release rendering limit exceeded.');
    charge(canonicalReviewJson(node));
    const attrs = jsonObject(node.attrs) ? node.attrs : {};
    if (jsonObject(attrs.conditions) && Array.isArray(attrs.conditions.values)) for (const pair of attrs.conditions.values) {
      if(jsonObject(pair)) {charge(String(p.categories.find(c=>c.id===pair.categoryId)!.name));charge(String(p.values.find(v=>v.id===pair.valueId)!.name));}
    }
    if (node.type === 'variableReference') {
      const v = p.variables.find(v => v.id === attrs.variableId)!;
      const text = String(v.value); charge(text);
      if (!text) { warnings.add(`The optional variable “${String(v.name)}” is empty.`); return []; }
      return [{ type:'text',text }];
    }
    if (node.type === 'reusableReference') {
      const id = String(attrs.reusableId);
      if (trail.length >= 8 || trail.includes(id)) throw new Error('Linked content cannot be rendered.');
      const entry = p.reusable.find(r=>r.item.id===id)!;
      const body = entry.draft.content as TopicContent; charge(String(entry.item.name));
      const wrapper: Record<string,JSONValue> = {name:String(entry.item.name),revision:Number(entry.draft.revision)};
      if (attrs.conditions) wrapper.conditions=attrs.conditions;
      return [{type:'releaseReusable',attrs:wrapper,content:nodes(body.content as JSONValue[],[...trail,id])}];
    }
    return [{...node,...(Array.isArray(node.content) ? {content:nodes(node.content,trail)} : {})}];
  });
  const ordered = orderTopics(review.topics_snapshot.map(t=>({id:t.id,title:t.title,kind:'concept',level:1,body:[],parentTopicId:t.parent_topic_id,sortOrder:t.sort_order})));
  return { topics:ordered.map(({id})=>review.topics_snapshot.find(t=>t.id===id)!).map(t=>({id:t.id,title:t.title,content:{...t.content!,content:nodes(t.content!.content as JSONValue[],[])}})),warnings:[...warnings] };
}
