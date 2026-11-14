import { open, jsonResponse } from '@/lib/routeKit';
import { assertSameOrigin } from '@/modules/auth/guard';
import { register } from '@/modules/auth/service';

// RF-04: registro con validación en cliente y servidor; el nuevo usuario queda como Cliente o Proveedor.
export const POST = open(async ({ request }) => {
  assertSameOrigin(request);
  const body = await request.json().catch(() => ({}));
  const user = await register(body);
  return jsonResponse({ user }, 201);
});
