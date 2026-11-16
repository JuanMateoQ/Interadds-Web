// Pagos: RF-20..22, RNF-22, RNF-24, RS-26 (50 % anticipo + 50 % saldo, idempotencia, tiempo de espera)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './helpers';
import { verifyPaymentIntegrity } from '../src/modules/payments/service';

let w: any;
test.before(async () => { w = await H.world(); });
test.after(() => H.close());

const order = (id, tranche = 'ANTICIPO', password = H.PASSWORD) => w.payments.createOrder({ user: w.client, contractId: id, tranche, password });

test('el anticipo solo se puede pagar con el contrato Vigente (RF-20)', async () => {
  const id = await w.newContract();
  const e = await H.rejects(order(id));
  assert.equal(e.code, 'PAYMENT_NOT_ALLOWED');
  await w.simC.signContract(id);
  assert.equal((await H.rejects(order(id))).code, 'PAYMENT_NOT_ALLOWED'); // aún falta la firma del Proveedor
});

test('el monto sale del contrato (50 %) y la referencia es única por contrato y tramo', async () => {
  const id = await w.advanceTo('VIGENTE');
  const o = await order(id);
  assert.equal(o.amountCents, 5000);
  assert.equal(o.referenceId, `INT-${id}-ANTICIPO`);
  assert.equal(o.status, 'CREADA');
  assert.equal(w.gateway.orders.get(o.orderId).amountCents, 5000);
});

test('RS-26: clave incorrecta → no se crea la orden', async () => {
  const id = await w.advanceTo('VIGENTE');
  const before = w.gateway.stats.createCalls;
  const e = await H.rejects(order(id, 'ANTICIPO', 'Equivocada123'));
  assert.equal(e.code, 'REAUTH_FAILED');
  assert.equal(w.gateway.stats.createCalls, before);
});

test('solo el Cliente del contrato paga (el Proveedor y terceros no)', async () => {
  const id = await w.advanceTo('VIGENTE');
  for (const u of [w.provider, w.other]) {
    const e = await H.rejects(w.payments.createOrder({ user: u, contractId: id, tranche: 'ANTICIPO', password: H.PASSWORD }));
    assert.ok([403, 404].includes(e.status));
  }
});

test('captura: anticipo pagado, recibo con liquidación pendiente, evidencia y sala de chat abierta', async () => {
  const id = await w.advanceTo('VIGENTE');
  const o = await order(id);
  w.gateway.approve(o.orderId);
  const r = await w.payments.captureOrder({ user: w.client, contractId: id, orderId: o.orderId, nonce: o.nonce });
  assert.equal(r.alreadyCaptured, false);
  assert.equal(r.payment.status, 'CAPTURADA');
  assert.equal((await H.prisma.contract.findUnique({ where: { id } })).status, 'ANTICIPO_PAGADO');
  const p = await H.prisma.payment.findFirst({ where: { contractId: id } });
  assert.equal(p.receipt.settlement, 'PENDIENTE_DE_LIQUIDACION');
  assert.ok(verifyPaymentIntegrity(p));
  assert.equal(await H.prisma.evidence.count({ where: { contractId: id, event: 'PAGO' } }), 2); // origen + recepción
  assert.ok(await H.prisma.room.findFirst({ where: { contractId: id } }));
});

test('RNF-22: pago repetido es idempotente (una sola captura real, un solo cobro)', async () => {
  const id = await w.advanceTo('VIGENTE');
  const o = await order(id);
  w.gateway.approve(o.orderId);
  const args: any = { user: w.client, contractId: id, orderId: o.orderId, nonce: o.nonce };
  const before = w.gateway.stats.realCaptures;
  const [a, b] = await Promise.all([w.payments.captureOrder(args), w.payments.captureOrder(args)].map((p) => p.catch((e) => ({ error: e }))));
  const c = await w.payments.captureOrder(args);
  assert.equal(c.alreadyCaptured, true);
  assert.equal(w.gateway.stats.realCaptures - before, 1);
  assert.equal(await H.prisma.payment.count({ where: { contractId: id } }), 1);
  assert.ok(a.payment || b.payment);
  const again = await H.rejects(order(id));
  assert.equal(again.code, 'ALREADY_PAID');
});

test('tiempo de espera de PayPal al crear → queda PENDIENTE y se puede reintentar (RNF-24)', async () => {
  const id = await w.advanceTo('VIGENTE');
  w.gateway.failNext('timeout');
  const e = await H.rejects(order(id));
  assert.ok([502, 504].includes(e.status), String(e.status));
  assert.equal((await H.prisma.payment.findFirst({ where: { contractId: id } })).status, 'PENDIENTE');
  const o = await order(id); // reintento correcto
  assert.equal(o.status, 'CREADA');
  assert.equal(o.attempt, 2);
  assert.equal(await H.prisma.payment.count({ where: { contractId: id } }), 1); // misma fila, no se duplica
});

test('tiempo de espera en la captura → PENDIENTE; el reintento termina el pago sin doble cobro', async () => {
  const id = await w.advanceTo('VIGENTE');
  const o = await order(id);
  w.gateway.approve(o.orderId);
  w.gateway.failNext('timeout');
  const args: any = { user: w.client, contractId: id, orderId: o.orderId, nonce: o.nonce };
  await H.rejects(w.payments.captureOrder(args));
  assert.equal((await H.prisma.payment.findFirst({ where: { contractId: id } })).status, 'PENDIENTE');
  const r = await w.payments.captureOrder(args);
  assert.equal(r.payment.status, 'CAPTURADA');
  assert.equal((await H.prisma.contract.findUnique({ where: { id } })).status, 'ANTICIPO_PAGADO');
});

test('monto capturado distinto al del contrato → FALLIDA y el contrato no avanza', async () => {
  const id = await w.advanceTo('VIGENTE');
  const o = await order(id);
  w.gateway.approve(o.orderId);
  w.gateway.tamperAmount(o.orderId, 100);
  const e = await H.rejects(w.payments.captureOrder({ user: w.client, contractId: id, orderId: o.orderId, nonce: o.nonce }));
  assert.equal(e.code, 'AMOUNT_MISMATCH');
  assert.equal((await H.prisma.payment.findFirst({ where: { contractId: id } })).status, 'FALLIDA');
  assert.equal((await H.prisma.contract.findUnique({ where: { id } })).status, 'VIGENTE');
});

test('nonce incorrecto o orden ajena no capturan', async () => {
  const id = await w.advanceTo('VIGENTE');
  const o = await order(id);
  w.gateway.approve(o.orderId);
  assert.equal((await H.rejects(w.payments.captureOrder({ user: w.client, contractId: id, orderId: o.orderId, nonce: 'otro' }))).code, 'NONCE_INVALID');
  assert.equal((await H.rejects(w.payments.captureOrder({ user: w.client, contractId: id, orderId: 'FAKE-inexistente', nonce: o.nonce }))).status, 404);
});

test('orden no aprobada por el Cliente en PayPal no se captura', async () => {
  const id = await w.advanceTo('VIGENTE');
  const o = await order(id);
  const e = await H.rejects(w.payments.captureOrder({ user: w.client, contractId: id, orderId: o.orderId, nonce: o.nonce }));
  assert.ok(e.status >= 400);
  assert.equal((await H.prisma.contract.findUnique({ where: { id } })).status, 'VIGENTE');
});

test('el saldo se bloquea hasta que el contenido esté aprobado y luego completa el contrato', async () => {
  const id = await w.advanceTo('CONTENIDO_ENTREGADO');
  assert.equal((await H.rejects(order(id, 'SALDO'))).code, 'PAYMENT_NOT_ALLOWED');
  await w.simC.approveContent(id);
  const o = await order(id, 'SALDO');
  assert.equal(o.amountCents, 5000);
  w.gateway.approve(o.orderId);
  await w.payments.captureOrder({ user: w.client, contractId: id, orderId: o.orderId, nonce: o.nonce });
  assert.equal((await H.prisma.contract.findUnique({ where: { id } })).status, 'COMPLETADO');
  const list = await w.payments.listPayments(w.provider, id);
  assert.deepEqual(list.map((p) => p.tranche), ['ANTICIPO', 'SALDO'].slice(0, list.length));
});

test('la base impide dos pagos del mismo tramo (única por contrato y tramo)', async () => {
  const id = await w.advanceTo('ANTICIPO_PAGADO');
  const p = await H.prisma.payment.findFirst({ where: { contractId: id } });
  await H.rejects(H.prisma.payment.create({ data: { contractId: id, payerId: p.payerId, payeeId: p.payeeId, tranche: 'ANTICIPO', amountCents: p.amountCents, currency: p.currency, referenceId: 'otra', status: 'CREADA' } }));
});

test('RS-17/RF-36: manipular un pago guardado rompe su hash de integridad', async () => {
  const id = await w.advanceTo('ANTICIPO_PAGADO');
  const p = await H.prisma.payment.findFirst({ where: { contractId: id } });
  assert.ok(verifyPaymentIntegrity(p));
  assert.equal(verifyPaymentIntegrity({ ...p, amountCents: 1 }), false);
});
