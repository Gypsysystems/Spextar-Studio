-- Issue #19. Source only; no live application/replay authorized.
-- NULL identifies pre-package evidence, never backfilled from mutable catalogs.
alter table public.document_reviews add column dependency_package jsonb;

-- A deliberately finite canonical JSON domain, shared with spextar-json-v1.
-- Object order is irrelevant; original arrays/strings are never normalized.
create function app_private.check_review_json(p_value jsonb, p_depth integer default 0)
returns void language plpgsql immutable set search_path = '' as $$
declare v jsonb;
begin
  if p_value is null or p_depth >= 100 then
    raise exception 'Unsupported review JSON depth' using errcode = '23514'; end if;
  if jsonb_typeof(p_value) = 'number' and
    ((p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric)
     or abs((p_value #>> '{}')::numeric) > 9007199254740991) then
    raise exception 'Unsupported review JSON number' using errcode = '23514'; end if;
  if jsonb_typeof(p_value) = 'object' then
    for v in select value from jsonb_each(p_value) loop
      perform app_private.check_review_json(v, p_depth + 1);
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v in select value from jsonb_array_elements(p_value) loop
      perform app_private.check_review_json(v, p_depth + 1);
    end loop;
  end if;
end $$;

-- STABLE is essential: all catalog SELECTs, including recursive calls, use the
-- package invocation's calling-query MVCC snapshot. No per-read snapshot mixing.
-- Invoker only, private and ungranted; called inside the existing checked
-- postgres-owned transition. Explicit scope checks are required despite that owner.
create function app_private.review_dependency_walk(
  p_body jsonb, p_project uuid, p_workspace uuid, p_trail uuid[], p_catalog jsonb
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_catalog jsonb := p_catalog; v_entry record; v_node jsonb; v_attrs jsonb;
  v_type text; v_parent text; v_allowed text[]; v_key text; v_pair jsonb;
  v_id uuid; v_category uuid; v_row jsonb; v_draft jsonb; v_mark jsonb;
  v_seen text[]; v_count integer := 0;
  v_span text; v_cell jsonb; v_r integer; v_x integer; v_y integer; v_col integer;
  v_width integer; v_height integer; v_grid jsonb; v_rows integer; v_table_width integer;
begin
  v_catalog := jsonb_set(v_catalog,'{bodies}',to_jsonb((v_catalog->>'bodies')::integer + 1));
  if (v_catalog->>'bodies')::integer > 4096 then
    raise exception 'Submitted traversal limit' using errcode = '23514'; end if;
  if jsonb_typeof(p_body) is distinct from 'object' or p_body->>'type' is distinct from 'doc'
    or (p_body ? 'version' and p_body->'version' <> '1'::jsonb)
    or jsonb_typeof(p_body->'content') is distinct from 'array' then
    raise exception 'Unsupported submitted body' using errcode = '23514'; end if;
  perform app_private.check_review_json(p_body);
  -- JSON depth was checked before this recursion; malformed content arrays fail.
  for v_entry in
    with recursive nodes(node,parent) as (
      select value,'doc'::text from jsonb_array_elements(p_body->'content')
      union all
      select c.value,n.node->>'type' from nodes n
        cross join lateral jsonb_array_elements(coalesce(n.node->'content','[]'::jsonb)) c
    ) select node,parent from nodes
  loop
    v_node := v_entry.node; v_type := v_node->>'type'; v_parent := v_entry.parent;
    v_count := v_count + 1;
    v_catalog := jsonb_set(v_catalog,'{visits}',to_jsonb((v_catalog->>'visits')::integer + 1));
    if v_count > 30000 or (v_catalog->>'visits')::integer > 100000
      or jsonb_typeof(v_node) is distinct from 'object'
      or v_type is null or v_type not in ('paragraph','heading','blockquote','bulletList','orderedList','listItem',
        'codeBlock','horizontalRule','table','tableRow','tableCell','tableHeader','callout','variableReference','reusableReference','text','hardBreak') then
      raise exception 'Unsupported review structure' using errcode = '23514'; end if;
    if not (case
      when v_parent in ('doc','callout','blockquote','listItem','tableCell','tableHeader') then
        v_type not in ('text','hardBreak','variableReference','listItem','tableRow','tableCell','tableHeader')
      when v_parent in ('paragraph','heading') then v_type in ('text','hardBreak','variableReference')
      when v_parent = 'codeBlock' then v_type = 'text'
      when v_parent in ('bulletList','orderedList') then v_type = 'listItem'
      when v_parent = 'table' then v_type = 'tableRow'
      when v_parent = 'tableRow' then v_type in ('tableCell','tableHeader') else false end) then
      raise exception 'Invalid submitted node placement' using errcode = '23514'; end if;
    v_allowed := case when v_type = 'text' then array['type','text','marks']
      when v_type = 'hardBreak' then array['type','marks'] else array['type','attrs','content'] end;
    if exists(select 1 from jsonb_object_keys(v_node) k where not k = any(v_allowed)) then
      raise exception 'Unsupported submitted node fields' using errcode = '23514'; end if;
    if v_type = 'text' and (jsonb_typeof(v_node->'text') is distinct from 'string' or length(v_node->>'text') = 0) then
      raise exception 'Invalid submitted text' using errcode = '23514'; end if;
    if v_node ? 'content' and jsonb_typeof(v_node->'content') is distinct from 'array' then
      raise exception 'Invalid submitted children' using errcode = '23514'; end if;
    if v_type in ('text','hardBreak','horizontalRule','variableReference','reusableReference')
      and jsonb_array_length(coalesce(v_node->'content','[]'::jsonb)) > 0 then
      raise exception 'Invalid submitted leaf' using errcode = '23514'; end if;
    if v_type in ('callout','blockquote','bulletList','orderedList','listItem','table','tableCell','tableHeader')
      and jsonb_array_length(coalesce(v_node->'content','[]'::jsonb)) = 0 then
      raise exception 'Empty submitted container' using errcode = '23514'; end if;
    if v_type = 'listItem' and v_node->'content'->0->>'type' is distinct from 'paragraph' then
      raise exception 'Invalid submitted list' using errcode = '23514'; end if;
    v_attrs := coalesce(v_node->'attrs','{}'::jsonb);
    v_allowed := array['id'];
    if v_type in ('paragraph','heading','blockquote','bulletList','orderedList','listItem','codeBlock','horizontalRule','table','callout','reusableReference') then
      v_allowed := v_allowed || array['conditions']; end if;
    v_allowed := v_allowed || case v_type
      when 'variableReference' then array['referenceVersion','variableId']
      when 'reusableReference' then array['referenceVersion','reusableId']
      when 'heading' then array['level'] when 'orderedList' then array['start','type']
      when 'codeBlock' then array['language'] when 'callout' then array['kind']
      when 'tableCell' then array['colspan','rowspan','colwidth','align']
      when 'tableHeader' then array['colspan','rowspan','colwidth','align'] else array[]::text[] end;
    if jsonb_typeof(v_attrs) is distinct from 'object'
      or exists(select 1 from jsonb_object_keys(v_attrs) k where not k = any(v_allowed))
      or (v_attrs ? 'id' and v_attrs->'id' <> 'null'::jsonb and
        (jsonb_typeof(v_attrs->'id') <> 'string' or v_attrs->>'id' !~ '^[A-Za-z0-9_.:-]{1,200}$')) then
      raise exception 'Unsupported submitted attributes' using errcode = '23514'; end if;
    if (v_type = 'heading' and coalesce(v_attrs->'level' not in ('1'::jsonb,'2'::jsonb,'3'::jsonb),true))
      or (v_type = 'callout' and coalesce(v_attrs->>'kind' not in ('note','tip','caution','warning'),true))
      or (v_type = 'orderedList' and ((v_attrs ? 'start' and
        (jsonb_typeof(v_attrs->'start') <> 'number' or (v_attrs->>'start')::numeric < 1))
        or (v_attrs ? 'type' and v_attrs->'type' <> 'null'::jsonb and v_attrs->>'type' not in ('1','a','A','i','I'))))
      or (v_type = 'codeBlock' and v_attrs ? 'language' and jsonb_typeof(v_attrs->'language') not in ('null','string')) then
      raise exception 'Unsupported submitted display settings' using errcode = '23514'; end if;
    if v_type in ('tableCell','tableHeader') then
      foreach v_span in array array['colspan','rowspan'] loop
        if v_attrs ? v_span and (jsonb_typeof(v_attrs->v_span) <> 'number' or (v_attrs->>v_span)::numeric not between 1 and 128) then
          raise exception 'Invalid submitted table span' using errcode = '23514'; end if;
      end loop;
      if v_attrs ? 'align' and v_attrs->'align' <> 'null'::jsonb and v_attrs->>'align' not in ('left','right','center','justify') then
        raise exception 'Invalid submitted cell alignment' using errcode = '23514'; end if;
      if v_attrs ? 'colwidth' and v_attrs->'colwidth' <> 'null'::jsonb then
        if jsonb_typeof(v_attrs->'colwidth') <> 'array' or jsonb_array_length(v_attrs->'colwidth') <> coalesce((v_attrs->>'colspan')::integer,1)
          or exists(select 1 from jsonb_array_elements(v_attrs->'colwidth') w where jsonb_typeof(w) <> 'number' or (w #>> '{}')::numeric not between 1 and 10000) then
          raise exception 'Invalid submitted column widths' using errcode = '23514'; end if;
      end if;
    end if;
    if v_type = 'table' then
      v_grid := '{}'::jsonb; v_r := 0; v_table_width := 0;
      v_rows := jsonb_array_length(v_node->'content');
      for v_row in select value from jsonb_array_elements(v_node->'content') loop
        v_col := 0;
        for v_cell in select value from jsonb_array_elements(coalesce(v_row->'content','[]'::jsonb)) loop
          while v_grid ? (v_r::text || ':' || v_col::text) loop v_col := v_col + 1; end loop;
          v_width := coalesce((v_cell->'attrs'->>'colspan')::integer,1);
          v_height := coalesce((v_cell->'attrs'->>'rowspan')::integer,1);
          if v_width not between 1 and 128 or v_height not between 1 and 128 or v_col + v_width > 128 or v_r + v_height > v_rows then
            raise exception 'Invalid submitted table grid' using errcode = '23514'; end if;
          for v_y in v_r..(v_r + v_height - 1) loop
            for v_x in v_col..(v_col + v_width - 1) loop
              v_key := v_y::text || ':' || v_x::text;
              if v_grid ? v_key then raise exception 'Overlapping submitted table grid' using errcode = '23514'; end if;
              v_grid := v_grid || jsonb_build_object(v_key,true);
            end loop;
          end loop;
          v_col := v_col + v_width;
        end loop;
        v_table_width := greatest(v_table_width,v_col); v_r := v_r + 1;
      end loop;
      if v_table_width = 0 then raise exception 'Empty submitted table grid' using errcode = '23514'; end if;
      for v_y in 0..(v_rows - 1) loop
        for v_x in 0..(v_table_width - 1) loop
          if not v_grid ? (v_y::text || ':' || v_x::text) then
            raise exception 'Inconsistent submitted table grid' using errcode = '23514'; end if;
        end loop;
      end loop;
    end if;
    if v_node ? 'marks' then
      if jsonb_typeof(v_node->'marks') <> 'array' then raise exception 'Invalid submitted marks' using errcode = '23514'; end if;
      v_seen := array[]::text[];
      for v_mark in select value from jsonb_array_elements(v_node->'marks') loop
        if jsonb_typeof(v_mark) <> 'object' or coalesce(v_mark->>'type' not in ('bold','italic','underline','strike','code','link'),true)
          or v_mark->>'type' = any(v_seen) or v_parent = 'codeBlock'
          or exists(select 1 from jsonb_object_keys(v_mark) k where k not in ('type','attrs')) then
          raise exception 'Unsupported submitted marks' using errcode = '23514'; end if;
        v_seen := array_append(v_seen,v_mark->>'type');
        if v_mark->>'type' = 'link' then
          if jsonb_typeof(v_mark->'attrs') is distinct from 'object'
            or jsonb_typeof(v_mark->'attrs'->'href') is distinct from 'string'
            or v_mark->'attrs'->>'href' !~* '^(https?:|mailto:|tel:|/|#|\?|\.?\./)'
            or v_mark->'attrs'->>'href' ~ '[[:space:][:cntrl:]]'
            or exists(select 1 from jsonb_each(v_mark->'attrs') a where a.key not in ('href','target','rel','class','title') or jsonb_typeof(a.value) not in ('null','string'))
            or (v_mark->'attrs'->>'target' is not null and v_mark->'attrs'->>'target' not in ('_blank','_self'))
            or lower(coalesce(v_mark->'attrs'->>'rel','')) ~ '(^|[[:space:]])opener([[:space:]]|$)' then
            raise exception 'Unsafe submitted link' using errcode = '23514'; end if;
        elsif v_mark ? 'attrs' and v_mark->'attrs' <> '{}'::jsonb then
          raise exception 'Unsupported submitted mark attributes' using errcode = '23514'; end if;
      end loop;
      if 'code' = any(v_seen) and cardinality(v_seen) > 1 then
        raise exception 'Invalid submitted inline code' using errcode = '23514'; end if;
    end if;
    if v_attrs ? 'conditions' and v_attrs->'conditions' <> 'null'::jsonb then
      if jsonb_typeof(v_attrs->'conditions') <> 'object' or v_attrs->'conditions'->'version' is distinct from '1'::jsonb
        or jsonb_typeof(v_attrs->'conditions'->'values') is distinct from 'array'
        or exists(select 1 from jsonb_object_keys(v_attrs->'conditions') k where k not in ('version','values')) then
        raise exception 'Unsupported submitted conditions' using errcode = '23514'; end if;
      if jsonb_array_length(v_attrs->'conditions'->'values') > 100 then
        raise exception 'Too many submitted conditions' using errcode = '23514'; end if;
      v_seen := array[]::text[];
      for v_pair in select value from jsonb_array_elements(v_attrs->'conditions'->'values') loop
        if jsonb_typeof(v_pair) <> 'object' or not (v_pair ?& array['categoryId','valueId'])
          or exists(select 1 from jsonb_object_keys(v_pair) k where k not in ('categoryId','valueId'))
          or v_pair::text = any(v_seen) then
          raise exception 'Invalid submitted condition pair' using errcode = '23514'; end if;
        v_seen := array_append(v_seen,v_pair::text);
        v_id := (v_pair->>'valueId')::uuid; v_category := (v_pair->>'categoryId')::uuid;
        if v_id::text is distinct from v_pair->>'valueId' or v_category::text is distinct from v_pair->>'categoryId' then
          raise exception 'Noncanonical submitted identity' using errcode = '23514'; end if;
        select to_jsonb(c) - array['created_by','updated_by'] into v_row
          from public.condition_categories c where c.id = v_category and c.project_id = p_project;
        if not found then raise exception 'Submitted dependency unavailable' using errcode = '42501'; end if;
        if v_row->>'name' ~ '[[:cntrl:]]' then raise exception 'Unsupported submitted condition name' using errcode = '23514'; end if;
        v_catalog := jsonb_set(v_catalog,array['categories',v_category::text],v_row);
        select to_jsonb(c) - array['created_by','updated_by'] into v_row
          from public.condition_values c where c.id = v_id and c.category_id = v_category;
        if not found then raise exception 'Submitted dependency unavailable' using errcode = '42501'; end if;
        if v_row->>'name' ~ '[[:cntrl:]]' then raise exception 'Unsupported submitted condition name' using errcode = '23514'; end if;
        v_catalog := jsonb_set(v_catalog,array['values',v_id::text],v_row);
      end loop;
    end if;
    if v_type in ('variableReference','reusableReference') then
      v_key := case when v_type = 'variableReference' then 'variableId' else 'reusableId' end;
      if v_attrs->'referenceVersion' is distinct from '1'::jsonb or jsonb_typeof(v_attrs->v_key) is distinct from 'string' then
        raise exception 'Unsupported submitted reference' using errcode = '23514'; end if;
      v_id := (v_attrs->>v_key)::uuid;
      if v_id::text is distinct from v_attrs->>v_key then
        raise exception 'Noncanonical submitted identity' using errcode = '23514'; end if;
      if v_type = 'variableReference' then
        select to_jsonb(v) - array['created_by','updated_by'] into v_row
          from public.project_variables v where v.id = v_id and v.project_id = p_project;
        if not found then raise exception 'Submitted dependency unavailable' using errcode = '42501'; end if;
        if v_row->>'value_type' <> 'text' or jsonb_typeof(v_row->'value') <> 'string'
          or ((v_row->>'required')::boolean and v_row->>'value' !~ '[^[:space:]]')
          or char_length(v_row->>'value') > 50000 or char_length(v_row->>'description') > 2000
          or v_row->>'name' ~ '[[:cntrl:]]'
          or jsonb_typeof(v_row->'output_values') <> 'object'
          or exists(select 1 from jsonb_each(v_row->'output_values') x where x.key not in ('web-help','pdf-manual','word-review') or jsonb_typeof(x.value) <> 'string' or char_length(x.value #>> '{}') > 50000) then
          raise exception 'Unsupported submitted variable' using errcode = '23514'; end if;
        v_catalog := jsonb_set(v_catalog,array['variables',v_id::text],v_row);
      else
        if v_id = any(p_trail) or cardinality(p_trail) >= 8 then
          raise exception 'Submitted reusable cycle or depth limit' using errcode = '23514'; end if;
        select to_jsonb(r) - array['updated_by'] into v_row
          from public.reusable_contents r where r.id = v_id and r.workspace_id = p_workspace
            and ((r.scope = 'project' and r.project_id = p_project) or (r.scope = 'workspace' and r.project_id is null));
        if not found then raise exception 'Submitted dependency unavailable' using errcode = '42501'; end if;
        select jsonb_build_object('reusable_content_id',d.reusable_content_id,'content',d.content,
          'revision',d.revision,'updated_at',d.updated_at,'updated_by',d.updated_by) into v_draft
          from public.reusable_content_drafts d where d.reusable_content_id = v_id;
        if not found then raise exception 'Submitted reusable body unavailable' using errcode = '42501'; end if;
        v_catalog := jsonb_set(v_catalog,array['reusable',v_id::text],jsonb_build_object('item',v_row,'draft',v_draft));
        if (select count(*) from jsonb_object_keys(v_catalog->'reusable')) > 256 then
          raise exception 'Submitted dependency limit' using errcode = '23514'; end if;
        v_catalog := app_private.review_dependency_walk(v_draft->'content',p_project,p_workspace,array_append(p_trail,v_id),v_catalog);
      end if;
    end if;
  end loop;
  return v_catalog;
end $$;

create function app_private.capture_review_dependencies() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_scope record; v_result jsonb;
begin
  -- No new privileged entry point: the accepted transition owns evidence inserts.
  if current_user <> 'postgres' or auth.uid() is null or new.submitted_by <> auth.uid()
    or not exists(select 1 from public.project_members m where m.project_id = new.project_id
      and m.user_id = auth.uid() and m.role in ('admin','author')) then
    raise exception 'Project permission required' using errcode = '42501'; end if;
  select p.workspace_id,w.organization_id into v_scope from public.projects p
    join public.workspaces w on w.id = p.workspace_id
    join public.documents d on d.project_id = p.id
    where p.id = new.project_id and d.id = new.document_id;
  if not found then raise exception 'Review scope unavailable' using errcode = '42501'; end if;
  -- One STABLE function invocation traverses ALL submitted topics in one snapshot.
  v_result := app_private.review_dependency_package(new.project_id,v_scope.workspace_id,v_scope.organization_id,new.topics_snapshot);
  perform app_private.check_review_json(jsonb_build_object(
    'document',new.document_snapshot,'topics',new.topics_snapshot,'dependencies',v_result));
  new.dependency_package := v_result;
  return new;
end $$;

create function app_private.review_dependency_package(p_project uuid,p_workspace uuid,p_organization uuid,p_topics jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_catalog jsonb; v_topic jsonb; v_kind text; v_result jsonb;
begin
  if not exists(select 1 from public.projects p join public.workspaces w on w.id = p.workspace_id
    where p.id = p_project and p.workspace_id = p_workspace and w.organization_id = p_organization) then
    raise exception 'Review scope changed' using errcode = '40001'; end if;
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

create trigger document_reviews_capture_dependencies before insert on public.document_reviews
for each row execute function app_private.capture_review_dependencies();
-- Existing guard_review_evidence compares every column except single-decision
-- fields, so this column inherits immutable approval/new-Draft protection and
-- existing parent-review SELECT RLS, with no new table or read privilege.
revoke all on function app_private.check_review_json(jsonb,integer),
  app_private.review_dependency_walk(jsonb,uuid,uuid,uuid[],jsonb),
  app_private.review_dependency_package(uuid,uuid,uuid,jsonb),
  app_private.capture_review_dependencies() from public,anon,authenticated;
