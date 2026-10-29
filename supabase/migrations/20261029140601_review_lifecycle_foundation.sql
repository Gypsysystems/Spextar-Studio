-- Source-only Issue #9 migration. Never applied by application startup.
-- Evidence has restrictive FKs: deleting a parent must not erase an approval.
create table public.document_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  status text not null check (status in ('in_review','approved','changes_requested')),
  submitted_by uuid not null references auth.users(id),
  submitted_at timestamptz not null default now(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text,
  document_snapshot jsonb not null,
  topics_snapshot jsonb not null check (jsonb_typeof(topics_snapshot) = 'array'),
  unique(document_id, sequence),
  check ((status = 'in_review' and decided_by is null and decided_at is null and decision_note is null)
    or (status <> 'in_review' and decided_by is not null and decided_at is not null)),
  check (status <> 'changes_requested' or (decision_note is not null and decision_note ~ '[^[:space:]]'))
);
create unique index document_reviews_one_active on public.document_reviews(document_id) where status = 'in_review';
create index document_reviews_project on public.document_reviews(project_id);
create index document_reviews_submitter on public.document_reviews(submitted_by);
create index document_reviews_decider on public.document_reviews(decided_by);
alter table public.document_reviews enable row level security;
revoke all on public.document_reviews from public, anon, authenticated;
grant select on public.document_reviews to authenticated;
create policy document_reviews_read on public.document_reviews for select to authenticated
using (exists (select 1 from public.documents d where d.id = document_id and d.project_id = document_reviews.project_id
  and app_private.is_project_member(d.project_id)));

-- No INSERT/UPDATE/DELETE grants or policies. Only explicit checked transitions can
-- create evidence or record its single decision; even privileged callers cannot
-- rewrite a snapshot or a completed decision.
create function app_private.guard_review_evidence() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Review evidence is immutable' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' and (old.status <> 'in_review' or new.status not in ('approved','changes_requested')
    or (to_jsonb(new) - array['status','decided_by','decided_at','decision_note'])
       is distinct from (to_jsonb(old) - array['status','decided_by','decided_at','decision_note'])) then
    raise exception 'Review evidence is immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger document_reviews_immutable before update or delete on public.document_reviews
for each row execute function app_private.guard_review_evidence();

-- All working writes serialize with review transitions on the document row.
-- This also covers old invoker tree RPCs and direct REST writes, rather than
-- relying on client controls or a user-settable transaction flag.
create function app_private.guard_review_working_write() returns trigger
language plpgsql set search_path = '' as $$
declare v_document uuid; v_status text;
begin
  if tg_table_name = 'documents' then
    if tg_op = 'INSERT' then
      if new.status <> 'draft' then raise exception 'New documents must be drafts' using errcode = '42501'; end if;
    elsif current_user <> 'postgres' then
      if old.status <> 'draft' or (tg_op = 'UPDATE' and (new.status <> old.status or new.project_id <> old.project_id or new.id <> old.id)) then
        raise exception 'Document is read only' using errcode = '42501';
      end if;
    end if;
  else
    if tg_table_name = 'topics' then
      v_document := case when tg_op = 'DELETE' then old.document_id else new.document_id end;
      if tg_op = 'UPDATE' and (new.document_id <> old.document_id or new.id <> old.id) then
        raise exception 'Topic scope cannot change' using errcode = '42501';
      end if;
    else
      select t.document_id into v_document from public.topics t
      where t.id = case when tg_op = 'DELETE' then old.topic_id else new.topic_id end;
    end if;
    select status into v_status from public.documents where id = v_document for update;
    if current_user <> 'postgres' and tg_table_name = 'topics' then
      update public.documents set updated_at = now() where id = v_document;
    end if;
    if current_user <> 'postgres' and (v_status is distinct from 'draft'
      or (tg_table_name = 'topics' and tg_op <> 'DELETE' and to_jsonb(new)->>'status' <> 'draft')) then
      raise exception 'Document is read only' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger documents_review_lock before insert or update or delete on public.documents
for each row execute function app_private.guard_review_working_write();
create trigger topics_review_lock before insert or update or delete on public.topics
for each row execute function app_private.guard_review_working_write();
create trigger topic_drafts_review_lock before insert or update or delete on public.topic_drafts
for each row execute function app_private.guard_review_working_write();

-- Privilege is required because reviewers cannot write working content, and
-- authenticated authors must never write review evidence directly. Keep the
-- privileged implementation private, check auth/scope/explicit role on every call,
-- and expose narrow invoker wrappers only. Migration owner must be postgres.
create function app_private.review_transition(
  p_action text, p_project_id uuid, p_document_id uuid,
  p_review_id uuid, p_expected_updated_at timestamptz, p_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.documents%rowtype; v_review public.document_reviews%rowtype;
  v_role text; v_id uuid; v_topics jsonb; v_topic jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select role into v_role from public.project_members
    where project_id = p_project_id and user_id = auth.uid() for share;
  if (p_action in ('submit','draft') and v_role in ('admin','author'))
    or (p_action in ('approved','changes_requested') and v_role in ('admin','reviewer')) then null;
  else raise exception 'Project permission required' using errcode = '42501'; end if;
  select * into v_doc from public.documents where id = p_document_id and project_id = p_project_id for update;
  if not found then raise exception 'Document unavailable' using errcode = '42501'; end if;
  if p_action = 'submit' then
    if v_doc.status <> 'draft' or v_doc.updated_at is distinct from p_expected_updated_at then
      raise exception 'Document changed' using errcode = '40001'; end if;
    -- Guard triggers lock this document for every concurrent topic/body write.
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',t.id,'parent_topic_id',t.parent_topic_id,'title',t.title,'slug',t.slug,
      'sort_order',t.sort_order,'settings',t.settings,'revision',td.revision,'content',td.content
    ) order by t.sort_order,t.id), '[]'::jsonb) into v_topics
      from public.topics t left join public.topic_drafts td on td.topic_id = t.id where t.document_id = p_document_id;
    insert into public.document_reviews(project_id,document_id,sequence,status,submitted_by,document_snapshot,topics_snapshot)
      values(p_project_id,p_document_id,(select coalesce(max(sequence),0)+1 from public.document_reviews where document_id = p_document_id),
        'in_review',auth.uid(),jsonb_build_object('title',v_doc.title,'slug',v_doc.slug,'description',v_doc.description,'settings',v_doc.settings),v_topics)
      returning id into v_id;
    update public.documents set status = 'in_review' where id = p_document_id;
    update public.topics set status = 'in_review' where document_id = p_document_id;
    return v_id;
  end if;
  select * into v_review from public.document_reviews
    where id = p_review_id and document_id = p_document_id and project_id = p_project_id for update;
  if not found then raise exception 'Review changed' using errcode = '40001'; end if;
  if p_action = 'draft' then
    if v_doc.status <> 'approved' or v_doc.updated_at is distinct from p_expected_updated_at or v_review.status <> 'approved'
      or v_review.sequence <> (select max(sequence) from public.document_reviews where document_id = p_document_id) then
      raise exception 'Approved review changed' using errcode = '40001'; end if;
    -- Locked content must retain its identities. Fail closed on privileged drift;
    -- never silently remove extra topics or reuse IDs from another document.
    if (select count(*) from public.topics where document_id = p_document_id) <> jsonb_array_length(v_review.topics_snapshot)
      or exists (select 1 from jsonb_array_elements(v_review.topics_snapshot) s
        where not exists(select 1 from public.topics t where t.id = (s->>'id')::uuid and t.document_id = p_document_id)) then
      raise exception 'Approved outline changed' using errcode = '40001'; end if;
    update public.documents set status = 'draft', title = v_review.document_snapshot->>'title',
      slug = v_review.document_snapshot->>'slug', description = v_review.document_snapshot->>'description',
      settings = v_review.document_snapshot->'settings' where id = p_document_id;
    for v_topic in select value from jsonb_array_elements(v_review.topics_snapshot) loop
      update public.topics set status = 'draft', title = v_topic->>'title', slug = v_topic->>'slug',
        parent_topic_id = (v_topic->>'parent_topic_id')::uuid, sort_order = (v_topic->>'sort_order')::integer,
        settings = v_topic->'settings' where id = (v_topic->>'id')::uuid and document_id = p_document_id;
      if v_topic->'content' = 'null'::jsonb then
        delete from public.topic_drafts where topic_id = (v_topic->>'id')::uuid;
      else
        insert into public.topic_drafts(topic_id,content) values ((v_topic->>'id')::uuid,v_topic->'content')
          on conflict(topic_id) do update set content = excluded.content;
      end if;
    end loop;
    return v_review.id;
  end if;
  if v_doc.status <> 'in_review' or v_review.status <> 'in_review' then
    raise exception 'Review changed' using errcode = '40001'; end if;
  if p_action = 'changes_requested' and coalesce(p_note !~ '[^[:space:]]',true) then
    raise exception 'Decision note required' using errcode = '22023'; end if;
  update public.document_reviews set status = p_action, decided_by = auth.uid(), decided_at = now(),
    decision_note = nullif(regexp_replace(p_note,'^[[:space:]]+|[[:space:]]+$','','g'),'') where id = p_review_id;
  update public.documents set status = case when p_action = 'approved' then 'approved' else 'draft' end where id = p_document_id;
  update public.topics set status = case when p_action = 'approved' then 'approved' else 'draft' end where document_id = p_document_id;
  return p_review_id;
end $$;
alter function app_private.review_transition(text,uuid,uuid,uuid,timestamptz,text) owner to postgres;
revoke all on function app_private.review_transition(text,uuid,uuid,uuid,timestamptz,text) from public,anon;
grant execute on function app_private.review_transition(text,uuid,uuid,uuid,timestamptz,text) to authenticated;

create function public.submit_document_review(p_project_id uuid,p_document_id uuid,p_expected_updated_at timestamptz)
returns uuid language sql security invoker set search_path = '' as $$
  select app_private.review_transition('submit',p_project_id,p_document_id,null,p_expected_updated_at,null); $$;
create function public.approve_document_review(p_project_id uuid,p_document_id uuid,p_review_id uuid,p_note text)
returns uuid language sql security invoker set search_path = '' as $$
  select app_private.review_transition('approved',p_project_id,p_document_id,p_review_id,null,p_note); $$;
create function public.request_document_changes(p_project_id uuid,p_document_id uuid,p_review_id uuid,p_note text)
returns uuid language sql security invoker set search_path = '' as $$
  select app_private.review_transition('changes_requested',p_project_id,p_document_id,p_review_id,null,p_note); $$;
create function public.start_document_draft(p_project_id uuid,p_document_id uuid,p_review_id uuid,p_expected_updated_at timestamptz)
returns uuid language sql security invoker set search_path = '' as $$
  select app_private.review_transition('draft',p_project_id,p_document_id,p_review_id,p_expected_updated_at,null); $$;
revoke all on function public.submit_document_review(uuid,uuid,timestamptz),
  public.approve_document_review(uuid,uuid,uuid,text),public.request_document_changes(uuid,uuid,uuid,text),
  public.start_document_draft(uuid,uuid,uuid,timestamptz) from public,anon;
grant execute on function public.submit_document_review(uuid,uuid,timestamptz),
  public.approve_document_review(uuid,uuid,uuid,text),public.request_document_changes(uuid,uuid,uuid,text),
  public.start_document_draft(uuid,uuid,uuid,timestamptz) to authenticated;
revoke all on function app_private.guard_review_evidence(),app_private.guard_review_working_write() from public,anon,authenticated;
