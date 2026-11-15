import { authed, jsonResponse } from '@/lib/routeKit';
import { viewContract } from '@/modules/contracts/service';

// RF-37: el texto del contrato solo se entrega por POST autenticado (sin URL directa copiable).
export const POST = authed(async ({ user, params }) => jsonResponse(await viewContract(user, params.id)), { roles: ['CLIENTE', 'PROVEEDOR'] });
