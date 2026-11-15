import { z } from 'zod';
import { authed, jsonResponse } from '@/lib/routeKit';
import { parseBody } from '@/lib/http';
import { signContract } from '@/modules/signing/contractSigning';

// RF-17 / RF-18
export const POST = authed(async ({ request, user, params }) => {
  const b = await parseBody(request, z.object({ nonce: z.string().min(10).max(100), signature: z.string().min(40).max(400), certificateSerial: z.string().min(4).max(100) }));
  return jsonResponse(await signContract({ user, contractId: params.id, ...b }));
}, { roles: ['CLIENTE', 'PROVEEDOR'] });
