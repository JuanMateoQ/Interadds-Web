import { open, jsonResponse } from '@/lib/routeKit';
import { assertSameOrigin } from '@/modules/auth/guard';
import { login } from '@/modules/auth/service';
import { sessionCookie } from '@/modules/auth/session';

// RF-05 / RS-04: login con error genérico. La sesión viaja en una cookie HttpOnly + SameSite=Strict.
export const POST = open(async ({ request }) => {
  assertSameOrigin(request);
  const body = await request.json().catch(() => ({}));
  const { user, session } = await login(body, { userAgent: request.headers.get('user-agent') });
  return jsonResponse({ user, csrfToken: session.csrfToken }, 200, { 'Set-Cookie': sessionCookie(session.token, session.expiresAt) });
});
