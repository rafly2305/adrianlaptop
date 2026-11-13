import { redirect } from 'next/navigation';
export default function ProductsIndex() { redirect('/inventory?view=products'); }
