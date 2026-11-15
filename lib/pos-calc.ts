/**
 * Perhitungan total POS. Seluruh aritmetika memakai bilangan bulat (rupiah penuh, persen dalam seperseratus)
 * sehingga hasilnya identik dengan fungsi create_sale_pos di database (round half-up ke rupiah terdekat).
 */
export type Totals = { subtotal: number; discount: number; afterDiscount: number; tax: number; total: number };

/** Persen valid: 0..100 dengan maksimal 2 desimal. */
export function validPercent(p: number): boolean {
  return Number.isFinite(p) && p >= 0 && p <= 100 && Math.abs(p * 100 - Math.round(p * 100)) < 1e-6;
}

/** Ubah teks input ("10", "2,5", "") menjadi angka; kosong dianggap 0, tidak terbaca dianggap NaN. */
export function parsePercent(s: string): number {
  const t = s.trim().replace(',', '.');
  return t === '' ? 0 : Number(t);
}

const pctOf = (amount: number, percent: number) => Math.floor((amount * Math.round(percent * 100) + 5000) / 10000);

export function calcTotals(subtotal: number, discountPercent: number, taxPercent: number): Totals {
  const sub = Math.round(subtotal);
  const d = validPercent(discountPercent) ? discountPercent : 0;
  const t = validPercent(taxPercent) ? taxPercent : 0;
  const discount = pctOf(sub, d);
  const afterDiscount = sub - discount;
  const tax = pctOf(afterDiscount, t);
  return { subtotal: sub, discount, afterDiscount, tax, total: afterDiscount + tax };
}
