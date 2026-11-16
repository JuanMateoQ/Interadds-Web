import { authed, jsonResponse } from '@/lib/routeKit';
import { getContractWorkspace } from '@/modules/contractView';

export const GET = authed(async ({ user, params }) => jsonResponse({ contract: await getContractWorkspace(user, params.id) }), { roles: ['CLIENTE', 'PROVEEDOR'] });
