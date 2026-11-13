// Envoltorios para las rutas API: manejo uniforme de errores y autenticación (RNF-02).
import { handle, jsonResponse } from './http';
import { requireAuth } from '../modules/auth/guard';

/** Ruta pública (sin sesión). */
function open(fn) {
  return handle(async (request, context) => {
    const params = context && context.params ? await context.params : {};
    return fn({ request, params });
  });
}

/** Ruta privada: exige sesión (RS-01/RS-02), rol permitido (RS-38) y token CSRF en escrituras. */
function authed(fn, opts: any = {}) {
  return handle(async (request, context) => {
    const auth = await requireAuth(request, opts);
    const params = context && context.params ? await context.params : {};
    return fn({ request, params, user: auth.user, session: auth.session });
  });
}

export { open, authed, jsonResponse };
