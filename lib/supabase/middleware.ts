import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/login', '/api/health'];

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isPublic = PUBLIC.some((p) => req.nextUrl.pathname === p || req.nextUrl.pathname.startsWith(p + '/'));
  if (!url || !anon) return isPublic ? res : NextResponse.redirect(new URL('/login?e=config', req.url));

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll(list: CookieToSet[]) {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  let user = null;
  try { user = (await supabase.auth.getUser()).data.user; } catch { /* jaringan gagal: perlakukan sebagai belum login */ }
  if (!user && !isPublic) return NextResponse.redirect(new URL('/login', req.url));
  if (user && req.nextUrl.pathname === '/login') return NextResponse.redirect(new URL('/', req.url));
  return res;
}