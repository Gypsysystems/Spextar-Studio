-- Issue #27 (blocks #26): deterministic conflicts must not enter PostgREST 14 retries.
-- Replace only error transport; preserve signatures, ownership, ACLs, locks and behavior.
-- CREATE OR REPLACE retains existing owners and grants. Accepted migrations stay unchanged.

begin;

create or replace function app_private.publish_document_release(
  p_project_id uuid,p_document_id uuid,p_review_id uuid,p_expected_updated_at timestamptz,p_request_key uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare d public.documents%rowtype; r public.document_reviews%rowtype;
  v public.document_releases%rowtype; source jsonb; package_hash text; evidence jsonb; n integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform 1 from public.project_members where project_id = p_project_id and user_id = auth.uid() and role = 'admin' for share;
  if not found then raise exception 'Project Admin required' using errcode = '42501'; end if;
  if p_request_key is null then raise exception 'Request key required' using errcode = '22023'; end if;
  select * into d from public.documents where id = p_document_id and project_id = p_project_id for update;
  if not found then raise exception 'Document unavailable' using errcode = '42501'; end if;
  select * into v from public.document_releases where project_id = p_project_id and request_key = p_request_key;
  if found then
    if v.document_id <> p_document_id or v.review_id <> p_review_id or v.published_by <> auth.uid() then
      raise sqlstate 'PT409' using message = 'Request changed'; end if;
    return v.id;
  end if;
  if d.status <> 'approved' or d.updated_at is distinct from p_expected_updated_at then
    raise sqlstate 'PT409' using message = 'Approved document changed'; end if;
  select * into r from public.document_reviews where id = p_review_id and document_id = p_document_id and project_id = p_project_id for update;
  if not found or r.status <> 'approved' or r.sequence <> (select max(sequence) from public.document_reviews where document_id = p_document_id) then
    raise sqlstate 'PT409' using message = 'Latest approval required'; end if;
  source := app_private.validate_release_package(r);
  package_hash := encode(sha256(convert_to(app_private.release_canonical_json(source),'UTF8')),'hex');
  select coalesce(max(sequence),0)+1 into n from public.document_releases where document_id = p_document_id;
  evidence := jsonb_build_object('action','publish','reviewId',r.id,'reviewSequence',r.sequence,
    'approvedBy',r.decided_by,'approvedAt',app_private.release_timestamp(r.decided_at),'packageDigest',package_hash);
  v.id := gen_random_uuid(); v.published_at := now();
  evidence := evidence || jsonb_build_object('publishedAt',app_private.release_timestamp(v.published_at));
  insert into public.document_releases(id,project_id,document_id,review_id,sequence,
    package_schema_version,resolver_version,renderer_version,canonicalization,frozen_source,
    package_digest,manifest_digest,published_by,published_at,request_key,audit)
  values(v.id,p_project_id,p_document_id,r.id,n,1,1,1,'spextar-json-v1',source,package_hash,
    encode(sha256(convert_to(app_private.release_canonical_json(jsonb_build_object(
      'schemaVersion',1,'releaseId',v.id,'projectId',p_project_id,'documentId',p_document_id,
      'reviewId',r.id,'sequence',n,'packageDigest',package_hash,'publishedBy',auth.uid(),
      'publishedAt',evidence->>'publishedAt','requestKey',p_request_key,'audit',evidence)),'UTF8')),'hex'),
    auth.uid(),v.published_at,p_request_key,evidence);
  update public.documents set status = 'published' where id = p_document_id;
  update public.topics set status = 'published' where document_id = p_document_id;
  return v.id;
end $$;

create or replace function app_private.review_transition(
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
      raise sqlstate 'PT409' using message = 'Document changed'; end if;
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
  if not found then raise sqlstate 'PT409' using message = 'Review changed'; end if;
  if p_action = 'draft' then
    if v_doc.status not in ('approved','published') or v_doc.updated_at is distinct from p_expected_updated_at or v_review.status <> 'approved'
      or v_review.sequence <> (select max(sequence) from public.document_reviews where document_id = p_document_id) then
      raise sqlstate 'PT409' using message = 'Approved review changed'; end if;
    -- Locked content must retain its identities. Fail closed on privileged drift;
    -- never silently remove extra topics or reuse IDs from another document.
    if (select count(*) from public.topics where document_id = p_document_id) <> jsonb_array_length(v_review.topics_snapshot)
      or exists (select 1 from jsonb_array_elements(v_review.topics_snapshot) s
        where not exists(select 1 from public.topics t where t.id = (s->>'id')::uuid and t.document_id = p_document_id)) then
      raise sqlstate 'PT409' using message = 'Approved outline changed'; end if;
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
    raise sqlstate 'PT409' using message = 'Review changed'; end if;
  if p_action = 'changes_requested' and coalesce(p_note !~ '[^[:space:]]',true) then
    raise exception 'Decision note required' using errcode = '22023'; end if;
  update public.document_reviews set status = p_action, decided_by = auth.uid(), decided_at = now(),
    decision_note = nullif(regexp_replace(p_note,'^[[:space:]]+|[[:space:]]+$','','g'),'') where id = p_review_id;
  update public.documents set status = case when p_action = 'approved' then 'approved' else 'draft' end where id = p_document_id;
  update public.topics set status = case when p_action = 'approved' then 'approved' else 'draft' end where document_id = p_document_id;
  return p_review_id;
end $$;

create or replace function app_private.review_dependency_package(p_project uuid,p_workspace uuid,p_organization uuid,p_topics jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_catalog jsonb; v_topic jsonb; v_kind text; v_result jsonb;
begin
  if not exists(select 1 from public.projects p join public.workspaces w on w.id = p.workspace_id
    where p.id = p_project and p.workspace_id = p_workspace and w.organization_id = p_organization) then
    raise sqlstate 'PT409' using message = 'Review scope changed'; end if;
  v_catalog := jsonb_build_object('variables','{}'::jsonb,'categories','{}'::jsonb,'values','{}'::jsonb,'reusable','{}'::jsonb,'visits',0,'bodies',0);
  for v_topic in select value from jsonb_array_elements(p_topics) loop
    if v_topic->'content' <> 'null'::jsonb then
      v_catalog := app_private.review_dependency_walk(v_topic->'content',p_project,p_workspace,array[]::uuid[],v_catalog);
    elsif v_topic->'revision' <> 'null'::jsonb then
      raise exception 'Invalid submitted missing body' using errcode = '23514'; end if;
  end loop;
  v_result := jsonb_build_object('schemaVersion',1,'resolverVersion',1,'canonicalization','spextar-json-v1',
    'projectId',p_project,'workspaceId',p_workspace,'organizationId',p_organization,
    'outputContext',jsonb_build_object('variableValues','default','conditions','neutral','outputId',null));
  foreach v_kind in array array['variables','categories','values','reusable'] loop
    v_result := v_result || jsonb_build_object(v_kind,(select coalesce(jsonb_agg(value order by key collate "C"),'[]'::jsonb) from jsonb_each(v_catalog->v_kind)));
  end loop;
  perform app_private.check_review_json(v_result);
  if octet_length(v_result::text) > 16777216 then raise exception 'Submitted package too large' using errcode = '23514'; end if;
  return v_result;
end $$;

commit;
