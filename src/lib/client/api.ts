'use client';
// Cliente HTTP del navegador (RNF-02, RNF-04): envía la cookie de sesión, adjunta el token CSRF en cada escritura
// y convierte los errores del servidor en excepciones con mensaje y detalles por campo.
let csrfToken: any = null;

export class ApiClientError extends Error {
  status: any;
  code: any;
  details: any;
  constructor(status, error) {
    super((error && error.message) || 'Ocurrió un error inesperado');
    this.status = status;
    this.code = error && error.code;
    this.details = (error && error.details) || {};
  }
}

export function setCsrfToken(token) {
  csrfToken = token || null;
}

async function ensureCsrf() {
  if (csrfToken) return csrfToken;
  const res = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  csrfToken = data.csrfToken || null;
  return csrfToken;
}

export async function api(path, { method = 'GET', body, form, raw }: any = {}) {
  const headers: any = {};
  const opts: any = { method, credentials: 'same-origin', headers, cache: 'no-store' };
  if (method !== 'GET') {
    const t = await ensureCsrf();
    if (t) headers['X-CSRF-Token'] = t;
  }
  if (form) opts.body = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 403 && data.error && /CSRF/i.test(data.error.message || '')) csrfToken = null;
    throw new ApiClientError(res.status, data.error);
  }
  return data;
}

export const money = (cents, currency = 'USD') =>
  new Intl.NumberFormat('es-EC', { style: 'currency', currency }).format(Number(cents) / 100);

export const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
