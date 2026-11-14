import { open, jsonResponse } from '@/lib/routeKit';
import { assertSameOrigin } from '@/modules/auth/guard';
import { requestPasswordReset } from '@/modules/auth/service';

// RF-07: siempre la misma respuesta, exista o no el correo (RS-04). El "correo" sale por consola.
export const POST = open(async ({ request }) => {
  assertSameOrigin(request);
  const body = await request.json().catch(() => ({}));
  await requestPasswordReset(body);
  return jsonResponse({ ok: true, message: 'Si el correo está registrado, te enviamos un enlace para crear una clave nueva.' });
});
