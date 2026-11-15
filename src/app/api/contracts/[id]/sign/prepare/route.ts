import { z } from 'zod';
import { authed, jsonResponse } from '@/lib/routeKit';
import { parseBody } from '@/lib/http';
import { prepareContractSignature } from '@/modules/signing/contractSigning';

// RS-26: se vuelve a pedir la clave antes de firmar.
export const POST = authed(async ({ request, user, params }) => {
  const { password } = await parseBody(request, z.object({ password: z.string().min(1, 'Ingresa tu clave').max(200) }));
  return jsonResponse(await prepareContractSignature({ user, contractId: params.id, password }));
}, { roles: ['CLIENTE', 'PROVEEDOR'] });
