import { authed, jsonResponse } from '@/lib/routeKit';
import { listContracts, requestContract } from '@/modules/contracts/service';
import { z } from 'zod';
import { parseBody } from '@/lib/http';

// RF-22: historial de contratos propios.
export const GET = authed(async ({ user }) => jsonResponse({ contracts: await listContracts(user) }), { roles: ['CLIENTE', 'PROVEEDOR'] });
// RF-13 / RF-14: solicitar la contratación; el sistema genera el contrato con su hash.
export const POST = authed(async ({ request, user }) => {
  const { serviceId } = await parseBody(request, z.object({ serviceId: z.string().min(1) }));
  const r = await requestContract(user, serviceId);
  return jsonResponse(r, r.existing ? 200 : 201);
}, { roles: ['CLIENTE'] });
