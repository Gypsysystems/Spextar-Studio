type Row = Record<string, unknown>;
/** Produces transport data for browser tests, not a database resolver or RLS model. */
function capturedDependencies(db: Record<string, Row[]>, doc: Row) {
  const variables = new Map<string,Row>(), categories = new Map<string,Row>(), values = new Map<string,Row>(), reusable = new Map<string,{ item: Row; draft: Row }>();
  const visit = (body: unknown, trail: string[] = []) => {
    if (!body) return;
    const refs: {kind:string;definitionId:string;categoryId?:string}[] = [];
    const scan = (node: Row) => {
      const a = (node.attrs ?? {}) as Row;
      if (node.type === 'variableReference') refs.push({kind:'variable',definitionId:String(a.variableId)});
      if (node.type === 'reusableReference') refs.push({kind:'reusable',definitionId:String(a.reusableId)});
      for (const pair of ((a.conditions as Row)?.values ?? []) as Row[]) refs.push({kind:'condition',definitionId:String(pair.valueId),categoryId:String(pair.categoryId)});
      for (const child of (node.content ?? []) as Row[]) scan(child);
    };
    scan(body as Row);
    for (const ref of refs) {
      if (ref.kind === 'variable') variables.set(ref.definitionId, db.project_variables.find(v => v.id === ref.definitionId)!);
      else if (ref.kind === 'condition') {
        categories.set(ref.categoryId!, db.condition_categories.find(v => v.id === ref.categoryId)!);
        values.set(ref.definitionId, db.condition_values.find(v => v.id === ref.definitionId)!);
      } else {
        if (trail.includes(ref.definitionId) || trail.length >= 8) throw new Error('Invalid browser fixture closure');
        const item = db.reusable_contents.find(r => r.id === ref.definitionId)!;
        const draft = db.reusable_content_drafts.find(r => r.reusable_content_id === ref.definitionId)!;
        reusable.set(ref.definitionId,{item,draft}); visit(draft.content,[...trail,ref.definitionId]);
      }
    }
  };
  db.topics.filter(t=>t.document_id===doc.id).forEach(t=>visit(db.topic_drafts.find(d=>d.topic_id===t.id)?.content));
  const sorted = <T,>(m: Map<string,T>) => [...m].sort(([a],[b])=>a<b?-1:1).map(([,v])=>v);
  const project = db.projects.find(p=>p.id===doc.project_id)!;
  return { schemaVersion:1, resolverVersion:1, canonicalization:'spextar-json-v1', projectId:doc.project_id, workspaceId:project.workspace_id,
    organizationId:db.workspaces.find(w=>w.id===project.workspace_id)!.organization_id,
    outputContext:{variableValues:'default',conditions:'neutral',outputId:null}, variables:sorted(variables), categories:sorted(categories), values:sorted(values), reusable:sorted(reusable) };
}
/** Controlled transport fixture only. SQL/RLS/concurrent database certification is external. */
export function capturedReview(db: Record<string, Row[]>, userId = 'user-a') {
  const doc = db.documents[0];
  return structuredClone({ id: 'review-a', project_id: doc.project_id, document_id: doc.id, sequence: 1,
    status: 'in_review', submitted_by: userId, submitted_at: '2026-10-29T12:00:00Z', decided_by: null, decided_at: null, decision_note: null,
    document_snapshot: { title: doc.title, slug: doc.slug, description: doc.description, settings: doc.settings },
    dependency_package: capturedDependencies(db, doc),
    topics_snapshot: db.topics.filter(t => t.document_id === doc.id).map(t => {
      const draft = db.topic_drafts.find(d => d.topic_id === t.id);
      return { id: t.id, parent_topic_id: t.parent_topic_id, title: t.title, slug: t.slug, sort_order: t.sort_order, settings: t.settings, revision: draft?.revision ?? null, content: draft?.content ?? null };
    }),
  });
}
export function reviewTransition(name: string, body: Row, db: Record<string, Row[]>, role: string | null, userId: string) {
  const failure = (code: string) => ({ status: 409, data: { code } });
  const writer = name === 'submit_document_review' || name === 'start_document_draft';
  if (!(writer ? ['admin', 'author'] : ['admin', 'reviewer']).includes(role ?? '')) return { status: 403, data: { code: '42501' } };
  const doc = db.documents.find(d => d.id === body.p_document_id && d.project_id === body.p_project_id);
  if (!doc) return { status: 403, data: { code: '42501' } };
  let review = db.document_reviews.find(r => r.id === body.p_review_id && r.document_id === doc.id);
  const topics = db.topics.filter(t => t.document_id === doc.id);
  if (name === 'submit_document_review') {
    if (doc.status !== 'draft' || doc.updated_at !== body.p_expected_updated_at) return failure('PT409');
    review = capturedReview(db, userId); review.sequence = db.document_reviews.length + 1; review.id = `review-${review.sequence}`;
    db.document_reviews.unshift(review); doc.status = 'in_review'; topics.forEach(t => { t.status = 'in_review'; });
  } else if (name === 'start_document_draft') {
    if (!review || review !== db.document_reviews[0] || review.status !== 'approved' || doc.status !== 'approved' || doc.updated_at !== body.p_expected_updated_at) return failure('PT409');
    doc.status = 'draft'; topics.forEach(t => { t.status = 'draft'; });
    for (const t of review.topics_snapshot as Row[]) {
      const draft = db.topic_drafts.find(d => d.topic_id === t.id);
      if (draft && t.content) { draft.content = structuredClone(t.content); draft.revision = Number(draft.revision) + 1; }
    }
  } else {
    if (!review || review.status !== 'in_review' || doc.status !== 'in_review') return failure('PT409');
    const changes = name === 'request_document_changes';
    if (changes && !String(body.p_note ?? '').trim()) return failure('22023');
    review.status = changes ? 'changes_requested' : 'approved'; review.decision_note = body.p_note;
    review.decided_by = userId; review.decided_at = '2026-10-29T12:30:00Z';
    doc.status = changes ? 'draft' : 'approved'; topics.forEach(t => { t.status = doc.status; });
  }
  doc.updated_at = new Date(Date.parse(String(doc.updated_at)) + 1000).toISOString();
  return { status: 200, data: String(review!.id) };
}
