import { authed, jsonResponse } from '@/lib/routeKit';
import { listOwn, createService } from '@/modules/contracts/catalog';

export const GET = authed(async ({ user }) => jsonResponse({ services: await listOwn(user) }), { roles: ['PROVEEDOR'] });
// RF-10: crear servicio con al menos 5 atributos validados
export const POST = authed(async ({ request, user }) => {
  const body = await request.json().catch(() => ({}));
  return jsonResponse({ service: await createService(user, body) }, 201);
}, { roles: ['PROVEEDOR'] });
