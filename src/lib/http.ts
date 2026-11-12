// Utilidades HTTP para las rutas API: errores tipados, respuestas JSON y validación de cuerpo (RNF-01, RNF-02).
import { ZodError } from 'zod';

class ApiError extends Error {
  name: any;
  status: any;
  code: any;
  details: any;
  constructor(status: number, code: string, message?: string, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const Errors: any = {
  badRequest: (msg = 'Solicitud inválida', details?: any) => new ApiError(400, 'BAD_REQUEST', msg, details),
  unauthorized: (msg = 'Debes iniciar sesión') => new ApiError(401, 'UNAUTHORIZED', msg),
  forbidden: (msg = 'No tienes permiso para esta acción') => new ApiError(403, 'FORBIDDEN', msg),
  notFound: (msg = 'No encontrado') => new ApiError(404, 'NOT_FOUND', msg),
  conflict: (code?: string, msg?: string, details?: any) => new ApiError(409, code || 'CONFLICT', msg, details),
};

function zodDetails(err) {
  const fields: any = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function jsonResponse(data, status = 200, headers: any = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

function errorToResponse(err) {
  if (err instanceof ApiError) {
    return jsonResponse({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
  }
  if (err instanceof ZodError) {
    return jsonResponse({ error: { code: 'VALIDATION', message: 'Revisa los datos ingresados', details: zodDetails(err) } }, 422);
  }
  // Errores de integridad lanzados por los triggers de la base (INVALID_TRANSITION, CONTRACT_IMMUTABLE)
  const msg = String((err && err.message) || '');
  if (/INVALID_TRANSITION|CONTRACT_IMMUTABLE/.test(msg)) {
    return jsonResponse({ error: { code: 'INTEGRITY', message: 'Operación no permitida por las reglas del contrato' } }, 409);
  }
  console.error('[error]', err);
  return jsonResponse({ error: { code: 'INTERNAL', message: 'Ocurrió un error inesperado' } }, 500);
}

/** Envuelve un manejador de ruta: cualquier excepción se convierte en respuesta JSON controlada. */
function handle(fn) {
  return async (request, ctx) => {
    try {
      return await fn(request, ctx);
    } catch (err) {
      return errorToResponse(err);
    }
  };
}

/** Lee y valida el cuerpo JSON con un esquema Zod (validación SIEMPRE en servidor, RNF-01). */
async function parseBody(request, schema) {
  let raw: any;
  try {
    raw = await request.json();
  } catch (_) {
    throw Errors.badRequest('El cuerpo debe ser JSON válido');
  }
  return schema.parse(raw);
}

function parseQuery(request, schema) {
  const url = new URL(request.url);
  const obj: any = {};
  for (const [k, v] of url.searchParams.entries()) obj[k] = v;
  return schema.parse(obj);
}

/** Solo se aceptan rutas internas como destino de redirección (evita open redirect). */
function safeNext(next, fallback = '/inicio') {
  if (typeof next !== 'string') return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}

export { ApiError, Errors, jsonResponse, errorToResponse, handle, parseBody, parseQuery, safeNext };
