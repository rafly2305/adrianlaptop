import Link from 'next/link';
export default function NotFound() {
  return (<main className="mx-auto mt-24 max-w-md text-center"><h1 className="text-xl font-semibold">Halaman tidak ditemukan</h1><Link href="/" className="btn-primary mt-4">Ke Dashboard</Link></main>);
}
