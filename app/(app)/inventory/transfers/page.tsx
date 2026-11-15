import { redirect } from 'next/navigation';

/** Transfer antar-cabang tidak dipakai: aplikasi hanya melayani satu lokasi (Cidodol). */
export default function Transfers() { redirect('/inventory/summary'); }
