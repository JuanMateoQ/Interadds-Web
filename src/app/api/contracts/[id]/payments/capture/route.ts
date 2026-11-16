import { z } from 'zod';
import { authed, jsonResponse } from '@/lib/routeKit';
import { parseBody } from '@/lib/http';
import { getPaymentService } from '@/modules/payments/service';

// El Cliente aprobó el pago en PayPal; el servidor captura la orden.
export const POST = authed(async ({ request, user, params }) => {
  const b = await parseBody(request, z.object({ orderId: z.string().min(5).max(100), nonce: z.string().min(10).max(100) }));
  return jsonResponse(await getPaymentService().captureOrder({ user, contractId: params.id, ...b }));
}, { roles: ['CLIENTE'] });
