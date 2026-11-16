// PayPal Orders v2 llamado SOLO desde el servidor y SOLO en Sandbox durante el semestre (RNF-24).
// Las credenciales salen de variables de entorno (RS-11). Interadds no recibe ni guarda datos de tarjeta:
// el Cliente aprueba el pago en PayPal. Tiempo de espera de 10 s: si PayPal no responde, el pago queda pendiente.
import { config } from '../../lib/env';
import { toDecimalString } from '../../lib/money';
import { GatewayTimeoutError, GatewayError } from './gateway';

class PayPalGateway {
  clientId: any;
  clientSecret: any;
  apiBase: any;
  timeoutMs: any;
  fetchImpl: any;
  env: any;
  token: any;
  tokenExp: any;
  constructor(opts: any = {}) {
    this.clientId = opts.clientId ?? config.payments.clientId;
    this.clientSecret = opts.clientSecret ?? config.payments.clientSecret;
    this.apiBase = (opts.apiBase ?? config.payments.apiBase).replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? config.payments.timeoutMs;
    this.fetchImpl = opts.fetchImpl || globalThis.fetch;
    this.env = opts.env ?? config.payments.env;
    this.token = null;
    this.tokenExp = 0;
  }

  get name() {
    return 'paypal-sandbox';
  }

  assertSandbox() {
    // Cobrar dinero real queda como decisión posterior del equipo (supuesto 1 del documento de requisitos)
    if (this.env !== 'sandbox' || !/sandbox/i.test(this.apiBase)) {
      throw new GatewayError('Durante el semestre PayPal solo se usa en Sandbox (PAYPAL_ENV=sandbox)', { code: 'SANDBOX_ONLY', status: 500 });
    }
    if (!this.clientId || !this.clientSecret) {
      throw new GatewayError('Faltan PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET en el .env', { code: 'NOT_CONFIGURED', status: 500 });
    }
  }

  async http(url, init) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: ctrl.signal });
    } catch (e) {
      if (e && (e.name === 'AbortError' || e.code === 'ABORT_ERR')) throw new GatewayTimeoutError();
      throw new GatewayError('No se pudo contactar a PayPal', { code: 'NETWORK', status: 502 });
    } finally {
      clearTimeout(timer);
    }
  }

  async accessToken() {
    this.assertSandbox();
    if (this.token && Date.now() < this.tokenExp - 60000) return this.token;
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await this.http(`${this.apiBase}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) throw new GatewayError('PayPal rechazó las credenciales', { code: 'AUTH_FAILED', status: 502 });
    this.token = json.access_token;
    this.tokenExp = Date.now() + (json.expires_in || 300) * 1000;
    return this.token;
  }

  async createOrder({ referenceId, amountCents, currency, description, requestId }) {
    const token = await this.accessToken();
    const res = await this.http(`${this.apiBase}/v2/checkout/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': requestId, Prefer: 'return=representation' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: referenceId,
          custom_id: referenceId,
          invoice_id: referenceId,
          description: String(description || 'Interadds').slice(0, 127),
          amount: { currency_code: currency, value: toDecimalString(amountCents) },
        }],
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.id) throw new GatewayError('PayPal no pudo crear la orden', { code: 'CREATE_FAILED', status: 502, details: json.name || null });
    return { orderId: json.id, status: json.status };
  }

  async getOrder(orderId) {
    const token = await this.accessToken();
    const res = await this.http(`${this.apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new GatewayError('PayPal no encontró la orden', { code: 'ORDER_NOT_FOUND', status: 502 });
    return json;
  }

  async captureOrder({ orderId, requestId }) {
    const token = await this.accessToken();
    const res = await this.http(`${this.apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': requestId, Prefer: 'return=representation' },
      body: '{}',
    });
    let json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const issue = json && json.details && json.details[0] && json.details[0].issue;
      if (issue === 'ORDER_ALREADY_CAPTURED') {
        json = await this.getOrder(orderId); // idempotencia: devolvemos la captura existente
      } else if (issue === 'ORDER_NOT_APPROVED') {
        throw new GatewayError('El Cliente aún no aprobó el pago en PayPal', { code: 'ORDER_NOT_APPROVED', status: 409 });
      } else {
        throw new GatewayError('PayPal rechazó la captura', { code: 'CAPTURE_FAILED', status: 502, details: issue || json.name || null });
      }
    }
    return PayPalGateway.parseCapture(json);
  }

  static parseCapture(json) {
    const unit = (json.purchase_units && json.purchase_units[0]) || {};
    const capture = unit.payments && unit.payments.captures && unit.payments.captures[0];
    if (!capture) return { status: json.status || 'UNKNOWN', captureId: null, amountCents: null, currency: null, referenceId: unit.reference_id || null };
    return {
      status: capture.status === 'COMPLETED' ? 'COMPLETED' : capture.status || json.status,
      captureId: capture.id,
      amountCents: Math.round(parseFloat(capture.amount.value) * 100),
      currency: capture.amount.currency_code,
      referenceId: unit.custom_id || unit.reference_id || null,
    };
  }
}

export { PayPalGateway };
