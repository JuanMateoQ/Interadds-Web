import { z } from 'zod';
import { authed, jsonResponse } from '@/lib/routeKit';
import { parseBody } from '@/lib/http';
import { approveContent } from '@/modules/payments/approval';

// RF-27: la aprobación queda como evidencia firmada y desbloquea el pago del saldo.
export const POST = authed(async ({ request, user, params }) => {
  const b = await parseBody(request, z.object({ nonce: z.string().min(10).max(100), signature: z.string().min(40).max(400), certificateSerial: z.string().min(4).max(100) }));
  return jsonResponse(await approveContent({ user, contractId: params.id, ...b }));
}, { roles: ['CLIENTE'] });
