// Middleware de rutas y roles para las rutas API (RS-01, RS-02, RS-38, RNF-02).
//  - RS-01: identificar al usuario antes de cualquier acción privada (el catálogo es público).
//  - RS-02: autenticar (sesión válida) antes de contratar, firmar, pagar o chatear.
//  - Protección CSRF: SameSite=Strict + comprobación de Origin + token X-CSRF-Token en cada escritura.
import { Errors } from '../../lib/http';
import { config } from '../../lib/env';
import { SESSION_COOKIE, parseCookies, validateSessionToken } from './session';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originAllowed(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // clientes no navegador; el token CSRF sigue siendo obligatorio
  try {
    if (origin === config.appOrigin) return true;
    return new URL(origin).host === request.headers.get('host');
  } catch (_) {
    return false;
  }
}

/** Para rutas POST sin sesión (login, registro, recuperación): solo se valida el origen. */
function assertSameOrigin(request) {
  if (!originAllowed(request)) throw Errors.forbidden('Origen no permitido');
}

async function authenticate(request) {
  const cookies = parseCookies(request.headers.get('cookie'));
  return validateSessionToken(cookies[SESSION_COOKIE]);
}

/**
 * Exige sesión válida. Opciones:
 *   roles: lista de roles permitidos (RS-38). Si se omite, cualquier usuario autenticado.
 *   csrf:  comprobar token CSRF en métodos que modifican datos (por defecto true).
 */
async function requireAuth(request, { roles, csrf = true }: any = {}) {
  const auth = await authenticate(request);
  if (!auth) throw Errors.unauthorized();
  if (csrf && !SAFE_METHODS.has(request.method)) {
    if (!originAllowed(request)) throw Errors.forbidden('Origen no permitido');
    const token = request.headers.get('x-csrf-token');
    if (!token || token !== auth.session.csrfToken) throw Errors.forbidden('Token CSRF inválido o ausente');
  }
  if (roles && !roles.includes(auth.user.role)) throw Errors.forbidden();
  return auth;
}

export { authenticate, requireAuth, assertSameOrigin, originAllowed };
