import { authed, jsonResponse } from '@/lib/routeKit';
import { getPaymentService } from '@/modules/payments/service';

export const GET = authed(async ({ user, params }) => jsonResponse({ payments: await getPaymentService().listPayments(user, params.id) }), { roles: ['CLIENTE', 'PROVEEDOR'] });
