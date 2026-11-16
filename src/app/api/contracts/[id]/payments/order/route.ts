import { z } from 'zod';
import { authed, jsonResponse } from '@/lib/routeKit';
import { parseBody } from '@/lib/http';
import { getPaymentService } from '@/modules/payments/service';

// RF-20 / RF-28: el servidor calcula el monto desde el contrato y crea la orden en PayPal (Sandbox).
export const POST = authed(async ({ request, user, params }) => {
  const b = await parseBody(request, z.object({ tranche: z.enum(['ANTICIPO', 'SALDO']), password: z.string().min(1, 'Ingresa tu clave').max(200) }));
  return jsonResponse(await getPaymentService().createOrder({ user, contractId: params.id, ...b }));
}, { roles: ['CLIENTE'] });
