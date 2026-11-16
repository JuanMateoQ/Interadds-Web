// Pasarela SIMULADA en memoria: solo para desarrollo sin credenciales y para las pruebas automatizadas.
// Imita la idempotencia de PayPal (mismo requestId -> misma respuesta) y permite simular tiempos de espera.
import { GatewayTimeoutError, GatewayError } from './gateway';
import { randomToken } from '../../lib/security/random';

class FakeGateway {
  orders: any;
  createdByRequest: any;
  capturedByRequest: any;
  stats: any;
  failures: any;
  constructor() {
    this.orders = new Map();
    this.createdByRequest = new Map();
    this.capturedByRequest = new Map();
    this.stats = { createCalls: 0, captureCalls: 0, realCaptures: 0 };
    this.failures = [];
  }

  get name() {
    return 'fake';
  }

  /** Programa un fallo para la próxima llamada: 'timeout' | 'error'. */
  failNext(kind) {
    this.failures.push(kind);
  }

  takeFailure() {
    const kind = this.failures.shift();
    if (kind === 'timeout') throw new GatewayTimeoutError();
    if (kind === 'error') throw new GatewayError('Fallo simulado de la pasarela', { code: 'SIMULATED', status: 502 });
  }

  async createOrder({ referenceId, amountCents, currency, requestId }) {
    this.stats.createCalls += 1;
    this.takeFailure();
    if (this.createdByRequest.has(requestId)) return this.createdByRequest.get(requestId);
    const orderId = `FAKE-${randomToken(9)}`;
    this.orders.set(orderId, { orderId, referenceId, amountCents, currency, approved: false, capture: null });
    const res: any = { orderId, status: 'CREATED' };
    this.createdByRequest.set(requestId, res);
    return res;
  }

  /** Simula que el Cliente aprobó el pago en la ventana de PayPal. */
  approve(orderId) {
    const o = this.orders.get(orderId);
    if (!o) throw new GatewayError('Orden inexistente', { code: 'ORDER_NOT_FOUND', status: 404 });
    o.approved = true;
    return o;
  }

  /** Simula una captura con monto distinto (para probar la comprobación de monto). */
  tamperAmount(orderId, amountCents) {
    this.orders.get(orderId).tampered = amountCents;
  }

  async captureOrder({ orderId, requestId }) {
    this.stats.captureCalls += 1;
    this.takeFailure();
    if (this.capturedByRequest.has(requestId)) return this.capturedByRequest.get(requestId);
    const o = this.orders.get(orderId);
    if (!o) throw new GatewayError('Orden inexistente', { code: 'ORDER_NOT_FOUND', status: 404 });
    if (!o.approved) throw new GatewayError('El Cliente aún no aprobó el pago', { code: 'ORDER_NOT_APPROVED', status: 409 });
    if (!o.capture) {
      this.stats.realCaptures += 1;
      o.capture = {
        status: 'COMPLETED',
        captureId: `FAKECAP-${randomToken(9)}`,
        amountCents: o.tampered !== undefined ? o.tampered : o.amountCents,
        currency: o.currency,
        referenceId: o.referenceId,
      };
    }
    this.capturedByRequest.set(requestId, o.capture);
    return o.capture;
  }
}

export { FakeGateway };
