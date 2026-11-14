import { open, jsonResponse } from '@/lib/routeKit';
import { authenticate } from '@/modules/auth/guard';
import { hasActiveCertificate } from '@/modules/signing/certificates';

// RS-08: atributos del usuario (rol, estado y certificado vigente). Sin sesión responde user:null.
export const GET = open(async ({ request }) => {
  const auth = await authenticate(request);
  if (!auth) return jsonResponse({ user: null });
  return jsonResponse({
    user: { ...auth.user, hasCertificate: await hasActiveCertificate(auth.user.id) },
    csrfToken: auth.session.csrfToken,
    expiresAt: auth.session.expiresAt,
  });
});
