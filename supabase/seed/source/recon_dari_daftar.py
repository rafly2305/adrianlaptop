import re, csv, collections

RAW = """1. LENOVO THINKPAD L14 15-10310U 8/256 TOUCHSCREEN
2. LENOVO THINKPAD L14 15-103100 8/256 TOUCHSCREEN
3. LENOVO THINKPAD L14 15-10210U 16/256 NO TOUCHSCREEN
4. LENOVO THINKPAD L14 15-10210U 8/256 NO TOUCHSCREEN
5. LENOVO THINKPAD L14 15-10210U 8/256 NO TOUCHSCREEN
6. LENOVO THINKPAD 8/256 15-103100 8/256 TOUCHSCREEN
7. MICROSOFT SURFACE 1951 15-114567 W118/512 TOUCHSCREEN
8. MICROSOFT SURFACE 1951 15-114567 W118/512 TOUCHSCREEN
9. LENOVO THINK YOGA 13-10110U 4/128 TOUCHSCREEN
10. LENOVO THINKPAD L13 YOGA 13-101100 4/128 TOUCHSCREEN
11. ACER TRAVELMATE P633 15 GEN 3 4/HDD320 14INCH
12. ACER TRAVELMATE P633 15 GEN 3 4/HDD320 14INCH
13. ACER TRAVELMATE P633 15 GEN 3 4/HDD320 14INCH
14. ACER TRAVELMATE P247M 13 GEN 5 4/128
15. ACER TRAVELMATE P247M 13 GEN 5 4/128
16. ACER TRAVELMATE P247M 13 GEN 5 4/128
17. LENOVO 300E CHROMEBOOK N4020 4/32
18. ZYREX BUNAKEN BLACK N4020 4/256
19. LENOVO IDEAPAD 1 11ADA05 AMD RADEON GRAPHICS 4/256 GEN11
21. ADVAN CELERON N4020 GO 12
22. ADVAN WORKPRO 1710 LITE 13 GEN 128/256 FULL SET
23. DELL LATITUDE E5720 15 GEN 6 8/256
24. PC ALL IN ONE HAPPY GSR 17-3520M 8/256
25. ACER ASPIRE AS1-432 CELERON N3350 6/256
""" + "\n".join(f"{n}. TOSHIBA DYNABOOK K50 N4020 4/64" for n in range(26,36)) + """
36. LENOVO THINKPAD L13 YOGA INTEL CORE i3-10110U 4/128 TOUCHSCREEN FLIP
37. LENOVO THINKPAD L13 YOGA INTEL CORE i3-10110U 4/128 TOUCHSCREEN FLIP
38. LENOVO THINKPAD L13 YOGA INTEL CORE i3-10110U 4/128 TOUCHSCREEN FLIP
39. INFINIX XBOOK 15 RYZEN 5 5500 8/256
40. AXIOO HYPE 1 INTEL CELERON N4020 4/128
41. AXIOO HYPE 1 INTEL CELERON N4020 4/128
""" + "\n".join(f"{n}. LENOVO D330 INTEL CELERON 4/SD 64GB" for n in range(42,47)) + """
47. LENOVO THINKPAD X270 INTEL CORE i5-6300U 8/256GB
48. LENOVO THINKPAD X270 INTEL CORE i5-6300U 8/256GB
49. DELL LATITUDE 7410 INTEL CORE i5-10310U 16/256GB
50. LENOVO THINKPAD L14 i5-10210U 16/256 NO TOUCHSCREEN
"""
ACC = [(51,52,"CABLE HDMI"),(53,56,"CABLE PORT ADAPTER HDMI TO VGA"),(58,60,"USB WIFI WIRELESS 300 MBPS"),
       (61,65,"CABLE HDMI"),(66,70,"OBENG 4 PCS/SET"),(71,79,"MOUSE CABLE MTECH MT-129"),
       (80,88,"MOUSE LOGITECH B175 WIRELESS"),(89,97,"PLAIN BLACK MOUSEPAD")]

# Normalisasi per kelompok: (brand, model, cpu, ram_gb, storage, touch, kategori, flag)
# None = tidak diketahui dari daftar. Semua inferensi ditandai di kolom 'flag'.
N = {
 "L14-a":("Lenovo","ThinkPad L14","Intel Core i5-10310U",8,"256 (tipe tidak disebut)","Ya","Laptop","CPU '15-10310U' dibaca i5-10310U (OCR i5->15)"),
 "L14-b":("Lenovo","ThinkPad L14","Intel Core i5-10310U",8,"256 (tipe tidak disebut)","Ya","Laptop","CPU '15-103100' dibaca i5-10310U (typo 0 vs U); verifikasi fisik"),
 "L14-c":("Lenovo","ThinkPad L14","Intel Core i5-10210U",16,"256 (tipe tidak disebut)","Tidak","Laptop","CPU '15-10210U' dibaca i5-10210U"),
 "L14-d":("Lenovo","ThinkPad L14","Intel Core i5-10210U",8,"256 (tipe tidak disebut)","Tidak","Laptop","CPU '15-10210U' dibaca i5-10210U"),
 "TP6":(  "Lenovo",None,"Intel Core i5-10310U",8,"256 (tipe tidak disebut)","Ya","Laptop","MODEL TIDAK DISEBUT di daftar; teks '8/256' tertulis dobel; CPU dibaca i5-10310U. PERLU VERIFIKASI"),
 "SURF":("Microsoft","Surface 1951","Intel Core i5-1145G7 (?)",8,"512 (tipe tidak disebut)","Ya","Laptop","CPU '15-114567' dibaca i5-1145G7; 'W118/512' dibaca Windows 11 + 8/512. PERLU VERIFIKASI"),
 "YOGA9":("Lenovo","Think Yoga (?)","Intel Core i3-10110U",4,"128 (tipe tidak disebut)","Ya","Laptop","Tertulis 'THINK YOGA'; model pasti belum jelas; CPU '13-10110U' dibaca i3-10110U. PERLU VERIFIKASI"),
 "YOGA10":("Lenovo","ThinkPad L13 Yoga","Intel Core i3-10110U",4,"128 (tipe tidak disebut)","Ya","Laptop","CPU '13-101100' dibaca i3-10110U"),
 "P633":("Acer","TravelMate P633","Intel Core i5 Gen 3 (?)",4,"HDD 320","Tidak","Laptop","'15 GEN 3' dibaca Core i5 generasi 3; layar 14 inci"),
 "P247":("Acer","TravelMate P247M","Intel Core i3 Gen 5 (?)",4,"128 (tipe tidak disebut)","Tidak","Laptop","'13 GEN 5' dibaca Core i3 generasi 5"),
 "300E":("Lenovo","300e Chromebook","Intel Celeron N4020",4,"32 (tipe tidak disebut)","Tidak","Laptop","Touch tidak disebut -> diisi 'Tidak' sementara"),
 "ZYR":("Zyrex","Bunaken Black","Intel Celeron N4020",4,"256 (tipe tidak disebut)","Tidak","Laptop",""),
 "IDP1":("Lenovo","IdeaPad 1 11ADA05","AMD (Radeon Graphics)",4,"256 (tipe tidak disebut)","Tidak","Laptop","Teks 'GEN11' tidak jelas artinya; seed lama salah menulis 'IdeaPad 3'. PERLU VERIFIKASI"),
 "ADV21":("Advan","Celeron N4020 (nama model tidak jelas)","Intel Celeron N4020",None,None,"Tidak","Laptop","RAM/storage TIDAK ADA di daftar; 'GO 12' tidak jelas. Seed lama mengarang 4/128. PERLU VERIFIKASI"),
 "ADV22":("Advan","Workpro 1710 Lite","Intel Core i3 (gen?) (?)",None,None,"Tidak","Laptop","'13 GEN' dibaca i3 gen ?; '128/256' ambigu (RAM/storage?); FULL SET. Seed lama mengarang i3 Gen 12 8/256. PERLU VERIFIKASI"),
 "DELL23":("Dell","Latitude E5720","Intel Core i5 Gen 6 (?)",8,"256 (tipe tidak disebut)","Tidak","Laptop","'15 GEN 6' dibaca i5 gen 6; kode model E5720 perlu dicek fisik"),
 "AIO":("","All In One Happy GSR","Intel Core i7-3520M (?)",8,"256 (tipe tidak disebut)","Tidak","PC All-in-One","'17-3520M' dibaca i7-3520M; bukan laptop. PERLU VERIFIKASI"),
 "ASP":("Acer","Aspire AS1-432","Intel Celeron N3350",6,"256 (tipe tidak disebut)","Tidak","Laptop","RAM 6 GB tertulis '6/256'; cek apakah memang 6 GB"),
 "DYN":("Toshiba","Dynabook K50","Intel Celeron N4020",4,"64 (tipe tidak disebut)","Tidak","Laptop",""),
 "L13F":("Lenovo","ThinkPad L13 Yoga","Intel Core i3-10110U",4,"128 (tipe tidak disebut)","Ya","Laptop","Touchscreen flip"),
 "INF":("Infinix","XBook 15 (?)","AMD Ryzen 5 5500 (?)",8,"256 (tipe tidak disebut)","Tidak","Laptop","'15' bisa ukuran layar/penulisan i5, tetapi CPU Ryzen; seed lama menulis 'I5 Rayzen'. PERLU VERIFIKASI"),
 "AXI":("Axioo","Hype 1","Intel Celeron N4020",4,"128 (tipe tidak disebut)","Tidak","Laptop",""),
 "D330":("Lenovo","D330","Intel Celeron (seri tidak disebut)",4,"64 'SD' (tipe tidak jelas)","Tidak","Laptop","'SD 64GB' kemungkinan eMMC/SD; jangan diisi SSD tanpa verifikasi"),
 "X270":("Lenovo","ThinkPad X270","Intel Core i5-6300U",8,"256 GB","Tidak","Laptop",""),
 "D7410":("Dell","Latitude 7410","Intel Core i5-10310U",16,"256 GB","Tidak","Laptop",""),
}
def grp(n):
    if n==1:return "L14-a"
    if n==2:return "L14-b"
    if n==3:return "L14-c"
    if n in(4,5):return "L14-d"
    if n==6:return "TP6"
    if n in(7,8):return "SURF"
    if n==9:return "YOGA9"
    if n==10:return "YOGA10"
    if 11<=n<=13:return "P633"
    if 14<=n<=16:return "P247"
    if n==17:return "300E"
    if n==18:return "ZYR"
    if n==19:return "IDP1"
    if n==21:return "ADV21"
    if n==22:return "ADV22"
    if n==23:return "DELL23"
    if n==24:return "AIO"
    if n==25:return "ASP"
    if 26<=n<=35:return "DYN"
    if 36<=n<=38:return "L13F"
    if n==39:return "INF"
    if n in(40,41):return "AXI"
    if 42<=n<=46:return "D330"
    if n in(47,48):return "X270"
    if n==49:return "D7410"
    if n==50:return "L14-c"
items={}
for line in RAW.strip().splitlines():
    m=re.match(r"(\d+)\.\s+(.*)",line); items[int(m.group(1))]=m.group(2).strip()
rows=[]
for n,raw in sorted(items.items()):
    b,mo,cpu,ram,sto,tc,cat,flag=N[grp(n)]
    rows.append(dict(ref_no=n,internal_asset_code=f"UNIT-CDL-{len(rows)+1:06d}",tipe="berseri (laptop/PC)",kategori=cat,
      nama_asli_daftar=raw,brand=b or "",model=mo or "",cpu=cpu,ram_gb=ram if ram else "",storage=sto or "",
      touchscreen=tc,serial_number="",serial_status="belum_ada",perlu_verifikasi="YA" if ("VERIF" in flag.upper() or "(?)" in (mo or "")+cpu) else "tidak",catatan=flag))
acc_units=0; accs=collections.OrderedDict()
for a,b,name in ACC:
    for n in range(a,b+1): items[n]=name; acc_units+=1
    accs.setdefault(name,[]).extend(range(a,b+1))
# verifikasi
laptops=[r for r in rows]
assert len(laptops)==49, len(laptops)
assert sorted(set(range(1,98))-set(items))==[20,57]
assert acc_units==46
with open("cidodol_inventory_normalized.csv","w",newline="",encoding="utf-8") as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
with open("cidodol_accessories_quantity.csv","w",newline="",encoding="utf-8") as f:
    w=csv.writer(f); w.writerow(["nama_asli_daftar","jumlah_pcs","nomor_referensi_sumber","pengelolaan"])
    for k,v in accs.items(): w.writerow([k,len(v),";".join(map(str,v)),"kuantitas (tanpa serial individual)"])
print("laptop/PC:",len(laptops),"| perlu verifikasi:",sum(r['perlu_verifikasi']=='YA' for r in rows))
print("nomor hilang:",sorted(set(range(1,98))-set(items)))
for k,v in accs.items(): print(len(v),k)
print("total aksesori:",acc_units)
# bandingkan seed lama
old_acc={"CABLE HDMI":6,"CABLE PORT ADAPTER HDMI TO VGA":5,"USB WIFI WIRELESS 300 MBPS":4,"OBENG 4 PCS/SET":5,"MOUSE CABLE MTECH MT-129":8,"MOUSE LOGITECH B175 WIRELESS":9,"MOUSEPAD HITAM POLOS":9}
print("\nSelisih aksesori (daftar vs seed lama):")
for k,v in accs.items():
    ok=old_acc.get(k, old_acc.get("MOUSEPAD HITAM POLOS") if "MOUSEPAD" in k else None)
    print(f"  {k}: daftar={len(v)} lama={ok} {'<-- BEDA' if ok!=len(v) else ''}")
