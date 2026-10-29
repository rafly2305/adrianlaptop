-- 0004_audit_triggers.sql — audit perubahan data master & pengaturan (yang ditulis langsung, bukan lewat RPC).
create function audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_branch uuid; v_id uuid;
begin
  if tg_op = 'DELETE' then v_id := (to_jsonb(old) ->> 'id')::uuid; else v_id := (to_jsonb(new) ->> 'id')::uuid; end if;
  v_branch := case when tg_table_name = 'branches' then v_id else null end;
  insert into audit_logs(actor_id, branch_id, action, entity, entity_id, detail)
  values (auth.uid(), v_branch, lower(tg_op), tg_table_name, v_id,
          case when tg_op = 'UPDATE' then jsonb_build_object('before', to_jsonb(old) - 'specs', 'after', to_jsonb(new) - 'specs')
               when tg_op = 'INSERT' then jsonb_build_object('after', to_jsonb(new) - 'specs') else jsonb_build_object('before', to_jsonb(old) - 'specs') end);
  return coalesce(new, old);
end $$;

-- Hanya jika dipicu oleh pengguna login (seed/migrasi tanpa auth.uid() tidak diaudit agar seed tetap ringan).
create function audit_when_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  return audit_row_change();
end $$;

create trigger trg_audit_products after insert or update on products for each row execute function audit_when_user();
create trigger trg_audit_profiles after update on profiles for each row execute function audit_when_user();
create trigger trg_audit_branches after update on branches for each row execute function audit_when_user();
create trigger trg_audit_settings after insert or update on app_settings for each row execute function audit_when_user();
create trigger trg_audit_uba after insert or delete on user_branch_access for each row execute function audit_when_user();

revoke execute on function audit_row_change(), audit_when_user() from public, anon, authenticated;
