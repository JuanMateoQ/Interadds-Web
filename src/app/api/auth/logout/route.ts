import { authed, jsonResponse } from '@/lib/routeKit';
import { logout } from '@/modules/auth/service';
import { SESSION_COOKIE, parseCookies, clearSessionCookie } from '@/modules/auth/session';
import { closeSessionSockets } from '@/modules/chat/socket';

// RF-06 / RS-37: cierre de sesión iniciado por el usuario; invalida la sesión y cierra sus sockets.
export const POST = authed(async ({ request }) => {
  const token = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE];
  const sessionId = await logout(token);
  closeSessionSockets(sessionId);
  return jsonResponse({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
});
