import Image from 'next/image';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { loginAction } from './actions';

export const metadata = { title: 'Masuk' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const notice = e === 'noprofile' ? 'Akun Anda belum diaktifkan oleh admin.' : e === 'config' ? 'Konfigurasi server belum lengkap. Hubungi admin.' : null;
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-ink text-white lg:flex lg:flex-col lg:justify-between">
        {/* Gambar full di panel kiri, proporsi dijaga dengan object-cover */}
        <Image
          src="/logo.png"
          alt="Adrian Laptop Store"
          fill
          sizes="55vw"
          className="object-cover"
          priority
        />
        {/* Overlay gelap/biru dongker, hanya di panel kiri */}
        <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/80 to-ink/95" />

        <div className="relative z-10 flex h-full flex-col justify-between p-12">
          <div />
          <div>
            <p className="max-w-md text-3xl font-semibold leading-snug">Setiap unit punya nomor seri. Setiap stok punya riwayat.</p>
            <p className="mt-3 max-w-md text-ink-300">Sistem internal untuk penjualan, inventory, customer service, dan garansi seluruh cabang.</p>
          </div>
          <p className="font-mono text-xs text-ink-300">Sistem Internal Adrian Laptop Store · Multi-Cabang</p>
        </div>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Image src="/logo.png" alt="Adrian Laptop Store" width={140} height={48} className="mb-6 h-12 w-auto lg:hidden" />
          <h1 className="text-2xl font-semibold">Masuk</h1>
          <p className="mb-6 mt-1 text-sm text-ink-500">Sistem Informasi Adrian Laptop Store — khusus pengguna internal.</p>
          {notice && <div role="alert" className="mb-4 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{notice}</div>}
          <ActionForm action={loginAction} className="space-y-4">
            <label className="block"><span className="label">Email</span><input className="input" name="email" type="email" autoComplete="username" required /></label>
            <label className="block"><span className="label">Password</span><input className="input" name="password" type="password" autoComplete="current-password" required /></label>
            <SubmitButton className="btn-primary w-full">Masuk</SubmitButton>
          </ActionForm>
          <p className="mt-6 text-xs text-ink-500">Lupa password? Hubungi Super Admin untuk mengatur ulang akun Anda.</p>
        </div>
      </section>
    </main>
  );
}