// Contratos: RF-14..16, RF-37, RNF-21, RNF-22, RS-18/19/20/44/45
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './helpers';
import * as sm from '../src/modules/contracts/stateMachine';
import * as cs from '../src/modules/contracts/service';
import { formatUsd } from '../src/lib/money';
import { hashContractText } from '../src/modules/signing/hash';
import { checkContractIntegrity } from '../src/modules/contracts/integrity';

let w: any;
test.before(async () => { w = await H.world(); });
test.after(() => H.close());

test('máquina de estados: siete estados, solo avanzan de uno en uno', () => {
  assert.equal(sm.STATES.length, 7);
  assert.equal(sm.canTransition('GENERADO', 'FIRMADO_PARCIAL'), true);
  assert.equal(sm.canTransition('GENERADO', 'VIGENTE'), false);
  assert.equal(sm.canTransition('VIGENTE', 'GENERADO'), false);
  assert.equal(sm.canTransition('COMPLETADO', 'GENERADO'), false);
  assert.throws(() => sm.assertTransition('VIGENTE', 'COMPLETADO'), (e: any) => e.code === 'INVALID_TRANSITION');
  assert.equal(sm.nextState('COMPLETADO'), null);
});

test('el Cliente genera el contrato: texto con datos reales y SHA-256 correcto (RF-14, RNF-21)', async () => {
  const { contract } = await cs.requestContract(w.client, w.service.id);
  const row = await H.prisma.contract.findUnique({ where: { id: contract.id } });
  assert.equal(row.status, 'GENERADO');
  assert.equal(row.textHash, hashContractText(row.text));
  assert.match(row.textHash, /^[0-9a-f]{64}$/);
  for (const piece of [w.client.name, w.provider.name, w.service.title, formatUsd(10000), formatUsd(5000)]) assert.ok(row.text.includes(piece), piece);
  assert.equal(row.anticipoCents + row.saldoCents, row.totalCents);
  assert.ok(checkContractIntegrity(row).ok);
});

test('un Proveedor no puede contratar, ni un Cliente contratar un servicio no publicado', async () => {
  const e = await H.rejects(cs.requestContract(w.provider, w.service.id));
  assert.equal(e.status, 403);
  const draft = await H.createService(w.provider, { status: 'BORRADOR', title: 'Servicio en borrador' });
  const e2 = await H.rejects(cs.requestContract(w.client, draft.id));
  assert.ok([404, 409].includes(e2.status));
});

test('inmutabilidad: la base rechaza cambiar texto, hash o montos (trigger, RNF-21)', async () => {
  const id = await w.newContract();
  for (const data of [{ text: 'Texto alterado' }, { textHash: 'a'.repeat(64) }, { anticipoCents: 1 }, { totalCents: 1 }]) {
    await H.rejects(H.prisma.contract.update({ where: { id }, data }));
  }
  const row = await H.prisma.contract.findUnique({ where: { id } });
  assert.ok(checkContractIntegrity(row).ok);
});

test('la base rechaza saltos o retrocesos de estado (trigger, RNF-22)', async () => {
  const id = await w.newContract();
  await H.rejects(H.prisma.contract.update({ where: { id }, data: { status: 'VIGENTE' } }));
  await H.rejects(H.prisma.contract.update({ where: { id }, data: { status: 'COMPLETADO' } }));
});

test('control de acceso: solo las dos partes ven el contrato (RS-19); el tercero y el administrador reciben 404/403', async () => {
  const id = await w.newContract();
  assert.equal((await cs.getContractDetail(w.client, id)).id, id);
  assert.equal((await cs.getContractDetail(w.provider, id)).id, id);
  for (const u of [w.other, w.admin]) {
    const e = await H.rejects(cs.getContractDetail(u, id));
    assert.ok([403, 404].includes(e.status));
    const e2 = await H.rejects(cs.viewContract(u, id));
    assert.ok([403, 404].includes(e2.status));
  }
  const mine = await cs.listContracts(w.other);
  assert.ok(!mine.some((c) => c.id === id));
});

test('visor protegido: entrega texto, hash y marca de agua con el nombre del lector (RF-37)', async () => {
  const id = await w.newContract();
  const v = await cs.viewContract(w.client, id);
  assert.equal(v.hash, hashContractText(v.text));
  assert.equal(v.watermark.name, w.client.name);
  assert.equal(v.watermark.email, w.client.email);
  const v2 = await cs.viewContract(w.provider, id);
  assert.equal(v2.watermark.name, w.provider.name);
});

test('RS-20: si el texto guardado se altera, el visor y las firmas lo rechazan', async () => {
  const id = await w.newContract();
  // se desactiva el trigger solo para simular una manipulación directa de la base
  await H.prisma.$executeRawUnsafe('ALTER TABLE contracts_contracts DISABLE TRIGGER USER');
  try {
    await H.prisma.$executeRawUnsafe(`UPDATE contracts_contracts SET text = text || ' (alterado)' WHERE id = '${id}'`);
  } finally {
    await H.prisma.$executeRawUnsafe('ALTER TABLE contracts_contracts ENABLE TRIGGER USER');
  }
  const e = await H.rejects(cs.viewContract(w.client, id));
  assert.equal(e.code, 'INTEGRITY_VIOLATION');
  const e2 = await H.rejects(w.simC.signContract(id));
  assert.equal(e2.code, 'INTEGRITY_VIOLATION');
});

test('política de flujo: el contrato solo circula por la plataforma (RS-44/45)', async () => {
  const flow = require('../src/modules/chat/flowPolicy');
  const id = await w.newContract();
  const contract = await H.prisma.contract.findUnique({ where: { id } });
  assert.equal(flow.evaluateFlow({ reader: w.client, contract, channel: 'platform' }).allowed, true);
  for (const channel of ['public_link', 'email_body', 'email_attachment', 'forward']) {
    assert.equal(flow.evaluateFlow({ reader: w.client, contract, channel }).allowed, false, channel);
  }
  assert.equal(flow.evaluateFlow({ reader: w.other, contract, channel: 'platform' }).allowed, false);
  assert.equal(flow.evaluateFlow({ reader: w.client, contract, channel: 'platform', sessionValid: false }).allowed, false);
  const mail = flow.composePendingContractEmail({ toName: 'Valeria', contractId: id });
  assert.equal(flow.leaksContractText(mail.text, contract), false);
  assert.equal(flow.leaksContractText('Copia: ' + contract.text, contract), true);
});
