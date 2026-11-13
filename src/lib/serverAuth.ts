import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { validateSessionToken, SESSION_COOKIE } from '@/modules/auth/session';

/** Usuario de la sesión actual en componentes de servidor (o null). */
export async function getCurrentUser() {
  const store = await cookies();
  const auth = await validateSessionToken(store.get(SESSION_COOKIE)?.value);
  return auth ? auth.user : null;
}

/** Exige sesión y, opcionalmente, un rol (RS-38). Redirige al login conservando el destino. */
export async function requirePage({ roles, next = '/inicio' }: any = {}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (roles && !roles.includes(user.role)) redirect('/inicio?aviso=permiso');
  return user;
}
