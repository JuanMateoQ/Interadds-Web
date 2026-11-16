// Módulo de Pagos (Mateo Quisilema): anticipo y saldo del 50 % con PayPal Orders v2 desde el servidor.
//   RF-20 (anticipo con contrato Vigente), RF-21 (aviso y comprobante), RF-22 (historial), RF-28 (saldo),
//   RNF-22 (idempotencia y estados), RNF-24 (PayPal Sandbox detrás de una interfaz propia), RS-26 (re-autenticar).
import { prisma } from '../../lib/db';
import { config } from '../../lib/env';
import { ApiError, Errors } from '../../lib/http';
import { randomNonce, randomReceiptNumber } from '../../lib/security/random';
import { hashRecord } from '../signing/hash';
import * as contracts from '../contracts/api';
import * as policy from '../contracts/policy';
import { assertContractIntegrity } from '../contracts/integrity';
import * as auth from '../auth/service';
import * as evidence from '../signing/evidence';
import * as rooms from '../chat/rooms';
import { notify } from '../chat/notifications';
import { getGateway, GatewayTimeoutError, GatewayError } from './gateway';
import * as machine from './stateMachine';

const TRANCHES: any = ['ANTICIPO', 'SALDO'];
const REQUIRED_STATE: any = { ANTICIPO: 'VIGENTE', SALDO: 'CONTENIDO_APROBADO' };
const NEXT_STATE: any = { ANTICIPO: 'ANTICIPO_PAGADO', SALDO: 'COMPLETADO' };
const NOT_ALLOWED_MSG: any = {
  ANTICIPO: 'El anticipo solo se puede pagar con el contrato vigente (las dos firmas ya puestas)',
  SALDO: 'El saldo se habilita cuando apruebas el contenido entregado',
};

/** RS-20: hash de integridad del pago capturado (se vuelve a comprobar al leerlo). */
function paymentIntegrityHash(p) {
  return hashRecord({
    contractId: p.contractId, tranche: p.tranche, amountCents: p.amountCents, currency: p.currency,
    paypalOrderId: p.paypalOrderId, paypalCaptureId: p.paypalCaptureId, payerId: p.payerId, payeeId: p.payeeId, status: 'CAPTURADA',
  });
}
function verifyPaymentIntegrity(p) {
  return p.status === 'CAPTURADA' && !!p.integrityHash && paymentIntegrityHash(p) === p.integrityHash;
}

function paymentOut(p) {
  return {
    id: p.id, tranche: p.tranche, amountCents: p.amountCents, currency: p.currency, status: p.status,
    referenceId: p.referenceId, paypalOrderId: p.paypalOrderId, paypalCaptureId: p.paypalCaptureId,
    receiptNumber: p.receiptNumber, receipt: p.receipt, settlement: p.settlement, failureReason: p.failureReason,
    integrityOk: p.status === 'CAPTURADA' ? verifyPaymentIntegrity(p) : null,
    capturedAt: p.capturedAt, createdAt: p.createdAt,
  };
}

function mapGatewayError(e) {
  if (e instanceof GatewayTimeoutError) {
    return new ApiError(504, 'GATEWAY_TIMEOUT', 'PayPal no respondió a tiempo. El pago quedó pendiente: puedes reintentar sin riesgo de cobro doble.');
  }
  if (e instanceof GatewayError) return new ApiError(e.status === 409 ? 409 : 502, e.code, e.message);
  return e;
}

function createPaymentService({ gateway }: any = {}) {
  const gw = () => gateway || getGateway();

  /**
   * Pasos 1 y 2 del pago: re-autenticar (RS-26), calcular el monto DESDE EL CONTRATO (el navegador no lo envía) y
   * crear la orden en PayPal con una referencia propia única por contrato y tramo.
   */
  async function createOrder({ user, contractId, tranche, password }) {
    policy.assertCan(user, 'payment:create');
    if (!TRANCHES.includes(tranche)) throw Errors.badRequest('Tramo de pago inválido', { tranche: 'Usa ANTICIPO o SALDO' });
    const contract = await contracts.getContractForParty(user, contractId);
    if (!policy.isClientOf(user, contract)) throw Errors.forbidden('Solo el Cliente del contrato paga');
    assertContractIntegrity(contract);
    await auth.reauthenticate(user.id, password);

    const key: any = { contractId_tranche: { contractId: contract.id, tranche } };
    const existing = await prisma.payment.findUnique({ where: key });
    if (existing && existing.status === 'CAPTURADA') throw new ApiError(409, 'ALREADY_PAID', 'Este tramo ya fue pagado');
    if (contract.status !== REQUIRED_STATE[tranche]) throw new ApiError(409, 'PAYMENT_NOT_ALLOWED', NOT_ALLOWED_MSG[tranche]);

    const amountCents = tranche === 'ANTICIPO' ? contract.anticipoCents : contract.saldoCents;
    const referenceId = `INT-${contract.id}-${tranche}`;
    const nonce = randomNonce(); // RS-07: generado por el sistema
    const ttl = config.payments.orderTtlHours * 3600 * 1000;
    const fresh = existing && existing.status === 'CREADA' && existing.paypalOrderId && existing.orderCreatedAt && Date.now() - existing.orderCreatedAt.getTime() < ttl;

    if (fresh) {
      // Misma orden vigente: no se crea otra, solo se renueva el nonce de este intento
      await prisma.payment.update({ where: { id: existing.id }, data: { nonce } });
      return orderOut(existing, nonce, gw().name);
    }

    const attempt = existing ? existing.attempt + 1 : 1;
    let order: any;
    try {
      order = await gw().createOrder({
        referenceId, amountCents, currency: contract.currency,
        description: `Interadds ${tranche === 'ANTICIPO' ? 'anticipo 50%' : 'saldo 50%'} - ${contract.serviceTitle}`,
        requestId: `${referenceId}:${attempt}`, // idempotencia hacia PayPal (PayPal-Request-Id)
      });
    } catch (e) {
      await markPending(existing, { contract, tranche, amountCents, referenceId, attempt, reason: e instanceof GatewayTimeoutError ? 'timeout' : e.message });
      throw mapGatewayError(e);
    }

    const data: any = { status: 'CREADA', paypalOrderId: order.orderId, attempt, nonce, orderCreatedAt: new Date(), failureReason: null, gatewayName: gw().name };
    try {
      let saved: any;
      if (existing) {
        machine.assertTransition(existing.status, 'CREADA');
        saved = await prisma.payment.update({ where: { id: existing.id }, data });
      } else {
        saved = await prisma.payment.create({
          data: { contractId: contract.id, payerId: contract.clientId, payeeId: contract.providerId, tranche, amountCents, currency: contract.currency, referenceId, ...data },
        });
      }
      return orderOut(saved, nonce, gw().name);
    } catch (e) {
      if (e && e.code === 'P2002') throw new ApiError(409, 'PAYMENT_IN_PROGRESS', 'Ya hay un pago en proceso para este tramo, intenta de nuevo');
      throw e;
    }
  }

  async function markPending(existing, { contract, tranche, amountCents, referenceId, attempt, reason }) {
    try {
      if (existing) {
        if (machine.canTransition(existing.status, 'PENDIENTE')) {
          await prisma.payment.update({ where: { id: existing.id }, data: { status: 'PENDIENTE', failureReason: reason, attempt } });
        }
      } else {
        await prisma.payment.create({
          data: { contractId: contract.id, payerId: contract.clientId, payeeId: contract.providerId, tranche, amountCents, currency: contract.currency, referenceId, attempt, status: 'PENDIENTE', failureReason: reason, gatewayName: gw().name },
        });
      }
    } catch (_) {
      /* el registro del pendiente es de mejor esfuerzo */
    }
  }

  /**
   * Pasos 4 y 5: el servidor captura la orden aprobada, comprueba monto y moneda contra el contrato, guarda el
   * recibo y las evidencias, avisa al Proveedor y, si es el anticipo, abre el chat. Repetir la captura es inofensivo.
   */
  async function captureOrder({ user, contractId, orderId, nonce }) {
    policy.assertCan(user, 'payment:create');
    const contract = await contracts.getContractForParty(user, contractId);
    if (!policy.isClientOf(user, contract)) throw Errors.forbidden('Solo el Cliente del contrato paga');
    const payment = await prisma.payment.findFirst({ where: { contractId: contract.id, paypalOrderId: String(orderId || '') } });
    if (!payment) throw Errors.notFound('No existe una orden de pago con ese identificador');

    // RNF-22: pago repetido -> se devuelve el recibo existente SIN volver a llamar a PayPal ni cobrar de nuevo
    if (payment.status === 'CAPTURADA') return { alreadyCaptured: true, payment: paymentOut(payment) };

    if (!nonce || !payment.nonce || nonce !== payment.nonce) {
      throw new ApiError(409, 'NONCE_INVALID', 'La confirmación del pago no es válida o ya se usó. Vuelve a pulsar «Pagar».');
    }
    if (contract.status !== REQUIRED_STATE[payment.tranche]) throw new ApiError(409, 'PAYMENT_NOT_ALLOWED', NOT_ALLOWED_MSG[payment.tranche]);

    let result: any;
    try {
      result = await gw().captureOrder({ orderId: payment.paypalOrderId, requestId: `capture:${payment.paypalOrderId}` });
    } catch (e) {
      if (e instanceof GatewayTimeoutError) {
        await prisma.payment.updateMany({ where: { id: payment.id, status: 'CREADA' }, data: { status: 'PENDIENTE', failureReason: 'timeout en la captura' } });
      }
      throw mapGatewayError(e);
    }

    if (result.status !== 'COMPLETED') {
      await prisma.payment.updateMany({ where: { id: payment.id, status: 'CREADA' }, data: { status: 'PENDIENTE', failureReason: `captura ${result.status}` } });
      throw new ApiError(409, 'PAYMENT_NOT_COMPLETED', 'PayPal aún no confirma el pago. Quedó pendiente.');
    }
    // El monto, la moneda y la referencia capturados deben coincidir con el contrato (RF-20 paso 4)
    if (result.amountCents !== payment.amountCents || result.currency !== payment.currency || (result.referenceId && result.referenceId !== payment.referenceId)) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FALLIDA', failureReason: 'El monto, la moneda o la referencia no coinciden con el contrato' } });
      throw new ApiError(502, 'AMOUNT_MISMATCH', 'El pago capturado no coincide con el contrato. Se marcó como fallido para revisión.');
    }

    const capturedAt = new Date();
    const payer: any = { id: contract.clientId, name: contract.clientName, email: contract.clientEmail };
    const payee: any = { id: contract.providerId, name: contract.providerName };
    const outcome = await prisma.$transaction(async (tx) => {
      const receiptNumber = randomReceiptNumber();
      const base: any = { ...payment, paypalCaptureId: result.captureId, status: 'CAPTURADA' };
      const receipt: any = {
        number: receiptNumber, contractId: contract.id, serviceTitle: contract.serviceTitle, tranche: payment.tranche,
        amountCents: payment.amountCents, currency: payment.currency, paypalOrderId: payment.paypalOrderId, paypalCaptureId: result.captureId,
        referenceId: payment.referenceId, payer, payee, capturedAt: capturedAt.toISOString(), gateway: payment.gatewayName,
        settlement: 'PENDIENTE_DE_LIQUIDACION', note: 'El pago al Proveedor se registra como pendiente de liquidación (no se transfiere en el Bimestre 1).',
      };
      const claim = await tx.payment.updateMany({
        where: { id: payment.id, status: { in: ['CREADA', 'PENDIENTE'] } },
        data: { status: 'CAPTURADA', paypalCaptureId: result.captureId, nonce: null, capturedAt, receiptNumber, receipt, integrityHash: paymentIntegrityHash(base), failureReason: null },
      });
      if (claim.count !== 1) return { raced: true };

      await contracts.advanceStatus(contract.id, NEXT_STATE[payment.tranche], { actorId: user.id, reason: `Pago del ${payment.tranche === 'ANTICIPO' ? 'anticipo' : 'saldo'} capturado`, tx });
      // RS-16 / RS-17: evidencia de origen (orden creada tras re-autenticar, con nonce, y captura) y de recepción
      await evidence.recordOrigin({
        contractId: contract.id, event: 'PAGO', ref: payment.tranche, actorId: user.id, subjectHash: contract.textHash,
        payload: ['interadds-payment-v1', contract.id, payment.tranche, payment.paypalOrderId, result.captureId, String(payment.amountCents), payment.currency, nonce].join('\n'),
        nonce, meta: { orderId: payment.paypalOrderId, captureId: result.captureId, amountCents: payment.amountCents, currency: payment.currency, reauthenticated: true },
      }, tx);
      await evidence.recordReceipt({
        contractId: contract.id, event: 'PAGO', ref: payment.tranche, recipientId: contract.providerId, subjectHash: contract.textHash,
        meta: { receiptNumber, captureId: result.captureId, description: 'Comprobante de PayPal entregado al Proveedor' },
      }, tx);
      if (payment.tranche === 'ANTICIPO') await rooms.openContractRoom(contract.id, tx); // RF-23: se abre la sala
      return { raced: false };
    });

    const fresh = await prisma.payment.findUnique({ where: { id: payment.id } });
    if (outcome.raced) return { alreadyCaptured: true, payment: paymentOut(fresh) };

    const label = payment.tranche === 'ANTICIPO' ? 'anticipo' : 'saldo';
    await notify({
      userId: contract.providerId, type: payment.tranche === 'ANTICIPO' ? 'ANTICIPO_RECIBIDO' : 'SALDO_PAGADO', contractId: contract.id,
      title: payment.tranche === 'ANTICIPO' ? 'Anticipo recibido' : 'Saldo pagado',
      body: `${contract.clientName} pagó el ${label} del 50 % de «${contract.serviceTitle}» (captura ${result.captureId}).${payment.tranche === 'ANTICIPO' ? ' El chat del contrato ya está abierto.' : ' El contrato quedó completado.'}`,
    });
    return { alreadyCaptured: false, payment: paymentOut(fresh) };
  }

  /** RF-22: historial y estado de los pagos propios (las dos partes). */
  async function listPayments(user, contractId) {
    policy.assertCan(user, 'payment:read');
    const contract = await contracts.getContractForParty(user, contractId);
    const rows = await prisma.payment.findMany({ where: { contractId: contract.id }, orderBy: { createdAt: 'asc' } });
    return rows.map(paymentOut);
  }

  /** Solo con la pasarela simulada y fuera de producción: aprueba la orden como lo haría el Cliente en PayPal. */
  async function devApprove({ user, contractId, orderId }) {
    const g = gw();
    if (g.name !== 'fake' || config.isProd) throw Errors.notFound();
    const contract = await contracts.getContractForParty(user, contractId);
    if (!policy.isClientOf(user, contract)) throw Errors.forbidden();
    const payment = await prisma.payment.findFirst({ where: { contractId: contract.id, paypalOrderId: String(orderId || '') } });
    if (!payment) throw Errors.notFound('Orden no encontrada');
    g.approve(payment.paypalOrderId);
    return { ok: true };
  }

  return { createOrder, captureOrder, listPayments, devApprove };
}

function orderOut(payment, nonce, gatewayName) {
  return {
    paymentId: payment.id, orderId: payment.paypalOrderId, nonce, tranche: payment.tranche, amountCents: payment.amountCents,
    currency: payment.currency, referenceId: payment.referenceId, attempt: payment.attempt, status: payment.status, gateway: gatewayName,
  };
}

let defaultService: any = null;
/** Servicio con la pasarela configurada por entorno (PayPal Sandbox o simulada). */
function getPaymentService() {
  if (!defaultService) defaultService = createPaymentService();
  return defaultService;
}

export { createPaymentService, getPaymentService, paymentIntegrityHash, verifyPaymentIntegrity, paymentOut };
