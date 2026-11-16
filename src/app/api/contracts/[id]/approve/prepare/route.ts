import { z } from 'zod';
import { authed, jsonResponse } from '@/lib/routeKit';
import { parseBody } from '@/lib/http';
import { prepareApproval } from '@/modules/payments/approval';

export const POST = authed(async ({ request, user, params }) => {
  const { password } = await parseBody(request, z.object({ password: z.string().min(1, 'Ingresa tu clave').max(200) }));
  return jsonResponse(await prepareApproval({ user, contractId: params.id, password }));
}, { roles: ['CLIENTE'] });
