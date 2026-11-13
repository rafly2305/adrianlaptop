import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { Card, PageHeader } from '@/components/ui';
import { ProductForm } from '@/components/ProductForm';

export default async function NewProduct() {
  const ctx = await requirePage('inventory.write');
  const cats = await run<{ id: string; name: string }[]>('kategori', () => ctx.sb.from('categories').select('id,name').order('name'));
  return (<><PageHeader title="Produk baru" /><Card><ProductForm categories={cats} /></Card></>);
}
