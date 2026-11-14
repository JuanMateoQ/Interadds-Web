import { authed, jsonResponse } from '@/lib/routeKit';
import { createChallenge } from '@/modules/signing/certificates';

export const POST = authed(async ({ user }) => jsonResponse(await createChallenge(user)), { roles: ['CLIENTE', 'PROVEEDOR'] });
