-- 0008_percent_discount_tax.sql — Diskon transaksi & pajak dalam PERSEN pada POS. Jalankan SETELAH 0007. Tidak menghapus data.
-- Rumus: Subtotal = Σ(harga×qty) − diskon item; Diskon = Subtotal × %; Setelah diskon = Subtotal − Diskon;
--        Pajak = Setelah diskon × %; Total pembayaran = Setelah diskon + Pajak.
alter table sales add column if not exists discount_percent numeric(5,2) not null default 0,
  add column if not exists tax_percent numeric(5,2) not null default 0;

drop function if exists create_sale_pos(uuid, jsonb, jsonb, text, numeric, text, text, numeric, text);

create or replace function create_sale_pos(p_branch uuid, p_customer jsonb, p_items jsonb, p_method text, p_tendered numeric,
                                           p_reference text, p_pay_note text, p_discount_pct numeric, p_tax_pct numeric, p_notes text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_sale uuid; v_s sales%rowtype; v_role app_role := auth_role(); v_maxpct numeric;
        v_dpct numeric := coalesce(p_discount_pct, 0); v_tpct numeric := coalesce(p_tax_pct, 0);
        v_base numeric; v_disc numeric; v_after numeric; v_tax numeric; v_total numeric; v_cash boolean; v_tend numeric; v_change numeric := 0;
begin
  if p_method is null or btrim(p_method) = '' then raise exception 'payment_method_required'; end if;
  if v_dpct < 0 or v_dpct > 100 or v_tpct < 0 or v_tpct > 100 then raise exception 'invalid_discount'; end if;
  v_sale := create_sale(p_branch, p_customer, p_items, btrim(p_method), null, p_notes);
  select * into v_s from sales where id = v_sale for update;
  select coalesce((value #>> '{}')::numeric, 0) into v_maxpct from app_settings where key = 'max_discount_percent';
  v_maxpct := coalesce(v_maxpct, 0);
  v_base := v_s.total;                          -- subtotal setelah diskon item
  v_disc := round(v_base * v_dpct / 100);
  if v_disc > 0 and v_role not in ('super_admin', 'branch_admin') and (v_s.discount + v_disc) > v_s.subtotal * v_maxpct / 100 then
    raise exception 'discount_over_limit';
  end if;
  v_after := v_base - v_disc;
  v_tax := round(v_after * v_tpct / 100);
  v_total := v_after + v_tax;
  v_cash := lower(btrim(p_method)) = 'tunai';
  if v_cash then
    v_tend := coalesce(p_tendered, 0);
    if v_tend < v_total then raise exception 'payment_insufficient'; end if;
    v_change := v_tend - v_total;
  else
    v_tend := v_total;
  end if;
  update sales set discount = discount + v_disc, discount_percent = v_dpct, tax = v_tax, tax_percent = v_tpct,
                   total = v_total, payment_status = 'paid' where id = v_sale;
  delete from payments where sale_id = v_sale;
  insert into payments(sale_id, method, amount, reference, tendered, change_amount, note, data_origin)
  values (v_sale, btrim(p_method), v_total, nullif(btrim(coalesce(p_reference, '')), ''), v_tend, v_change,
          nullif(btrim(coalesce(p_pay_note, '')), ''), v_s.data_origin);
  return v_sale;
end $$;

revoke execute on function create_sale_pos(uuid, jsonb, jsonb, text, numeric, text, text, numeric, numeric, text) from public, anon;
grant execute on function create_sale_pos(uuid, jsonb, jsonb, text, numeric, text, text, numeric, numeric, text) to authenticated;
