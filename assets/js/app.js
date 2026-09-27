document.querySelectorAll('[data-confirm]').forEach(x=>x.addEventListener('click',e=>{if(!confirm(x.dataset.confirm))e.preventDefault()}));setTimeout(()=>document.querySelectorAll('.auto-hide').forEach(x=>x.remove()),3500);
// V5: ubah periode grafik penjualan tanpa reload halaman.
const periodLabels={daily:'30 hari terakhir',monthly:'Rekap penjualan per bulan',yearly:'Rekap penjualan per tahun'};
document.querySelectorAll('[data-sales-period]').forEach(btn=>btn.addEventListener('click',()=>{
  const period=btn.dataset.salesPeriod;
  document.querySelectorAll('[data-sales-period]').forEach(x=>x.classList.toggle('active',x===btn));
  document.querySelectorAll('[data-sales-panel]').forEach(x=>x.classList.toggle('active',x.dataset.salesPanel===period));
  const label=document.getElementById('salesPeriodLabel'); if(label) label.textContent=periodLabels[period]||'';
}));
