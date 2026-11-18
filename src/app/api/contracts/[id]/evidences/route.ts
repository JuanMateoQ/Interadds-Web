import { authed, jsonResponse } from '@/lib/routeKit';
import { verifyContract } from '@/modules/signing/verify';

// RF-19: verificar la evidencia (certificado, cadena, hash y hora).
export const GET = authed(async ({ user, params }) => jsonResponse(await verifyContract(user, params.id)), { roles: ['CLIENTE', 'PROVEEDOR'] });
