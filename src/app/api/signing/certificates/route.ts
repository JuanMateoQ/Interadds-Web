import { authed, jsonResponse } from '@/lib/routeKit';
import { issueCertificate, listMine } from '@/modules/signing/certificates';

export const GET = authed(async ({ user }) => jsonResponse({ certificates: await listMine(user.id) }), { roles: ['CLIENTE', 'PROVEEDOR'] });
// RF-16: la CA emisora de Interadds firma el certificado a partir de la clave pública (el navegador conserva la privada).
export const POST = authed(async ({ request, user }) => {
  const body = await request.json().catch(() => ({}));
  return jsonResponse(await issueCertificate(user, body), 201);
}, { roles: ['CLIENTE', 'PROVEEDOR'] });
