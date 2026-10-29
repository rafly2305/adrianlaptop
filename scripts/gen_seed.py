#!/usr/bin/env python3
"""Generator seed. Output (deterministik, idempoten) ke supabase/seed/:
  00_base.sql        cabang, kategori, pengaturan awal
  01_cidodol.sql     inventory nyata Cidodol dari daftar (49 unit berseri + 7 aksesori/46 pcs)
  02_demo.sql        data SINTETIS 1 bulan untuk 5 cabang demo (data_origin='demo')
  99_reset_demo.sql  hapus data demo saja (tidak menyentuh Cidodol)
Jalankan:  python3 scripts/gen_seed.py
"""
import csv, re, uuid, random, collections, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "supabase/seed/source"
OUT = ROOT / "supabase/seed"
NS = uuid.UUID("6f1c2d3e-0000-4000-8000-adrian000001".replace("adrian", "ad71a2"))

def uid(*k): return str(uuid.uuid5(NS, "|".join(map(str, k))))
class Raw(str): pass
def q(v):
    if v is None: return "NULL"
    if isinstance(v, Raw): return str(v)
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"

BRANCHES = [  # nama/kota dari proyek lama (README/SQL v6); dapat diedit di Pengaturan
    ("CDL", "Cidodol", "Jakarta", False), ("CLD", "Ciledug", "Tangerang", True), ("MRY", "Meruya", "Jakarta Barat", True),
    ("PMG", "Pamulang", "Tangerang Selatan", True), ("CSK", "Cisauk", "Tangerang", True), ("BTR", "Bintaro", "Tangerang Selatan", True)]

def base():
    o = ["-- 00_base.sql (dibuat oleh scripts/gen_seed.py) — idempoten", "begin;"]
    for code, name, city, demo in BRANCHES:
        o.append(f"insert into branches(code,name,city,is_demo,data_origin) values ({q(code)},{q(name)},{q(city)},{q(demo)},{q('demo' if demo else 'real')}) on conflict (code) do nothing;")
    for n, t in [("Laptop", "serialized"), ("PC All-in-One", "serialized"), ("Aksesori", "quantity")]:
        o.append(f"insert into categories(name,default_tracking) values ({q(n)},{q(t)}) on conflict (name) do nothing;")
    st = {"max_discount_percent": "0", "store_warranty_months": "null",
          "payment_methods": '["Tunai","Non Tunai"]', "company_name": '"Adrian Laptop Store"'}
    for k, v in st.items():
        o.append(f"insert into app_settings(key,value) values ({q(k)},{q(v)}::jsonb) on conflict (key) do nothing;")
    o.append("commit;")
    return "\n".join(o) + "\n"

def clean_storage(s):
    s = (s or "").strip()
    if not s: return None
    if s.upper().startswith("HDD"): return "HDD " + re.search(r"\d+", s).group() + " GB"
    if "SD" in s.upper(): return re.search(r"\d+", s).group() + " GB (SD/eMMC - belum jelas)"
    return re.search(r"\d+", s).group() + " GB"
def clean(s): return re.sub(r"\s*\(\?\)", "", s or "").strip() or None

def load_catalog():
    laptops = list(csv.DictReader(open(SRC / "cidodol_inventory_normalized.csv", encoding="utf-8")))
    accs = list(csv.DictReader(open(SRC / "cidodol_accessories_quantity.csv", encoding="utf-8")))
    groups = collections.OrderedDict()
    for r in laptops:
        key = (r["brand"], clean(r["model"]), clean(r["cpu"]), r["ram_gb"], clean_storage(r["storage"]), r["touchscreen"], r["kategori"])
        groups.setdefault(key, []).append(r)
    products = []; counters = collections.Counter()
    for key, rows in groups.items():
        brand, model, cpu, ram, sto, touch, cat = key
        pre = "AIO" if cat == "PC All-in-One" else "LTP"
        counters[pre] += 1
        sku = f"{pre}-{counters[pre]:04d}"
        parts = [brand or ("PC" if cat == "PC All-in-One" else rows[0]["nama_asli_daftar"].split()[0].title()), model or "(model tidak disebut)", cpu]
        if ram and sto: parts.append(f"{ram}GB/{sto.replace(' GB','')}")
        if touch == "Ya": parts.append("Touchscreen")
        products.append(dict(sku=sku, name=" ".join(p for p in parts if p), original=rows[0]["nama_asli_daftar"], brand=brand or None, model=model,
            cat=cat, tracking="serialized", cpu=cpu, ram=int(ram) if ram else None, storage=sto, touch={"Ya": True, "Tidak": False}.get(touch),
            verify=any(x["perlu_verifikasi"] == "YA" for x in rows), ref=",".join(x["ref_no"] for x in rows), units=rows))
    for r in accs:
        counters["ACC"] += 1
        nm = r["nama_asli_daftar"]
        brand = "MTECH" if "MTECH" in nm else "Logitech" if "LOGITECH" in nm else None
        model = "MT-129" if "MT-129" in nm else "B175" if "B175" in nm else None
        products.append(dict(sku=f"ACC-{counters['ACC']:04d}", name=nm, original=nm, brand=brand, model=model, cat="Aksesori", tracking="quantity",
            cpu=None, ram=None, storage=None, touch=None, verify=False, ref=r["nomor_referensi_sumber"].replace(";", ","), qty=int(r["jumlah_pcs"]), units=[]))
    return products

def cidodol(products):
    o = ["-- 01_cidodol.sql (dibuat oleh scripts/gen_seed.py) — inventory NYATA Cidodol dari daftar sumber. Idempoten.",
         "-- Tidak ada harga/pemasok/garansi/serial pabrikan: data tersebut tidak diberikan. Tidak ada transaksi.", "begin;"]
    nu = 0
    for p in products:
        spec = {"sumber": "daftar inventory Cidodol"}
        o.append("insert into products(sku,name,original_name,brand,model,category_id,tracking,processor,ram_gb,storage,touchscreen,specs,needs_verification,source_ref) "
                 f"select {q(p['sku'])},{q(p['name'])},{q(p['original'])},{q(p['brand'])},{q(p['model'])},c.id,{q(p['tracking'])},{q(p['cpu'])},{q(p['ram'])},{q(p['storage'])},{q(p['touch'])},"
                 f"{q(str(spec).replace(chr(39), chr(34)))}::jsonb,{q(p['verify'])},{q(p['ref'])} from categories c where c.name={q(p['cat'])} on conflict (sku) do nothing;")
        if p["tracking"] == "quantity":
            o.append(f"insert into inventory_balances(product_id,branch_id,qty) select p.id,b.id,{p['qty']} from products p,branches b where p.sku={q(p['sku'])} and b.code='CDL' on conflict do nothing;")
            o.append("insert into stock_movements(id,branch_id,product_id,type,qty,reason) "
                     f"select {q(uid('mv','CDL',p['sku']))},b.id,p.id,'receive',{p['qty']},'Saldo awal dari daftar inventory (ref {p['ref']})' from products p,branches b where p.sku={q(p['sku'])} and b.code='CDL' on conflict (id) do nothing;")
        for r in p["units"]:
            nu += 1
            note = r["catatan"] + (" [PERLU VERIFIKASI]" if r["perlu_verifikasi"] == "YA" else "")
            o.append("insert into inventory_units(id,product_id,branch_id,internal_asset_code,serial_number,serial_status,status,condition,source_ref,source_raw,notes) "
                     f"select {q(uid('unit','CDL',r['ref_no']))},p.id,b.id,{q(r['internal_asset_code'])},NULL,'belum_ada','available','belum_diperiksa',{r['ref_no']},{q(r['nama_asli_daftar'])},{q(note or None)} "
                     f"from products p,branches b where p.sku={q(p['sku'])} and b.code='CDL' on conflict (internal_asset_code) do nothing;")
            o.append("insert into stock_movements(id,branch_id,product_id,unit_id,type,qty,reason) "
                     f"select {q(uid('mv','CDL','u',r['ref_no']))},u.branch_id,u.product_id,u.id,'receive',1,'Saldo awal dari daftar inventory (ref no. {r['ref_no']})' "
                     f"from inventory_units u where u.internal_asset_code={q(r['internal_asset_code'])} on conflict (id) do nothing;")
    o.append(f"insert into doc_counters(key,n) values ('UNIT-CDL',{nu}) on conflict (key) do update set n = greatest(doc_counters.n,{nu});")
    o.append("commit;")
    return "\n".join(o) + "\n", nu

def demo(products):
    rng = random.Random(20261026)
    lap = [p for p in products if p["tracking"] == "serialized" and not p["verify"]]
    acc = [p for p in products if p["tracking"] == "quantity"]
    cost = {p["sku"]: rng.choice([1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0]) * 1_000_000 for p in lap}
    price = {k: round(v * 1.2 / 50_000) * 50_000 for k, v in cost.items()}
    apr = {p["sku"]: rng.choice([35_000, 60_000, 85_000, 120_000]) for p in acc}
    names = ["Pelanggan Demo A", "Pelanggan Demo B", "Pelanggan Demo C", "Pelanggan Demo D", "Pelanggan Demo E", "Pelanggan Demo F"]
    methods = ["Tunai", "Non Tunai"]
    o = ["-- 02_demo.sql (dibuat oleh scripts/gen_seed.py) — data SINTETIS, data_origin='demo'. Bukan transaksi nyata. Idempoten.",
         "-- Hanya untuk cabang demo; tanggal relatif terhadap waktu seed dijalankan (maks. 30 hari ke belakang).", "begin;"]
    ts = lambda d, h, m=0: Raw(f"(date_trunc('day', now()) - interval '{d} days' + interval '{h} hours {m} minutes')")
    dt = lambda d: Raw(f"(current_date - {d})")
    state = {}   # untuk verifikasi
    report = collections.OrderedDict()
    serials = set()
    for code, name, city, is_demo in BRANCHES:
        if not is_demo: continue
        st = dict(units={}, bal={}, mv=collections.defaultdict(int), sales=0, rev=0, items_active={})
        seq = 0
        picks = rng.sample(lap, 8)
        # unit: 8 laptop, diterima 21-29 hari lalu
        for p in picks:
            seq += 1
            u = uid("unit", code, seq); sn = f"DEMO-{code}-{seq:03d}"
            assert sn not in serials; serials.add(sn)
            rd = rng.randint(21, 29)
            st["units"][u] = dict(sku=p["sku"], status="available", seq=seq, recv=rd, serial=sn)
            o.append("insert into inventory_units(id,product_id,branch_id,internal_asset_code,serial_number,serial_status,status,condition,received_at,cost_price,store_warranty_months,notes,data_origin,created_at) "
                     f"select {q(u)},p.id,b.id,{q(f'UNIT-{code}-{seq:06d}')},{q(sn)},'sintetis_demo','available','bekas_baik',{dt(rd)},{cost[p['sku']]:.0f},1,'DATA SINTETIS DEMO - bukan nomor seri pabrikan','demo',{ts(rd,9)} "
                     f"from products p,branches b where p.sku={q(p['sku'])} and b.code={q(code)} on conflict (id) do nothing;")
            o.append("insert into stock_movements(id,branch_id,product_id,unit_id,type,qty,reason,data_origin,created_at) "
                     f"select {q(uid('mv',code,'rcv',seq))},b.id,p.id,{q(u)},'receive',1,'Penerimaan demo','demo',{ts(rd,9)} from products p,branches b where p.sku={q(p['sku'])} and b.code={q(code)} on conflict (id) do nothing;")
        accp = rng.sample(acc, 3)
        for i, p in enumerate(accp):
            qty = rng.randint(6, 12); rd = rng.randint(21, 29)
            st["bal"][p["sku"]] = qty; st["mv"][p["sku"]] += qty
            o.append(f"insert into inventory_balances(product_id,branch_id,qty) select p.id,b.id,{qty} from products p,branches b where p.sku={q(p['sku'])} and b.code={q(code)} on conflict do nothing;")
            o.append("insert into stock_movements(id,branch_id,product_id,type,qty,reason,data_origin,created_at) "
                     f"select {q(uid('mv',code,'racc',i))},b.id,p.id,'receive',{qty},'Penerimaan demo','demo',{ts(rd,9)} from products p,branches b where p.sku={q(p['sku'])} and b.code={q(code)} on conflict (id) do nothing;")
        # pelanggan
        for i, cn in enumerate(names):
            o.append(f"insert into customers(id,branch_id,name,phone,data_origin) select {q(uid('cust',code,i))},b.id,{q(cn+' ('+code+')')},{q(f'0800000{i:02d}{code}')},'demo' from branches b where b.code={q(code)} on conflict (id) do nothing;")
        # penjualan: 6 transaksi, unit 0..5; transaksi ke-6 (BTR) di-void
        order = list(st["units"].keys())
        days = sorted(rng.sample(range(1, 19), 6), reverse=True)
        for n in range(6):
            u = order[n]; ud = st["units"][u]; sku = ud["sku"]
            sid = uid("sale", code, n); inv = f"DEMO-INV-{code}-{n+1:02d}"
            d = days[n]; h = rng.randint(10, 17)
            items = [("unit", u, sku, 1, price[sku])]
            if n % 2 == 0:
                a = accp[n % 3]
                if st["bal"][a["sku"]] >= 1:
                    items.append(("qty", None, a["sku"], 1, apr[a["sku"]]))
            total = sum(i[3] * i[4] for i in items)
            void = (code == "BTR" and n == 5)
            meth = methods[n % 2]
            cid = uid("cust", code, n)
            o.append("insert into sales(id,invoice_no,branch_id,customer_id,sold_at,subtotal,discount,total,payment_status,payment_method,status,void_reason,notes,data_origin,created_at) "
                     f"select {q(sid)},{q(inv)},b.id,{q(cid)},{ts(d,h)},{total:.0f},0,{total:.0f},'paid',{q(meth)},{q('void' if void else 'completed')},{q('Salah input (demo)' if void else None)},'DATA SINTETIS DEMO','demo',{ts(d,h)} "
                     f"from branches b where b.code={q(code)} on conflict (id) do nothing;")
            o.append(f"insert into payments(id,sale_id,method,amount,paid_at,data_origin) select {q(uid('pay',code,n))},{q(sid)},{q(meth)},{total:.0f},{ts(d,h)},'demo' on conflict (id) do nothing;")
            for k, it in enumerate(items):
                kind, unit, s, qy, pr = it
                o.append("insert into sale_items(id,sale_id,product_id,unit_id,qty,unit_price,discount,line_total,active) "
                         f"select {q(uid('si',code,n,k))},{q(sid)},p.id,{q(unit)},{qy},{pr:.0f},0,{qy*pr:.0f},{q(not void)} from products p where p.sku={q(s)} on conflict (id) do nothing;")
                o.append("insert into stock_movements(id,branch_id,product_id,unit_id,type,qty,ref_type,ref_id,reason,data_origin,created_at) "
                         f"select {q(uid('mv',code,'s',n,k))},b.id,p.id,{q(unit)},'sale',{-qy},'sale',{q(sid)},{q(inv)},'demo',{ts(d,h)} from products p,branches b where p.sku={q(s)} and b.code={q(code)} on conflict (id) do nothing;")
                if kind == "qty":
                    st["bal"][s] -= qy; st["mv"][s] -= qy
                    if void: st["bal"][s] += qy; st["mv"][s] += qy
                    o.append(f"update inventory_balances ib set qty = {st['bal'][s]} from products p,branches b where ib.product_id=p.id and ib.branch_id=b.id and p.sku={q(s)} and b.code={q(code)};")
                if void:
                    o.append("insert into stock_movements(id,branch_id,product_id,unit_id,type,qty,ref_type,ref_id,reason,data_origin,created_at) "
                             f"select {q(uid('mv',code,'v',n,k))},b.id,p.id,{q(unit)},'sale_void',{qy},'sale',{q(sid)},'Void '||{q(inv)},'demo',{ts(d,h+1)} from products p,branches b where p.sku={q(s)} and b.code={q(code)} on conflict (id) do nothing;")
            ud["status"] = "available" if void else "sold"
            if not void:
                st["sales"] += 1; st["rev"] += total
                o.append("insert into warranties(id,unit_id,sale_id,kind,start_date,end_date,verified,data_origin) "
                         f"values ({q(uid('war',code,n))},{q(u)},{q(sid)},'toko',{dt(d)},({dt(d)} + interval '1 month')::date,true,'demo') on conflict (id) do nothing;")
                ud["sale_day"] = d
            else:
                o.append(f"insert into warranties(id,unit_id,sale_id,kind,start_date,end_date,verified,voided,data_origin) values ({q(uid('war',code,n))},{q(u)},{q(sid)},'toko',{dt(d)},({dt(d)} + interval '1 month')::date,true,true,'demo') on conflict (id) do nothing;")
            o.append(f"update inventory_units set status={q(ud['status'])} where id={q(u)};")
        # tiket: 2 per cabang pada unit terjual
        sold = [u for u, d in st["units"].items() if d["status"] == "sold"]
        tk = [("Laptop tidak menyala", "diproses", "Pengecekan awal oleh teknisi (demo)"), ("Layar berkedip", "menunggu_spare_part", "Menunggu panel pengganti (demo)")]
        for i, (cat, status, note) in enumerate(tk):
            tid = uid("tkt", code, i); u = sold[i]; d = rng.randint(1, 8)
            o.append("insert into service_tickets(id,ticket_no,branch_id,customer_id,unit_id,category,description,status,received_at,eta,warranty_state,data_origin,created_at) "
                     f"select {q(tid)},{q(f'DEMO-TKT-{code}-{i+1:02d}')},b.id,NULL,{q(u)},{q(cat)},{q(cat + ' - data sintetis demo')},{q(status)},{dt(d)},{dt(d-5)},"
                     f"'aktif','demo',{ts(d,11)} from branches b where b.code={q(code)} on conflict (id) do nothing;")
            o.append(f"insert into service_ticket_history(id,ticket_id,kind,status,note,created_at) values ({q(uid('th',code,i,0))},{q(tid)},'status','baru','Tiket dibuat (demo)',{ts(d,11)}) on conflict (id) do nothing;")
            o.append(f"insert into service_ticket_history(id,ticket_id,kind,status,note,created_at) values ({q(uid('th',code,i,1))},{q(tid)},'status',{q(status)},{q(note)},{ts(d,14)}) on conflict (id) do nothing;")
        st["tickets"] = 2
        state[code] = st
        o.append(f"insert into doc_counters(key,n) values ({q('UNIT-'+code)},{seq}) on conflict (key) do update set n = greatest(doc_counters.n,{seq});")
        report[code] = st
    # transfer demo: CLD -> MRY (diterima) dan PMG -> CSK (dalam perjalanan), memakai unit baru
    for (a, b_, status, d, tag) in [("CLD", "MRY", "received", 12, 1), ("PMG", "CSK", "in_transit", 3, 2)]:
        st = state[a]; seq = max(v["seq"] for v in st["units"].values()) + 1
        p = rng.choice(lap); u = uid("unit", a, seq); sn = f"DEMO-{a}-{seq:03d}"; serials.add(sn)
        final_branch = b_ if status == "received" else a
        fstatus = "available" if status == "received" else "in_transit"
        o.append("insert into inventory_units(id,product_id,branch_id,internal_asset_code,serial_number,serial_status,status,condition,received_at,cost_price,notes,data_origin,created_at) "
                 f"select {q(u)},p.id,b.id,{q(f'UNIT-{a}-{seq:06d}')},{q(sn)},'sintetis_demo','available','bekas_baik',{dt(d+8)},{cost[p['sku']]:.0f},'DATA SINTETIS DEMO','demo',{ts(d+8,9)} from products p,branches b where p.sku={q(p['sku'])} and b.code={q(a)} on conflict (id) do nothing;")
        o.append("insert into stock_movements(id,branch_id,product_id,unit_id,type,qty,reason,data_origin,created_at) "
                 f"select {q(uid('mv',a,'trf',tag,0))},u.branch_id,u.product_id,u.id,'receive',1,'Penerimaan demo','demo',{ts(d+8,9)} from inventory_units u where u.id={q(u)} on conflict (id) do nothing;")
        tid = uid("trf", tag); num = f"DEMO-TRF-{tag:02d}"
        o.append("insert into stock_transfers(id,number,from_branch_id,to_branch_id,status,note,received_at,data_origin,created_at) "
                 f"select {q(tid)},{q(num)},fb.id,tb.id,{q(status)},'Transfer demo',{ts(d-1,10) if status=='received' else 'NULL'},'demo',{ts(d,10)} from branches fb,branches tb where fb.code={q(a)} and tb.code={q(b_)} on conflict (id) do nothing;")
        o.append(f"insert into stock_transfer_items(id,transfer_id,product_id,unit_id,qty) select {q(uid('ti',tag))},{q(tid)},u.product_id,u.id,1 from inventory_units u where u.id={q(u)} on conflict (id) do nothing;")
        o.append("insert into stock_movements(id,branch_id,product_id,unit_id,type,qty,ref_type,ref_id,reason,data_origin,created_at) "
                 f"select {q(uid('mv',a,'trfo',tag))},fb.id,u.product_id,u.id,'transfer_out',-1,'transfer',{q(tid)},{q(num)},'demo',{ts(d,10)} from inventory_units u,branches fb where u.id={q(u)} and fb.code={q(a)} on conflict (id) do nothing;")
        o.append(f"update inventory_units set status={q(fstatus)}, branch_id=(select id from branches where code={q(final_branch)}) where id={q(u)};")
        if status == "received":
            o.append("insert into stock_movements(id,branch_id,product_id,unit_id,type,qty,ref_type,ref_id,reason,data_origin,created_at) "
                     f"select {q(uid('mv',b_,'trfi',tag))},tb.id,u.product_id,u.id,'transfer_in',1,'transfer',{q(tid)},{q(num)},'demo',{ts(d-1,10)} from inventory_units u,branches tb where u.id={q(u)} and tb.code={q(b_)} on conflict (id) do nothing;")
        o.append(f"insert into doc_counters(key,n) values ({q('UNIT-'+a)},{seq}) on conflict (key) do update set n = greatest(doc_counters.n,{seq});")
    o.append("commit;")
    # ----- verifikasi konsistensi demo -----
    for code, st in state.items():
        for sku, qty in st["bal"].items():
            assert qty >= 0, (code, sku)
            assert st["mv"][sku] == qty, ("saldo vs pergerakan", code, sku, st["mv"][sku], qty)
        assert sum(1 for u in st["units"].values() if u["status"] == "sold") == st["sales"]
    assert len(serials) == len(set(serials))
    summary = {c: dict(units=len(s["units"]), terjual=s["sales"], omzet_demo=int(s["rev"]), tiket=s["tickets"]) for c, s in state.items()}
    return "\n".join(o) + "\n", summary

def reset_sql():
    return "-- 99_reset_demo.sql — hapus SELURUH data demo. Data 'real' (Cidodol) tidak disentuh.\nselect public._reset_demo();\n"

if __name__ == "__main__":
    prods = load_catalog()
    (OUT / "00_base.sql").write_text(base(), encoding="utf-8")
    sql, nu = cidodol(prods)
    (OUT / "01_cidodol.sql").write_text(sql, encoding="utf-8")
    dsql, summ = demo(prods)
    (OUT / "02_demo.sql").write_text(dsql, encoding="utf-8")
    (OUT / "99_reset_demo.sql").write_text(reset_sql(), encoding="utf-8")
    lap = [p for p in prods if p["tracking"] == "serialized"]; acc = [p for p in prods if p["tracking"] == "quantity"]
    assert nu == 49 and sum(len(p["units"]) for p in lap) == 49 and sum(p["qty"] for p in acc) == 46
    skus = [p["sku"] for p in prods]; assert len(skus) == len(set(skus))
    print(f"OK  produk={len(prods)} (berseri={len(lap)}, aksesori={len(acc)})  unit Cidodol={nu}  aksesori={sum(p['qty'] for p in acc)} pcs")
    print("Demo:", summ)
