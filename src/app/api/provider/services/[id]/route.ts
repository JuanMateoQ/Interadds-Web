import { authed, jsonResponse } from '@/lib/routeKit';
import { getOwn, updateService, deleteService } from '@/modules/contracts/catalog';

const roles: any = ['PROVEEDOR'];
export const GET = authed(async ({ user, params }) => jsonResponse({ service: await getOwn(user, params.id) }), { roles });
// RF-11
export const PUT = authed(async ({ request, user, params }) => {
  const body = await request.json().catch(() => ({}));
  return jsonResponse({ service: await updateService(user, params.id, body) });
}, { roles });
// RF-12: eliminar con confirmación; si hay contratos activos solo se pausa
export const DELETE = authed(async ({ request, user, params }) => {
  const body = await request.json().catch(() => ({}));
  return jsonResponse(await deleteService(user, params.id, body));
}, { roles });
