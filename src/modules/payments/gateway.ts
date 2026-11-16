// RNF-24: la pasarela de pago queda detrás de una INTERFAZ PROPIA para poder cambiarla (por ejemplo por
// Payphone) sin tocar el flujo. Cualquier pasarela debe implementar:
//
//   name                                  -> string identificador
//   createOrder({ referenceId, amountCents, currency, description, requestId })
//        -> { orderId, status }
//   captureOrder({ orderId, requestId })
//        -> { status: 'COMPLETED'|..., captureId, amountCents, currency, referenceId }
//
// `requestId` hace idempotente la llamada (en PayPal viaja en el encabezado PayPal-Request-Id).
import { config } from '../../lib/env';

class GatewayTimeoutError extends Error {
  name: any;
  constructor(message = 'La pasarela de pago no respondió a tiempo') {
    super(message);
    this.name = 'GatewayTimeoutError';
  }
}

class GatewayError extends Error {
  name: any;
  code: any;
  status: any;
  details: any;
  constructor(message, { code = 'GATEWAY_ERROR', status = 502, details = null }: any = {}) {
    super(message);
    this.name = 'GatewayError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Selecciona la pasarela según PAYMENT_GATEWAY (paypal | fake). */
function getGateway() {
  const g = globalThis;
  const wanted = config.payments.gateway;
  if (wanted === 'fake') {
    if (config.isProd) throw new Error('La pasarela simulada (fake) no se permite en producción');
    const { FakeGateway } = require('./fakeGateway');
    return g.__interaddsFakeGateway || (g.__interaddsFakeGateway = new FakeGateway());
  }
  if (wanted === 'paypal') {
    const { PayPalGateway } = require('./paypal');
    if (!g.__interaddsPayPal) g.__interaddsPayPal = new PayPalGateway();
    return g.__interaddsPayPal;
  }
  throw new Error(`PAYMENT_GATEWAY desconocida: ${wanted}`);
}

export { GatewayTimeoutError, GatewayError, getGateway };
