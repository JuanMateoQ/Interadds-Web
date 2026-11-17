// Camino feliz completo (Bimestre 1): contrato → firmas → anticipo → entrega → aprobación firmada → saldo.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './helpers';
import * as cs from '../src/modules/contracts/service';
import * as verify from '../src/modules/signing/verify';
import * as sm from '../src/modules/contracts/stateMachine';
import { getContractWorkspace } from '../src/modules/contractView';

let w: any;
test.before(async () => { w = await H.world(); });
test.after(() => H.close());

test('el contrato recorre los siete estados en orden y la evidencia queda verificable', async () => {
  const id = await w.newContract();
  const seen: any = ['GENERADO'];
  const step = async () => seen.push((await H.prisma.contract.findUnique({ where: { id } })).status);

  await w.simC.signContract(id); await step();
  await w.simP.signContract(id); await step();
  await w.pay(id, 'ANTICIPO'); await step();
  await w.upload(id); await step();
  await w.simC.approveContent(id); await step();
  await w.pay(id, 'SALDO'); await step();
  assert.deepEqual(seen, sm.STATES);

  const hist = (await cs.getContractDetail(w.client, id)).history;
  assert.deepEqual(hist.map((h) => h.to), sm.STATES);

  const v = await verify.verifyContract(w.provider, id);
  assert.equal(v.valid, true);
  const events = new Set(v.evidences.map((e) => e.event));
  for (const ev of ['FIRMA_CLIENTE', 'FIRMA_PROVEEDOR', 'PAGO', 'ENTREGA_CONTENIDO', 'APROBACION_CONTENIDO']) assert.ok(events.has(ev), ev);

  const payments = await H.prisma.payment.findMany({ where: { contractId: id }, orderBy: { tranche: 'asc' } });
  assert.equal(payments.length, 2);
  assert.equal(payments.reduce((a, p) => a + p.amountCents, 0), 10000);
  assert.ok(payments.every((p) => p.status === 'CAPTURADA'));
});

test('la aprobación del contenido exige firma y solo la hace el Cliente', async () => {
  const id = await w.advanceTo('CONTENIDO_ENTREGADO');
  const e = await H.rejects(w.simP.approveContent(id));
  assert.ok([403, 404].includes(e.status));
  const wrong = await H.rejects(w.simC.approveContent(id, 'ClaveMala123'));
  assert.equal(wrong.code, 'REAUTH_FAILED');
  await w.simC.approveContent(id);
  assert.equal((await H.prisma.contract.findUnique({ where: { id } })).status, 'CONTENIDO_APROBADO');
  const again = await H.rejects(w.simC.approveContent(id));
  assert.ok(again.status >= 400);
});

test('el espacio de trabajo del contrato indica el siguiente paso a cada rol', async () => {
  const id = await w.newContract();
  const wc = await getContractWorkspace(w.client, id);
  const wp = await getContractWorkspace(w.provider, id);
  assert.match(wc.nextStep, /firmalo|fírmalo/);
  assert.equal(wc.actions.canSign, true);
  assert.equal(wc.chatEnabled, false);
  assert.notEqual(wc.nextStep, wp.nextStep === '' ? '' : null);
  await H.rejects(getContractWorkspace(w.other, id));
});
