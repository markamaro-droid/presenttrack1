import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/', '/login', '/register', '/reset-password'];

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!,
    { cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (c) => { res = NextResponse.next({ request: req }); c.forEach(({ name, value, options }) => res.cookies.set(name, value, options)); },
    } });
  const { data: { user } } = await supabase.auth.getUser(); // verified against Supabase, not just the cookie
  const path = req.nextUrl.pathname;
  const go = (to: string) => NextResponse.redirect(new URL(to, req.url));

  if (!user) return PUBLIC.includes(path) ? res : go('/login');

  // Server-authoritative baseline gate (RLS-scoped read of the user's own profile).
  const { data: p } = await supabase.from('profiles').select('baseline_completed_at').eq('id', user.id).single();
  const done = !!p?.baseline_completed_at;
  if (['/login', '/register'].includes(path)) return go(done ? '/dashboard' : '/baseline');
  if (!done && !path.startsWith('/baseline') && !path.startsWith('/api')) return go('/baseline');
  if (done && path.startsWith('/baseline')) return go('/dashboard');
  return res;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|models/).*)'] };
