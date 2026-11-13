-- 0002_rls.sql — Row Level Security berbasis role + cabang.
-- Prinsip: login saja TIDAK memberi akses. Data cabang hanya terlihat bila ada di user_branch_access (atau super_admin).
-- Mutasi kritis (stok, penjualan, transfer) hanya lewat fungsi RPC di 0003.

create function auth_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;

create function is_super() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' from profiles where id = auth.uid() and active), false)
$$;

create function can_access_branch(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select b is not null and (
    is_super() or exists (
      select 1 from user_branch_access a join profiles p on p.id = a.user_id
      where a.user_id = auth.uid() and a.branch_id = b and p.active))
$$;

create function has_role(roles app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() = any(roles), false)
$$;

create function shares_branch(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select uid = auth.uid() or is_super() or exists (
    select 1 from user_branch_access a1 join user_branch_access a2 on a1.branch_id = a2.branch_id
    where a1.user_id = auth.uid() and a2.user_id = uid)
$$;

create function ops_role() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() <> 'hr', false)   -- hr: belum punya modul operasional, tidak boleh membaca data toko
$$;

alter table branches enable row level security;
alter table profiles enable row level security;
alter table user_branch_access enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table inventory_units enable row level security;
alter table inventory_balances enable row level security;
alter table customers enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table payments enable row level security;
alter table returns enable row level security;
alter table stock_movements enable row level security;
alter table stock_transfers enable row level security;
alter table stock_transfer_items enable row level security;
alter table warranties enable row level security;
alter table service_tickets enable row level security;
alter table service_ticket_history enable row level security;
alter table unit_inspections enable row level security;
alter table audit_logs enable row level security;
alter table app_settings enable row level security;
alter table doc_counters enable row level security;   -- tanpa policy: hanya fungsi security definer

-- ===== SELECT =====
create policy branches_sel on branches for select to authenticated using (can_access_branch(id));
create policy profiles_sel on profiles for select to authenticated using (shares_branch(id));
create policy uba_sel on user_branch_access for select to authenticated using (user_id = auth.uid() or is_super());
create policy categories_sel on categories for select to authenticated using (auth_role() is not null);
create policy products_sel on products for select to authenticated using (auth_role() is not null);
create policy units_sel on inventory_units for select to authenticated using (can_access_branch(branch_id) and ops_role());
create policy balances_sel on inventory_balances for select to authenticated using (can_access_branch(branch_id) and ops_role());
create policy customers_sel on customers for select to authenticated using (can_access_branch(branch_id) and ops_role());
create policy sales_sel on sales for select to authenticated
  using (can_access_branch(branch_id) and has_role(array['super_admin','branch_admin','sales','finance','service_staff']::app_role[]));
create policy sale_items_sel on sale_items for select to authenticated
  using (exists (select 1 from sales s where s.id = sale_id));      -- mewarisi RLS sales
create policy payments_sel on payments for select to authenticated
  using (exists (select 1 from sales s where s.id = sale_id));
create policy returns_sel on returns for select to authenticated
  using (exists (select 1 from sales s where s.id = sale_id));
create policy movements_sel on stock_movements for select to authenticated using (can_access_branch(branch_id) and ops_role());
create policy transfers_sel on stock_transfers for select to authenticated
  using (can_access_branch(from_branch_id) or can_access_branch(to_branch_id));
create policy transfer_items_sel on stock_transfer_items for select to authenticated
  using (exists (select 1 from stock_transfers t where t.id = transfer_id));
create policy warranties_sel on warranties for select to authenticated
  using (exists (select 1 from inventory_units u where u.id = unit_id));
create policy tickets_sel on service_tickets for select to authenticated using (can_access_branch(branch_id) and ops_role());
create policy ticket_hist_sel on service_ticket_history for select to authenticated
  using (exists (select 1 from service_tickets t where t.id = ticket_id));
create policy inspections_sel on unit_inspections for select to authenticated
  using (exists (select 1 from inventory_units u where u.id = unit_id));
create policy audit_sel on audit_logs for select to authenticated
  using (is_super() or (has_role(array['branch_admin']::app_role[]) and can_access_branch(branch_id)));
create policy settings_sel on app_settings for select to authenticated using (auth_role() is not null);

-- ===== Tulis langsung (hanya data non-kritis) =====
create policy categories_w on categories for all to authenticated
  using (has_role(array['super_admin','branch_admin','inventory_staff']::app_role[]))
  with check (has_role(array['super_admin','branch_admin','inventory_staff']::app_role[]));
create policy products_w on products for all to authenticated
  using (has_role(array['super_admin','branch_admin','inventory_staff']::app_role[]))
  with check (has_role(array['super_admin','branch_admin','inventory_staff']::app_role[]));
create policy customers_w on customers for all to authenticated
  using (can_access_branch(branch_id) and has_role(array['super_admin','branch_admin','sales','service_staff']::app_role[]))
  with check (can_access_branch(branch_id) and has_role(array['super_admin','branch_admin','sales','service_staff']::app_role[]));
create policy inspections_w on unit_inspections for insert to authenticated
  with check (has_role(array['super_admin','branch_admin','inventory_staff','service_staff']::app_role[])
              and exists (select 1 from inventory_units u where u.id = unit_id));
create policy settings_w on app_settings for all to authenticated using (is_super()) with check (is_super());
create policy branches_w on branches for update to authenticated using (is_super()) with check (is_super());
create policy profiles_w on profiles for update to authenticated using (is_super()) with check (is_super());
create policy uba_w on user_branch_access for all to authenticated using (is_super()) with check (is_super());

-- Tidak ada policy INSERT/UPDATE/DELETE untuk: inventory_units, inventory_balances, sales, sale_items,
-- payments, returns, stock_movements, stock_transfers(+items), warranties, service_tickets(+history),
-- audit_logs. Semua perubahan lewat RPC (security definer) dengan pemeriksaan role & cabang.
