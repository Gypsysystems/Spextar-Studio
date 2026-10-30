-- Issue #20. Forward-only source; unapplied. Frozen validation has no current-catalog reads.
create function app_private.release_dependency_walk(
  p_body jsonb, p_project uuid, p_workspace uuid, p_trail uuid[], p_catalog jsonb, p_package jsonb
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
    v_catalog := jsonb_set(v_catalog,'{renderBytes}',to_jsonb((v_catalog->>'renderBytes')::bigint + octet_length(app_private.release_canonical_json(v_node))));
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
        select c into strict v_row from jsonb_array_elements(p_package->'categories') c where c->>'id' = v_category::text and c->>'project_id' = p_project::text;
        if not found then raise exception 'Submitted dependency unavailable' using errcode = '42501'; end if;
        if v_row->>'name' ~ '[[:cntrl:]]' then raise exception 'Unsupported submitted condition name' using errcode = '23514'; end if;
        v_catalog := jsonb_set(v_catalog,'{renderBytes}',to_jsonb((v_catalog->>'renderBytes')::bigint + octet_length(v_row->>'name')));
        v_catalog := jsonb_set(v_catalog,array['categories',v_category::text],v_row);
        select c into strict v_row from jsonb_array_elements(p_package->'values') c where c->>'id' = v_id::text and c->>'category_id' = v_category::text;
        if not found then raise exception 'Submitted dependency unavailable' using errcode = '42501'; end if;
        if v_row->>'name' ~ '[[:cntrl:]]' then raise exception 'Unsupported submitted condition name' using errcode = '23514'; end if;
        v_catalog := jsonb_set(v_catalog,'{renderBytes}',to_jsonb((v_catalog->>'renderBytes')::bigint + octet_length(v_row->>'name')));
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
        select v into strict v_row from jsonb_array_elements(p_package->'variables') v where v->>'id' = v_id::text and v->>'project_id' = p_project::text;
        if not found then raise exception 'Submitted dependency unavailable' using errcode = '42501'; end if;
        if v_row->>'value_type' <> 'text' or jsonb_typeof(v_row->'value') <> 'string'
          or ((v_row->>'required')::boolean and btrim(v_row->>'value',chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32) || chr(160) || chr(5760) || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279)) = '')
          or char_length(v_row->>'value') > 50000 or char_length(v_row->>'description') > 2000
          or v_row->>'name' ~ '[[:cntrl:]]'
          or jsonb_typeof(v_row->'output_values') <> 'object'
          or exists(select 1 from jsonb_each(v_row->'output_values') x where x.key not in ('web-help','pdf-manual','word-review') or jsonb_typeof(x.value) <> 'string' or char_length(x.value #>> '{}') > 50000) then
          raise exception 'Unsupported submitted variable' using errcode = '23514'; end if;
        v_catalog := jsonb_set(v_catalog,'{renderBytes}',to_jsonb((v_catalog->>'renderBytes')::bigint + octet_length(v_row->>'value')));
        v_catalog := jsonb_set(v_catalog,array['variables',v_id::text],v_row);
      else
        if v_id = any(p_trail) or cardinality(p_trail) >= 8 then
          raise exception 'Submitted reusable cycle or depth limit' using errcode = '23514'; end if;
        select r->'item', r->'draft' into strict v_row,v_draft
          from jsonb_array_elements(p_package->'reusable') r where r->'item'->>'id' = v_id::text
          and r->'item'->>'workspace_id' = p_workspace::text
          and ((r->'item'->>'scope' = 'project' and r->'item'->>'project_id' = p_project::text)
            or (r->'item'->>'scope' = 'workspace' and r->'item'->'project_id' = 'null'::jsonb));
        if v_draft->>'reusable_content_id' is distinct from v_id::text
          or coalesce((v_draft->>'revision')::bigint,0) < 1 then
          raise exception 'Frozen reusable invalid' using errcode = '23514'; end if;
        v_catalog := jsonb_set(v_catalog,'{renderBytes}',to_jsonb((v_catalog->>'renderBytes')::bigint + octet_length(v_row->>'name')));
        v_catalog := jsonb_set(v_catalog,array['reusable',v_id::text],jsonb_build_object('item',v_row,'draft',v_draft));
        if (select count(*) from jsonb_object_keys(v_catalog->'reusable')) > 256 then
          raise exception 'Submitted dependency limit' using errcode = '23514'; end if;
        v_catalog := app_private.release_dependency_walk(v_draft->'content',p_project,p_workspace,array_append(p_trail,v_id),v_catalog,p_package);
      end if;
    end if;
    if (v_catalog->>'renderBytes')::bigint > 33554432 then raise exception 'Release render limit' using errcode = '23514'; end if;
  end loop;
  return v_catalog;
end $$;
-- Canonical spextar-json-v1: UTF-16 key order, UTF-8, safe integers, no normalization.
create function app_private.release_utf16_key(p_text text) returns text
language plpgsql immutable strict set search_path = '' as $$
declare v text := ''; c integer; i integer;
begin
  for i in 1..char_length(p_text) loop
    c := ascii(substr(p_text,i,1));
    if c > 65535 then
      c := c - 65536;
      v := v || lpad(to_hex(55296 + (c / 1024)),4,'0') || lpad(to_hex(56320 + (c % 1024)),4,'0');
    else v := v || lpad(to_hex(c),4,'0'); end if;
  end loop;
  return v;
end $$;
create function app_private.release_canonical_json(p_value jsonb) returns text
language plpgsql immutable strict set search_path = '' as $$
declare v_result text;
begin
  perform app_private.check_review_json(p_value);
  case jsonb_typeof(p_value)
    when 'object' then
      select '{' || coalesce(string_agg(to_jsonb(key)::text || ':' || app_private.release_canonical_json(value),',' order by app_private.release_utf16_key(key) collate "C"),'') || '}' into v_result from jsonb_each(p_value);
    when 'array' then
      select '[' || coalesce(string_agg(app_private.release_canonical_json(value),',' order by ord),'') || ']' into v_result from jsonb_array_elements(p_value) with ordinality a(value,ord);
    when 'number' then v_result := trunc((p_value #>> '{}')::numeric)::text;
    else v_result := p_value::text;
  end case;
  return v_result;
end $$;

-- Locale-independent UTC timestamp bytes inside canonical evidence.
create function app_private.release_timestamp(p_time timestamptz) returns text
language sql immutable strict set search_path = '' as $$
  select to_char(p_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'); $$;
create function app_private.validate_release_package(p_review public.document_reviews) returns jsonb
language plpgsql stable set search_path = '' as $$
declare p jsonb := p_review.dependency_package; c jsonb; t jsonb; k text; a jsonb;
begin
  if p_review.status <> 'approved' or p_review.decided_by is null or p_review.decided_at is null
    or p is null or p->'schemaVersion' is distinct from '1'::jsonb or p->'resolverVersion' is distinct from '1'::jsonb
    or p->>'canonicalization' is distinct from 'spextar-json-v1'
    or p->>'projectId' is distinct from p_review.project_id::text
    or p->'outputContext' is distinct from '{"variableValues":"default","conditions":"neutral","outputId":null}'::jsonb then
    raise exception 'Approved package unavailable' using errcode = '23514'; end if;
  if jsonb_array_length(p_review.topics_snapshot) > 4096
    or octet_length(p_review.topics_snapshot::text)+octet_length(p_review.document_snapshot::text)+octet_length(p::text) > 33554432 then
    raise exception 'Release source limit' using errcode = '23514'; end if;
  if jsonb_typeof(p_review.document_snapshot->'title') is distinct from 'string'
    or jsonb_typeof(p_review.document_snapshot->'slug') is distinct from 'string'
    or jsonb_typeof(p_review.document_snapshot->'description') not in ('null','string')
    or jsonb_typeof(p_review.document_snapshot->'settings') is distinct from 'object' then
    raise exception 'Frozen document invalid' using errcode = '23514'; end if;
  -- Validate the frozen outline only; no mutable topics participate.
  if (select count(*) <> count(distinct value->>'id') from jsonb_array_elements(p_review.topics_snapshot))
    or exists(select 1 from jsonb_array_elements(p_review.topics_snapshot) outline
      where outline->>'id' is null or (outline->>'parent_topic_id' is not null and not exists(
        select 1 from jsonb_array_elements(p_review.topics_snapshot) parent where parent->>'id' = outline->>'parent_topic_id'))) then
    raise exception 'Frozen outline invalid' using errcode = '23514'; end if;
  -- With unique single-parent nodes, reachability from roots visits each node
  -- once. An unreachable component proves a cycle; do not materialize every path.
  if (with recursive reachable(id) as (
    select outline->>'id' from jsonb_array_elements(p_review.topics_snapshot) outline where outline->>'parent_topic_id' is null
    union all select child->>'id' from reachable join jsonb_array_elements(p_review.topics_snapshot) child on child->>'parent_topic_id'=reachable.id
  ) select count(*) from reachable) <> jsonb_array_length(p_review.topics_snapshot) then
    raise exception 'Frozen outline cycle' using errcode = '23514'; end if;
  c := '{"variables":{},"categories":{},"values":{},"reusable":{},"visits":0,"bodies":0,"renderBytes":0}'::jsonb;
  for t in select value from jsonb_array_elements(p_review.topics_snapshot) loop
    if jsonb_typeof(t->'title') is distinct from 'string' or jsonb_typeof(t->'slug') is distinct from 'string'
      or jsonb_typeof(t->'settings') is distinct from 'object' or jsonb_typeof(t->'sort_order') is distinct from 'number'
      or (t->>'sort_order')::numeric not between 0 and 2147483647 then
      raise exception 'Frozen topic invalid' using errcode = '23514'; end if;
    if t->'content' is null or t->'content' = 'null'::jsonb or coalesce((t->>'revision')::bigint,0) < 1 then
      raise exception 'Saved approved body required' using errcode = '23514'; end if;
    c := app_private.release_dependency_walk(t->'content',p_review.project_id,(p->>'workspaceId')::uuid,array[]::uuid[],c,p);
  end loop;
  foreach k in array array['variables','categories','values','reusable'] loop
    select coalesce(jsonb_agg(value order by key collate "C"),'[]'::jsonb) into a from jsonb_each(c->k);
    if a is distinct from p->k then raise exception 'Frozen closure invalid' using errcode = '23514'; end if;
  end loop;
  a := jsonb_build_object('schemaVersion',1,'rendererVersion',1,'reviewId',p_review.id,
    'projectId',p_review.project_id,'documentId',p_review.document_id,
    'submittedBy',p_review.submitted_by,'submittedAt',app_private.release_timestamp(p_review.submitted_at),
    'approvedBy',p_review.decided_by,'approvedAt',app_private.release_timestamp(p_review.decided_at),
    'document',p_review.document_snapshot,'topics',p_review.topics_snapshot,'dependencies',p);
  perform app_private.check_review_json(a);
  if octet_length(a::text) > 33554432 then raise exception 'Release package too large' using errcode = '23514'; end if;
  return a;
end $$;

create table public.document_releases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  review_id uuid not null references public.document_reviews(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  state text not null default 'published' check (state = 'published'),
  package_schema_version integer not null check (package_schema_version = 1),
  resolver_version integer not null check (resolver_version = 1),
  renderer_version integer not null check (renderer_version = 1),
  canonicalization text not null check (canonicalization = 'spextar-json-v1'),
  frozen_source jsonb not null,
  package_digest text not null check (package_digest ~ '^[a-f0-9]{64}$'),
  manifest_digest text not null check (manifest_digest ~ '^[a-f0-9]{64}$'),
  published_by uuid not null references auth.users(id) on delete restrict,
  published_at timestamptz not null default now(),
  request_key uuid not null,
  audit jsonb not null,
  unique(document_id,sequence), unique(document_id,review_id), unique(project_id,request_key)
);
create index document_releases_review on public.document_releases(review_id);
create index document_releases_publisher on public.document_releases(published_by);
alter table public.document_releases enable row level security;
revoke all on public.document_releases from public,anon,authenticated;
grant select on public.document_releases to authenticated;
create policy document_releases_read on public.document_releases for select to authenticated
using (app_private.is_project_member(project_id));
create function app_private.guard_release_evidence() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'Release evidence is immutable' using errcode = '42501'; end $$;
create trigger document_releases_immutable before update or delete on public.document_releases
for each row execute function app_private.guard_release_evidence();

-- Same membership -> document lock order as Review. Definer is necessary because
-- authenticated users have no release writes or permission to change lifecycle.
create function app_private.publish_document_release(
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
      raise exception 'Request changed' using errcode = '40001'; end if;
    return v.id;
  end if;
  if d.status <> 'approved' or d.updated_at is distinct from p_expected_updated_at then
    raise exception 'Approved document changed' using errcode = '40001'; end if;
  select * into r from public.document_reviews where id = p_review_id and document_id = p_document_id and project_id = p_project_id for update;
  if not found or r.status <> 'approved' or r.sequence <> (select max(sequence) from public.document_reviews where document_id = p_document_id) then
    raise exception 'Latest approval required' using errcode = '40001'; end if;
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
alter function app_private.publish_document_release(uuid,uuid,uuid,timestamptz,uuid) owner to postgres;
revoke all on function app_private.publish_document_release(uuid,uuid,uuid,timestamptz,uuid) from public,anon;
grant execute on function app_private.publish_document_release(uuid,uuid,uuid,timestamptz,uuid) to authenticated;
create function public.publish_document_release(p_project_id uuid,p_document_id uuid,p_review_id uuid,p_expected_updated_at timestamptz,p_request_key uuid)
returns uuid language sql security invoker set search_path = '' as $$
 select app_private.publish_document_release(p_project_id,p_document_id,p_review_id,p_expected_updated_at,p_request_key); $$;
revoke all on function public.publish_document_release(uuid,uuid,uuid,timestamptz,uuid) from public,anon;
grant execute on function public.publish_document_release(uuid,uuid,uuid,timestamptz,uuid) to authenticated;
revoke all on function app_private.release_dependency_walk(jsonb,uuid,uuid,uuid[],jsonb,jsonb),
  app_private.release_utf16_key(text),app_private.release_canonical_json(jsonb),app_private.release_timestamp(timestamptz),
  app_private.validate_release_package(public.document_reviews),app_private.guard_release_evidence() from public,anon,authenticated;

-- A new Draft after publication retains every release; lock order is unchanged.
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
    if v_doc.status not in ('approved','published') or v_doc.updated_at is distinct from p_expected_updated_at or v_review.status <> 'approved'
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
