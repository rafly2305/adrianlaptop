import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Adrian Laptop Store', template: '%s · Adrian Laptop Store' },
  description: 'Sistem Informasi Penjualan, Inventory, Customer Service & Warranty — Adrian Laptop Store',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="id"><body>{children}</body></html>);
}
