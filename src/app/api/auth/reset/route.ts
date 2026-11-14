import { open, jsonResponse } from '@/lib/routeKit';
import { assertSameOrigin } from '@/modules/auth/guard';
import { resetPassword } from '@/modules/auth/service';

// RS-03 / RS-42: token de un solo uso y con caducidad.
export const POST = open(async ({ request }) => {
  assertSameOrigin(request);
  const body = await request.json().catch(() => ({}));
  await resetPassword(body);
  return jsonResponse({ ok: true });
});
