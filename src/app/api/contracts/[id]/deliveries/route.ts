import { authed, jsonResponse } from '@/lib/routeKit';
import { Errors } from '@/lib/http';
import { listDeliveries, saveDelivery } from '@/modules/chat/deliveries';

export const GET = authed(async ({ user, params }) => jsonResponse({ deliveries: await listDeliveries(user, params.id) }), { roles: ['CLIENTE', 'PROVEEDOR'] });

// RF-26: subir contenido ligado al contrato (tipo, tamaño y firma del archivo validados; se calcula su hash).
export const POST = authed(async ({ request, user, params }) => {
  const form = await request.formData().catch(() => null);
  const file = form && form.get('file');
  if (!file || typeof file === 'string') throw Errors.badRequest('Adjunta un archivo en el campo "file"');
  const buffer = Buffer.from(await file.arrayBuffer());
  const delivery = await saveDelivery({ user, contractId: params.id, file: { name: file.name, type: file.type, buffer } });
  return jsonResponse({ delivery }, 201);
}, { roles: ['PROVEEDOR'] });
