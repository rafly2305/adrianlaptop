-- 0003_functions.sql — Operasi kritis sebagai fungsi transaksional (satu panggilan = satu transaksi).
-- Semua fungsi: security definer + pemeriksaan role/cabang di dalam fungsi + row lock (FOR UPDATE).
-- Pesan exception berupa kode (mis. 'unit_unavailable') yang diterjemahkan oleh aplikasi.

-- ============ Helper internal ============
create function assert_access(p_branch uuid, p_roles app_role[]) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if auth_role() is null or not (auth_role() = any (p_roles)) then raise exception 'forbidden_role' using errcode = '42501'; end if;
  if not can_access_branch(p_branch) then raise exception 'forbidden_branch' using errcode = '42501'; end if;
end $$;

create function log_audit(p_branch uuid, p_action text, p_entity text, p_id uuid, p_detail jsonb) returns void
language sql security definer set search_path = public as $$
  insert into audit_logs(actor_id, branch_id, action, entity, entity_id, detail)
  values (auth.uid(), p_branch, p_action, p_entity, p_id, coalesce(p_detail, '{}'::jsonb))
$$;

create function next_number(p_key text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  insert into doc_counters(key, n) values (p_key, 1)
  on conflict (key) do update set n = doc_counters.n + 1
  returning n into v;
  return v;
end $$;

create function today_wib() returns date
language sql stable as $$ select (now() at time zone 'Asia/Jakarta')::date $$;

create function unit_warranty_state(p_unit uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare w warranties%rowtype;
begin
  select * into w from warranties where unit_id = p_unit and not voided order by end_date desc limit 1;
  if not found or not w.verified then return 'belum_diverifikasi'; end if;
  if w.end_date < today_wib() then return 'berakhir'; end if;
  return 'aktif';
end $$;

-- ============ Penerimaan & penyesuaian stok ============
create function receive_unit(p_product uuid, p_branch uuid, p_serial text, p_condition unit_condition,
                             p_received date, p_cost numeric, p_notes text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_b branches%rowtype; v_p products%rowtype; v_serial text; v_id uuid; v_code text;
begin
  perform assert_access(p_branch, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  select * into v_b from branches where id = p_branch and active;
  if not found then raise exception 'branch_not_found'; end if;
  select * into v_p from products where id = p_product and not archived;
  if not found then raise exception 'product_not_found'; end if;
  if v_p.tracking <> 'serialized' then raise exception 'product_not_serialized'; end if;
  v_serial := nullif(upper(btrim(coalesce(p_serial, ''))), '');
  if v_serial is not null and exists (select 1 from inventory_units where upper(serial_number) = v_serial) then
    raise exception 'serial_duplicate';
  end if;
  v_code := 'UNIT-' || v_b.code || '-' || lpad(next_number('UNIT-' || v_b.code)::text, 6, '0');
  begin
    insert into inventory_units(product_id, branch_id, internal_asset_code, serial_number, serial_status, condition,
                                received_at, cost_price, notes, data_origin)
    values (p_product, p_branch, v_code, v_serial,
            case when v_serial is null then 'belum_ada' else 'belum_diverifikasi' end::serial_status,
            coalesce(p_condition, 'belum_diperiksa'), coalesce(p_received, today_wib()), p_cost, p_notes, v_b.data_origin)
    returning id into v_id;
  exception when unique_violation then raise exception 'serial_duplicate';
  end;
  insert into stock_movements(branch_id, product_id, unit_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
  values (p_branch, p_product, v_id, 'receive', 1, 'unit', v_id, 'Penerimaan barang', auth.uid(), v_b.data_origin);
  perform log_audit(p_branch, 'unit.receive', 'inventory_units', v_id, jsonb_build_object('code', v_code, 'serial', v_serial));
  return v_id;
end $$;

create function receive_quantity(p_product uuid, p_branch uuid, p_qty int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_b branches%rowtype; v_p products%rowtype;
begin
  perform assert_access(p_branch, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  if p_qty is null or p_qty <= 0 then raise exception 'invalid_qty'; end if;
  select * into v_b from branches where id = p_branch and active;
  if not found then raise exception 'branch_not_found'; end if;
  select * into v_p from products where id = p_product and not archived;
  if not found then raise exception 'product_not_found'; end if;
  if v_p.tracking <> 'quantity' then raise exception 'product_not_quantity'; end if;
  insert into inventory_balances(product_id, branch_id, qty) values (p_product, p_branch, p_qty)
  on conflict (product_id, branch_id) do update set qty = inventory_balances.qty + excluded.qty;
  insert into stock_movements(branch_id, product_id, type, qty, reason, actor_id, data_origin)
  values (p_branch, p_product, 'receive', p_qty, coalesce(nullif(btrim(p_reason), ''), 'Penerimaan barang'), auth.uid(), v_b.data_origin);
  perform log_audit(p_branch, 'qty.receive', 'products', p_product, jsonb_build_object('qty', p_qty));
end $$;

create function adjust_stock(p_product uuid, p_branch uuid, p_delta int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_b branches%rowtype; v_p products%rowtype; v_cur int;
begin
  perform assert_access(p_branch, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  if p_delta is null or p_delta = 0 then raise exception 'invalid_qty'; end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then raise exception 'reason_required'; end if;
  select * into v_b from branches where id = p_branch;
  select * into v_p from products where id = p_product;
  if not found then raise exception 'product_not_found'; end if;
  if v_p.tracking <> 'quantity' then raise exception 'product_not_quantity'; end if;
  insert into inventory_balances(product_id, branch_id, qty) values (p_product, p_branch, 0) on conflict do nothing;
  select qty into v_cur from inventory_balances where product_id = p_product and branch_id = p_branch for update;
  if v_cur + p_delta < 0 then raise exception 'negative_stock'; end if;
  update inventory_balances set qty = v_cur + p_delta where product_id = p_product and branch_id = p_branch;
  insert into stock_movements(branch_id, product_id, type, qty, reason, actor_id, data_origin)
  values (p_branch, p_product, 'adjust', p_delta, btrim(p_reason), auth.uid(), v_b.data_origin);
  perform log_audit(p_branch, 'stock.adjust', 'products', p_product, jsonb_build_object('delta', p_delta, 'from', v_cur, 'reason', p_reason));
end $$;

create function set_unit_status(p_unit uuid, p_status unit_status, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_u inventory_units%rowtype;
begin
  select * into v_u from inventory_units where id = p_unit for update;
  if not found then raise exception 'unit_not_found'; end if;
  perform assert_access(v_u.branch_id, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  if p_reason is null or length(btrim(p_reason)) < 3 then raise exception 'reason_required'; end if;
  if p_status in ('sold', 'in_transit') then raise exception 'status_via_workflow'; end if;
  if v_u.status in ('sold', 'in_transit') then raise exception 'status_via_workflow'; end if;
  update inventory_units set status = p_status, archived = (p_status = 'archived') where id = p_unit;
  insert into stock_movements(branch_id, product_id, unit_id, type, qty, reason, actor_id, data_origin)
  values (v_u.branch_id, v_u.product_id, p_unit, 'adjust', 0, v_u.status::text || ' -> ' || p_status::text || ': ' || btrim(p_reason), auth.uid(), v_u.data_origin);
  perform log_audit(v_u.branch_id, 'unit.status', 'inventory_units', p_unit, jsonb_build_object('from', v_u.status, 'to', p_status, 'reason', p_reason));
end $$;

create function update_unit_details(p_unit uuid, p_condition unit_condition, p_cost numeric,
  p_store_warranty_months int, p_mfr_until date, p_notes text, p_inspection_notes text) returns void
language plpgsql security definer set search_path = public as $$
declare v_u inventory_units%rowtype;
begin
  select * into v_u from inventory_units where id = p_unit for update;
  if not found then raise exception 'unit_not_found'; end if;
  perform assert_access(v_u.branch_id, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  update inventory_units set condition = coalesce(p_condition, condition), cost_price = p_cost,
    store_warranty_months = p_store_warranty_months, mfr_warranty_until = p_mfr_until,
    notes = p_notes, inspection_notes = p_inspection_notes where id = p_unit;
  perform log_audit(v_u.branch_id, 'unit.update', 'inventory_units', p_unit, '{}'::jsonb);
end $$;

create function set_unit_serial(p_unit uuid, p_serial text, p_verified boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_u inventory_units%rowtype; v_serial text;
begin
  select * into v_u from inventory_units where id = p_unit for update;
  if not found then raise exception 'unit_not_found'; end if;
  perform assert_access(v_u.branch_id, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  if v_u.serial_status = 'sintetis_demo' then raise exception 'serial_demo_locked'; end if;
  v_serial := nullif(upper(btrim(coalesce(p_serial, ''))), '');
  if v_serial is not null and exists (select 1 from inventory_units where upper(serial_number) = v_serial and id <> p_unit) then
    raise exception 'serial_duplicate';
  end if;
  begin
    update inventory_units set serial_number = v_serial,
      serial_status = case when v_serial is null then 'belum_ada'
                           when coalesce(p_verified, false) then 'terverifikasi' else 'belum_diverifikasi' end::serial_status
    where id = p_unit;
  exception when unique_violation then raise exception 'serial_duplicate';
  end;
  perform log_audit(v_u.branch_id, 'unit.serial', 'inventory_units', p_unit,
    jsonb_build_object('old', v_u.serial_number, 'new', v_serial, 'verified', coalesce(p_verified, false)));
end $$;

-- ============ Penjualan ============
create function create_sale(p_branch uuid, p_customer jsonb, p_items jsonb, p_method text, p_paid numeric, p_notes text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_b branches%rowtype; v_role app_role := auth_role();
  v_sale uuid; v_cust uuid; v_item jsonb; v_p products%rowtype; v_u inventory_units%rowtype;
  v_qty int; v_price numeric; v_disc numeric; v_line numeric;
  v_sub numeric := 0; v_dsc numeric := 0; v_total numeric; v_paid numeric;
  v_maxpct numeric; v_methods jsonb; v_bal int; v_months int; v_defm int; v_inv text; v_day text;
  v_phone text;
begin
  perform assert_access(p_branch, array['super_admin','branch_admin','sales']::app_role[]);
  select * into v_b from branches where id = p_branch and active;
  if not found then raise exception 'branch_not_found'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'empty_cart'; end if;

  select coalesce((value #>> '{}')::numeric, 0) into v_maxpct from app_settings where key = 'max_discount_percent';
  v_maxpct := coalesce(v_maxpct, 0);
  select value into v_methods from app_settings where key = 'payment_methods';
  if p_method is not null and v_methods is not null and jsonb_typeof(v_methods) = 'array' and not (v_methods ? p_method) then
    raise exception 'invalid_payment_method';
  end if;
  if coalesce(p_paid, 1) > 0 and p_method is null then raise exception 'payment_method_required'; end if;

  v_day := to_char(now() at time zone 'Asia/Jakarta', 'YYMMDD');
  v_inv := 'INV-' || v_day || '-' || v_b.code || '-' || lpad(next_number('INV-' || v_b.code || '-' || v_day)::text, 4, '0');

  if nullif(btrim(coalesce(p_customer ->> 'name', '')), '') is not null then
    v_phone := nullif(btrim(coalesce(p_customer ->> 'phone', '')), '');
    if v_phone is not null then
      select id into v_cust from customers where branch_id = p_branch and phone = v_phone limit 1;
    end if;
    if v_cust is null then
      insert into customers(branch_id, name, phone, address, data_origin)
      values (p_branch, btrim(p_customer ->> 'name'), v_phone, nullif(btrim(coalesce(p_customer ->> 'address', '')), ''), v_b.data_origin)
      returning id into v_cust;
    end if;
  end if;

  insert into sales(invoice_no, branch_id, customer_id, cashier_id, payment_method, notes, data_origin)
  values (v_inv, p_branch, v_cust, auth.uid(), p_method, nullif(btrim(coalesce(p_notes, '')), ''), v_b.data_origin)
  returning id into v_sale;

  select (value #>> '{}')::int into v_defm from app_settings where key = 'store_warranty_months';

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_p from products where id = (v_item ->> 'product_id')::uuid and not archived;
    if not found then raise exception 'product_not_found'; end if;
    v_qty := coalesce((v_item ->> 'qty')::int, 1);
    v_price := (v_item ->> 'unit_price')::numeric;
    v_disc := coalesce((v_item ->> 'discount')::numeric, 0);
    if v_qty <= 0 or v_price is null or v_price < 0 or v_disc < 0 or v_disc > v_price * v_qty then raise exception 'invalid_item'; end if;
    if v_role not in ('super_admin', 'branch_admin') and v_disc > v_price * v_qty * v_maxpct / 100 then
      raise exception 'discount_over_limit';
    end if;
    v_line := v_price * v_qty - v_disc;

    if v_p.tracking = 'serialized' then
      if v_qty <> 1 then raise exception 'serialized_qty_must_be_1'; end if;
      select * into v_u from inventory_units where id = (v_item ->> 'unit_id')::uuid and product_id = v_p.id for update;
      if not found or v_u.branch_id <> p_branch or v_u.status <> 'available' or v_u.archived then
        raise exception 'unit_unavailable';
      end if;
      update inventory_units set status = 'sold' where id = v_u.id;
      insert into sale_items(sale_id, product_id, unit_id, qty, unit_price, discount, line_total)
      values (v_sale, v_p.id, v_u.id, 1, v_price, v_disc, v_line);
      insert into stock_movements(branch_id, product_id, unit_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (p_branch, v_p.id, v_u.id, 'sale', -1, 'sale', v_sale, v_inv, auth.uid(), v_b.data_origin);
      v_months := coalesce(v_u.store_warranty_months, v_defm);
      if v_months is not null and v_months > 0 then
        insert into warranties(unit_id, sale_id, kind, start_date, end_date, verified, data_origin)
        values (v_u.id, v_sale, 'toko', today_wib(), (today_wib() + make_interval(months => v_months))::date,
                v_u.store_warranty_months is not null, v_b.data_origin);
      end if;
    else
      select qty into v_bal from inventory_balances where product_id = v_p.id and branch_id = p_branch for update;
      if v_bal is null or v_bal < v_qty then raise exception 'insufficient_stock'; end if;
      update inventory_balances set qty = qty - v_qty where product_id = v_p.id and branch_id = p_branch;
      insert into sale_items(sale_id, product_id, qty, unit_price, discount, line_total)
      values (v_sale, v_p.id, v_qty, v_price, v_disc, v_line);
      insert into stock_movements(branch_id, product_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (p_branch, v_p.id, 'sale', -v_qty, 'sale', v_sale, v_inv, auth.uid(), v_b.data_origin);
    end if;
    v_sub := v_sub + v_price * v_qty;
    v_dsc := v_dsc + v_disc;
  end loop;

  v_total := v_sub - v_dsc;
  v_paid := least(coalesce(p_paid, v_total), v_total);
  update sales set subtotal = v_sub, discount = v_dsc, total = v_total,
    payment_status = case when v_paid >= v_total then 'paid' when v_paid > 0 then 'partial' else 'unpaid' end::payment_status
  where id = v_sale;
  if v_paid > 0 then
    insert into payments(sale_id, method, amount, data_origin) values (v_sale, p_method, v_paid, v_b.data_origin);
  end if;
  perform log_audit(p_branch, 'sale.create', 'sales', v_sale, jsonb_build_object('invoice', v_inv, 'total', v_total));
  return v_sale;
end $$;

create function void_sale(p_sale uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_s sales%rowtype; v_it sale_items%rowtype;
begin
  select * into v_s from sales where id = p_sale for update;
  if not found then raise exception 'sale_not_found'; end if;
  perform assert_access(v_s.branch_id, array['super_admin','branch_admin']::app_role[]);
  if p_reason is null or length(btrim(p_reason)) < 3 then raise exception 'reason_required'; end if;
  if v_s.status <> 'completed' then raise exception 'sale_not_voidable'; end if;
  for v_it in select * from sale_items where sale_id = p_sale and active for update loop
    if v_it.unit_id is not null then
      update inventory_units set status = 'available' where id = v_it.unit_id and status = 'sold';
      insert into stock_movements(branch_id, product_id, unit_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (v_s.branch_id, v_it.product_id, v_it.unit_id, 'sale_void', 1, 'sale', p_sale, 'Void ' || v_s.invoice_no, auth.uid(), v_s.data_origin);
    else
      insert into inventory_balances(product_id, branch_id, qty) values (v_it.product_id, v_s.branch_id, v_it.qty)
      on conflict (product_id, branch_id) do update set qty = inventory_balances.qty + excluded.qty;
      insert into stock_movements(branch_id, product_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (v_s.branch_id, v_it.product_id, 'sale_void', v_it.qty, 'sale', p_sale, 'Void ' || v_s.invoice_no, auth.uid(), v_s.data_origin);
    end if;
    update sale_items set active = false where id = v_it.id;
  end loop;
  update warranties set voided = true where sale_id = p_sale;
  update sales set status = 'void', void_reason = btrim(p_reason) where id = p_sale;
  perform log_audit(v_s.branch_id, 'sale.void', 'sales', p_sale, jsonb_build_object('invoice', v_s.invoice_no, 'reason', p_reason));
end $$;

create function return_sale_item(p_item uuid, p_qty int, p_reason text, p_refund numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v_it sale_items%rowtype; v_s sales%rowtype; v_done int; v_refunded numeric; v_p products%rowtype;
begin
  select * into v_it from sale_items where id = p_item for update;
  if not found then raise exception 'item_not_found'; end if;
  select * into v_s from sales where id = v_it.sale_id for update;
  perform assert_access(v_s.branch_id, array['super_admin','branch_admin','sales']::app_role[]);
  if p_reason is null or length(btrim(p_reason)) < 3 then raise exception 'reason_required'; end if;
  if v_s.status in ('void', 'returned') or not v_it.active then raise exception 'item_not_returnable'; end if;
  select coalesce(sum(qty), 0), coalesce(sum(refund_amount), 0) into v_done, v_refunded from returns where sale_item_id = p_item;
  if p_qty is null or p_qty < 1 or p_qty > v_it.qty - v_done then raise exception 'invalid_return_qty'; end if;
  if p_refund is null or p_refund < 0 or v_refunded + p_refund > v_it.line_total then raise exception 'refund_exceeds'; end if;
  select * into v_p from products where id = v_it.product_id;
  if v_it.unit_id is not null then
    update inventory_units set status = 'returned' where id = v_it.unit_id and status = 'sold';
    update warranties set voided = true where unit_id = v_it.unit_id and sale_id = v_s.id;
    update sale_items set active = false where id = p_item;
    insert into stock_movements(branch_id, product_id, unit_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
    values (v_s.branch_id, v_it.product_id, v_it.unit_id, 'return', 1, 'sale', v_s.id, btrim(p_reason), auth.uid(), v_s.data_origin);
  else
    insert into inventory_balances(product_id, branch_id, qty) values (v_it.product_id, v_s.branch_id, p_qty)
    on conflict (product_id, branch_id) do update set qty = inventory_balances.qty + excluded.qty;
    if v_done + p_qty = v_it.qty then update sale_items set active = false where id = p_item; end if;
    insert into stock_movements(branch_id, product_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
    values (v_s.branch_id, v_it.product_id, 'return', p_qty, 'sale', v_s.id, btrim(p_reason), auth.uid(), v_s.data_origin);
  end if;
  insert into returns(sale_id, sale_item_id, unit_id, qty, reason, refund_amount, created_by, data_origin)
  values (v_s.id, p_item, v_it.unit_id, p_qty, btrim(p_reason), p_refund, auth.uid(), v_s.data_origin);
  update sales set status = case when exists (select 1 from sale_items where sale_id = v_s.id and active)
                                 then 'partially_returned' else 'returned' end::sale_status
  where id = v_s.id;
  perform log_audit(v_s.branch_id, 'sale.return', 'sales', v_s.id, jsonb_build_object('item', p_item, 'qty', p_qty, 'refund', p_refund, 'reason', p_reason));
end $$;

-- ============ Transfer antar-cabang ============
create function create_transfer(p_from uuid, p_to uuid, p_items jsonb, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_f branches%rowtype; v_t branches%rowtype; v_id uuid; v_num text; v_day text; v_item jsonb;
        v_p products%rowtype; v_u inventory_units%rowtype; v_qty int; v_bal int;
begin
  perform assert_access(p_from, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  select * into v_f from branches where id = p_from and active;
  select * into v_t from branches where id = p_to and active;
  if v_f.id is null or v_t.id is null or p_from = p_to then raise exception 'invalid_branches'; end if;
  if v_f.data_origin <> v_t.data_origin then raise exception 'cross_origin_transfer'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'empty_cart'; end if;
  v_day := to_char(now() at time zone 'Asia/Jakarta', 'YYMMDD');
  v_num := 'TRF-' || v_day || '-' || lpad(next_number('TRF-' || v_day)::text, 4, '0');
  insert into stock_transfers(number, from_branch_id, to_branch_id, note, created_by, data_origin)
  values (v_num, p_from, p_to, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), v_f.data_origin) returning id into v_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_p from products where id = (v_item ->> 'product_id')::uuid;
    if not found then raise exception 'product_not_found'; end if;
    if v_p.tracking = 'serialized' then
      select * into v_u from inventory_units where id = (v_item ->> 'unit_id')::uuid and product_id = v_p.id for update;
      if not found or v_u.branch_id <> p_from or v_u.status <> 'available' or v_u.archived then raise exception 'unit_unavailable'; end if;
      update inventory_units set status = 'in_transit' where id = v_u.id;
      insert into stock_transfer_items(transfer_id, product_id, unit_id, qty) values (v_id, v_p.id, v_u.id, 1);
      insert into stock_movements(branch_id, product_id, unit_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (p_from, v_p.id, v_u.id, 'transfer_out', -1, 'transfer', v_id, v_num, auth.uid(), v_f.data_origin);
    else
      v_qty := coalesce((v_item ->> 'qty')::int, 0);
      if v_qty <= 0 then raise exception 'invalid_qty'; end if;
      select qty into v_bal from inventory_balances where product_id = v_p.id and branch_id = p_from for update;
      if v_bal is null or v_bal < v_qty then raise exception 'insufficient_stock'; end if;
      update inventory_balances set qty = qty - v_qty where product_id = v_p.id and branch_id = p_from;
      insert into stock_transfer_items(transfer_id, product_id, qty) values (v_id, v_p.id, v_qty);
      insert into stock_movements(branch_id, product_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (p_from, v_p.id, 'transfer_out', -v_qty, 'transfer', v_id, v_num, auth.uid(), v_f.data_origin);
    end if;
  end loop;
  perform log_audit(p_from, 'transfer.create', 'stock_transfers', v_id, jsonb_build_object('number', v_num, 'to', p_to));
  return v_id;
end $$;

create function receive_transfer(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_t stock_transfers%rowtype; v_i stock_transfer_items%rowtype;
begin
  select * into v_t from stock_transfers where id = p_id for update;
  if not found then raise exception 'transfer_not_found'; end if;
  perform assert_access(v_t.to_branch_id, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  if v_t.status <> 'in_transit' then raise exception 'transfer_not_pending'; end if;
  for v_i in select * from stock_transfer_items where transfer_id = p_id loop
    if v_i.unit_id is not null then
      update inventory_units set branch_id = v_t.to_branch_id, status = 'available' where id = v_i.unit_id and status = 'in_transit';
      insert into stock_movements(branch_id, product_id, unit_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (v_t.to_branch_id, v_i.product_id, v_i.unit_id, 'transfer_in', 1, 'transfer', p_id, v_t.number, auth.uid(), v_t.data_origin);
    else
      insert into inventory_balances(product_id, branch_id, qty) values (v_i.product_id, v_t.to_branch_id, v_i.qty)
      on conflict (product_id, branch_id) do update set qty = inventory_balances.qty + excluded.qty;
      insert into stock_movements(branch_id, product_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (v_t.to_branch_id, v_i.product_id, 'transfer_in', v_i.qty, 'transfer', p_id, v_t.number, auth.uid(), v_t.data_origin);
    end if;
  end loop;
  update stock_transfers set status = 'received', received_by = auth.uid(), received_at = now() where id = p_id;
  perform log_audit(v_t.to_branch_id, 'transfer.receive', 'stock_transfers', p_id, jsonb_build_object('number', v_t.number));
end $$;

create function cancel_transfer(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_t stock_transfers%rowtype; v_i stock_transfer_items%rowtype;
begin
  select * into v_t from stock_transfers where id = p_id for update;
  if not found then raise exception 'transfer_not_found'; end if;
  perform assert_access(v_t.from_branch_id, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  if v_t.status <> 'in_transit' then raise exception 'transfer_not_pending'; end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then raise exception 'reason_required'; end if;
  for v_i in select * from stock_transfer_items where transfer_id = p_id loop
    if v_i.unit_id is not null then
      update inventory_units set status = 'available' where id = v_i.unit_id and status = 'in_transit';
      insert into stock_movements(branch_id, product_id, unit_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (v_t.from_branch_id, v_i.product_id, v_i.unit_id, 'transfer_cancel', 1, 'transfer', p_id, btrim(p_reason), auth.uid(), v_t.data_origin);
    else
      insert into inventory_balances(product_id, branch_id, qty) values (v_i.product_id, v_t.from_branch_id, v_i.qty)
      on conflict (product_id, branch_id) do update set qty = inventory_balances.qty + excluded.qty;
      insert into stock_movements(branch_id, product_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (v_t.from_branch_id, v_i.product_id, 'transfer_cancel', v_i.qty, 'transfer', p_id, btrim(p_reason), auth.uid(), v_t.data_origin);
    end if;
  end loop;
  update stock_transfers set status = 'cancelled', note = coalesce(note || ' | ', '') || 'Batal: ' || btrim(p_reason) where id = p_id;
  perform log_audit(v_t.from_branch_id, 'transfer.cancel', 'stock_transfers', p_id, jsonb_build_object('reason', p_reason));
end $$;

-- ============ Customer service ============
create function create_ticket(p_branch uuid, p_customer jsonb, p_unit uuid, p_sale uuid, p_category text,
                              p_desc text, p_eta date, p_assigned uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_b branches%rowtype; v_id uuid; v_cust uuid; v_day text; v_no text; v_state text; v_phone text; v_u inventory_units%rowtype;
begin
  perform assert_access(p_branch, array['super_admin','branch_admin','service_staff','sales']::app_role[]);
  select * into v_b from branches where id = p_branch and active;
  if not found then raise exception 'branch_not_found'; end if;
  if p_desc is null or length(btrim(p_desc)) < 3 or p_category is null or length(btrim(p_category)) < 2 then raise exception 'invalid_ticket'; end if;
  if p_unit is not null then
    select * into v_u from inventory_units where id = p_unit;
    if not found or not can_access_branch(v_u.branch_id) then raise exception 'unit_not_found'; end if;
    v_state := unit_warranty_state(p_unit);
  else
    v_state := 'tidak_ada';
  end if;
  if nullif(btrim(coalesce(p_customer ->> 'name', '')), '') is not null then
    v_phone := nullif(btrim(coalesce(p_customer ->> 'phone', '')), '');
    if v_phone is not null then select id into v_cust from customers where branch_id = p_branch and phone = v_phone limit 1; end if;
    if v_cust is null then
      insert into customers(branch_id, name, phone, address, data_origin)
      values (p_branch, btrim(p_customer ->> 'name'), v_phone, nullif(btrim(coalesce(p_customer ->> 'address', '')), ''), v_b.data_origin)
      returning id into v_cust;
    end if;
  end if;
  v_day := to_char(now() at time zone 'Asia/Jakarta', 'YYMMDD');
  v_no := 'TKT-' || v_day || '-' || v_b.code || '-' || lpad(next_number('TKT-' || v_b.code || '-' || v_day)::text, 4, '0');
  insert into service_tickets(ticket_no, branch_id, customer_id, unit_id, sale_id, category, description, assigned_to, received_at, eta,
                              warranty_state, created_by, data_origin)
  values (v_no, p_branch, v_cust, p_unit, p_sale, btrim(p_category), btrim(p_desc), p_assigned, today_wib(), p_eta, v_state, auth.uid(), v_b.data_origin)
  returning id into v_id;
  insert into service_ticket_history(ticket_id, kind, status, note, actor_id) values (v_id, 'status', 'baru', 'Tiket dibuat', auth.uid());
  perform log_audit(p_branch, 'ticket.create', 'service_tickets', v_id, jsonb_build_object('no', v_no));
  return v_id;
end $$;

create function update_ticket(p_ticket uuid, p_status ticket_status, p_note text, p_kind text, p_assigned uuid,
                              p_eta date, p_resolution text, p_tech_notes text) returns void
language plpgsql security definer set search_path = public as $$
declare v_t service_tickets%rowtype; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_t from service_tickets where id = p_ticket for update;
  if not found then raise exception 'ticket_not_found'; end if;
  perform assert_access(v_t.branch_id, array['super_admin','branch_admin','service_staff']::app_role[]);
  if p_status in ('selesai', 'ditolak') and (p_resolution is null or length(btrim(p_resolution)) < 3) and v_t.resolution is null then
    raise exception 'resolution_required';
  end if;
  update service_tickets set status = coalesce(p_status, status), assigned_to = coalesce(p_assigned, assigned_to),
    eta = coalesce(p_eta, eta), resolution = coalesce(nullif(btrim(coalesce(p_resolution, '')), ''), resolution),
    technician_notes = coalesce(nullif(btrim(coalesce(p_tech_notes, '')), ''), technician_notes) where id = p_ticket;
  if p_status is not null and p_status <> v_t.status then
    insert into service_ticket_history(ticket_id, kind, status, note, actor_id)
    values (p_ticket, 'status', p_status, coalesce(v_note, 'Status diubah'), auth.uid());
    perform log_audit(v_t.branch_id, 'ticket.status', 'service_tickets', p_ticket, jsonb_build_object('from', v_t.status, 'to', p_status));
  elsif v_note is not null then
    insert into service_ticket_history(ticket_id, kind, status, note, actor_id)
    values (p_ticket, coalesce(nullif(p_kind, ''), 'catatan'), null, v_note, auth.uid());
  end if;
end $$;

-- ============ Reset data demo (tidak menyentuh data 'real' / Cidodol) ============
create function _reset_demo() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from payments where data_origin = 'demo';
  delete from returns where data_origin = 'demo';
  delete from sale_items where sale_id in (select id from sales where data_origin = 'demo');
  delete from warranties where data_origin = 'demo';
  delete from service_ticket_history where ticket_id in (select id from service_tickets where data_origin = 'demo');
  delete from service_tickets where data_origin = 'demo';
  delete from sales where data_origin = 'demo';
  delete from unit_inspections where unit_id in (select id from inventory_units where data_origin = 'demo');
  delete from stock_transfer_items where transfer_id in (select id from stock_transfers where data_origin = 'demo');
  delete from stock_transfers where data_origin = 'demo';
  delete from stock_movements where data_origin = 'demo';
  delete from inventory_balances where branch_id in (select id from branches where data_origin = 'demo');
  delete from inventory_units where data_origin = 'demo';
  delete from customers where data_origin = 'demo';
  delete from audit_logs where branch_id in (select id from branches where data_origin = 'demo');
  delete from doc_counters where key ~ '-(CLD|MRY|PMG|CSK|BTR)(-|$)';
end $$;

create function reset_demo_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_super() then raise exception 'forbidden_role' using errcode = '42501'; end if;
  perform _reset_demo();
  perform log_audit(null, 'demo.reset', 'system', null, '{}'::jsonb);
end $$;

-- ============ Hak eksekusi ============
revoke execute on all functions in schema public from public, anon;
grant execute on function auth_role(), is_super(), can_access_branch(uuid), has_role(app_role[]), shares_branch(uuid), ops_role(),
  today_wib(), unit_warranty_state(uuid) to authenticated;
grant execute on function receive_unit(uuid, uuid, text, unit_condition, date, numeric, text),
  receive_quantity(uuid, uuid, int, text), adjust_stock(uuid, uuid, int, text), set_unit_status(uuid, unit_status, text),
  update_unit_details(uuid, unit_condition, numeric, int, date, text, text), set_unit_serial(uuid, text, boolean),
  create_sale(uuid, jsonb, jsonb, text, numeric, text), void_sale(uuid, text), return_sale_item(uuid, int, text, numeric),
  create_transfer(uuid, uuid, jsonb, text), receive_transfer(uuid), cancel_transfer(uuid, text),
  create_ticket(uuid, jsonb, uuid, uuid, text, text, date, uuid),
  update_ticket(uuid, ticket_status, text, text, uuid, date, text, text), reset_demo_data() to authenticated;
-- assert_access, log_audit, next_number, _reset_demo: hanya dipanggil dari dalam fungsi security definer.
