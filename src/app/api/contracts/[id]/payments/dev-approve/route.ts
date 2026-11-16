import { z } from 'zod';
import { authed, jsonResponse } from '@/lib/routeKit';
import { parseBody } from '@/lib/http';
import { getPaymentService } from '@/modules/payments/service';

// SOLO con PAYMENT_GATEWAY=fake y fuera de producción: simula la aprobación en PayPal.
export const POST = authed(async ({ request, user, params }) => {
  const b = await parseBody(request, z.object({ orderId: z.string().min(5).max(100) }));
  return jsonResponse(await getPaymentService().devApprove({ user, contractId: params.id, ...b }));
}, { roles: ['CLIENTE'] });
