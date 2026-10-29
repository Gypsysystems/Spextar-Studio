alter default privileges for role postgres
  revoke execute on functions from public;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

revoke execute on function app_private.prepare_topic_draft_write() from public, anon, authenticated;
revoke execute on function app_private.touch_topic_draft_parents() from public, anon, authenticated;