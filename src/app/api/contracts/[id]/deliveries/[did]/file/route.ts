import { authed } from '@/lib/routeKit';
import { openDelivery } from '@/modules/chat/deliveries';

// Descarga protegida: solo las dos partes, con sesión; nunca un enlace público.
export const GET = authed(async ({ user, params }) => {
  const f = await openDelivery({ user, contractId: params.id, deliveryId: params.did });
  const name = encodeURIComponent(f.name);
  return new Response(f.buffer, {
    headers: {
      'Content-Type': f.mimeType,
      'Content-Disposition': `${f.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${name}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'X-Content-SHA256': f.sha256,
    },
  });
}, { roles: ['CLIENTE', 'PROVEEDOR'] });
