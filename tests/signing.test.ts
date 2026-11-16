// Firma digital: RF-17..19, RS-14..17, RS-26, RNF-21 (CA propia de dos niveles, ECDSA P-256, anti-repetición)
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'crypto';
import * as H from './helpers';
import * as certificates from '../src/modules/signing/certificates';
import * as contractSigning from '../src/modules/signing/contractSigning';
import * as verify from '../src/modules/signing/verify';
import { EC_ALG, SIGN_ALG } from '../src/modules/signing/ca';

let w: any;
test.before(async () => { w = await H.world(); });
test.after(() => H.close());
const b64 = (b) => Buffer.from(b).toString('base64');

test('el certificado se emite con la CA de Interadds y su cadena es válida (raíz → emisora → usuario)', async () => {
  const cert = await w.simC.ensureCertificate();
  const row = await H.prisma.certificate.findFirst({ where: { serial: cert.serial } });
  const chain = await certificates.verifyCertificateChain(row.pem, new Date());
  assert.equal(chain.valid, true);
  assert.ok(row.notAfter > new Date());
});

test('la clave privada nunca viaja: solo se envía la pública y la prueba de posesión', async () => {
  const keys = await webcrypto.subtle.generateKey(EC_ALG, false, ['sign', 'verify']);
  await assert.rejects(webcrypto.subtle.exportKey('pkcs8', keys.privateKey)); // no exportable
  const publicKey = b64(await webcrypto.subtle.exportKey('spki', keys.publicKey));
  const ch = await certificates.createChallenge(w.provider);
  // firma de posesión con OTRA clave: debe rechazarse
  const other = await webcrypto.subtle.generateKey(EC_ALG, false, ['sign', 'verify']);
  const bad = b64(await webcrypto.subtle.sign(SIGN_ALG, other.privateKey, Buffer.from(certificates.certRequestPayload({ userId: w.provider.id, nonce: ch.nonce, publicKeySpki: publicKey }))));
  await H.rejects(certificates.issueCertificate(w.provider, { publicKey, challenge: ch.nonce, popSignature: bad }));
});

test('flujo completo de firma: dos firmas válidas dejan el contrato Vigente (RF-18)', async () => {
  const id = await w.newContract();
  await w.simC.signContract(id);
  assert.equal((await H.prisma.contract.findUnique({ where: { id } })).status, 'FIRMADO_PARCIAL');
  await w.simP.signContract(id);
  assert.equal((await H.prisma.contract.findUnique({ where: { id } })).status, 'VIGENTE');
  const v = await verify.verifyContract(w.client, id);
  assert.equal(v.valid, true);
  assert.equal(v.evidences.filter((e) => e.kind === 'ORIGEN').length, 2);
  assert.equal(v.evidences.filter((e) => e.kind === 'RECEPCION').length, 2);
  assert.ok(v.evidences.every((e) => e.checks.recordHash && e.checks.timestamp));
});

test('RS-26: clave incorrecta al firmar → se rechaza antes de entregar el nonce', async () => {
  const id = await w.newContract();
  const e = await H.rejects(w.simC.signContract(id, 'ClaveEquivocada1'));
  assert.equal(e.code, 'REAUTH_FAILED');
  assert.equal(await H.prisma.evidence.count({ where: { contractId: id } }), 0);
});

test('una parte no puede firmar dos veces', async () => {
  const id = await w.newContract();
  await w.simC.signContract(id);
  const e = await H.rejects(w.simC.signContract(id));
  assert.equal(e.code, 'ALREADY_SIGNED');
});

test('anti-repetición: el nonce se usa una sola vez y la firma repetida se rechaza (RS-16)', async () => {
  const id = await w.newContract();
  await w.simC.ensureCertificate();
  const prep = await contractSigning.prepareContractSignature({ user: w.client, contractId: id, password: H.PASSWORD });
  const signature = await w.simC.sign(prep.payload);
  const args: any = { user: w.client, contractId: id, nonce: prep.nonce, signature, certificateSerial: w.simC.serial };
  await contractSigning.signContract(args);
  const e = await H.rejects(contractSigning.signContract(args));
  assert.ok(['REPLAY_DETECTED', 'ALREADY_SIGNED'].includes(e.code), e.code);
});

test('firma sobre otro texto o hecha por otra clave se rechaza (SIGNATURE_INVALID)', async () => {
  const id = await w.newContract();
  await w.simC.ensureCertificate();
  const prep = await contractSigning.prepareContractSignature({ user: w.client, contractId: id, password: H.PASSWORD });
  const tampered = await w.simC.sign(prep.payload.replace(/[0-9a-f]{64}/, 'f'.repeat(64)));
  const e = await H.rejects(contractSigning.signContract({ user: w.client, contractId: id, nonce: prep.nonce, signature: tampered, certificateSerial: w.simC.serial }));
  assert.equal(e.code, 'SIGNATURE_INVALID');
  // nonce inexistente
  const e2 = await H.rejects(contractSigning.signContract({ user: w.client, contractId: id, nonce: 'inventado', signature: tampered, certificateSerial: w.simC.serial }));
  assert.ok(['NONCE_INVALID', 'BAD_REQUEST'].includes(e2.code));
});

test('un nonce vencido no sirve (TTL de 5 minutos)', async () => {
  const id = await w.newContract();
  await w.simC.ensureCertificate();
  const prep = await contractSigning.prepareContractSignature({ user: w.client, contractId: id, password: H.PASSWORD });
  await H.prisma.nonce.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
  const signature = await w.simC.sign(prep.payload);
  const e = await H.rejects(contractSigning.signContract({ user: w.client, contractId: id, nonce: prep.nonce, signature, certificateSerial: w.simC.serial }));
  assert.equal(e.code, 'NONCE_EXPIRED');
});

test('un tercero no puede firmar un contrato ajeno', async () => {
  const id = await w.newContract();
  const sim = new (require('../src/dev/browserSim').BrowserSim)(w.other, H.PASSWORD);
  const e = await H.rejects(sim.signContract(id));
  assert.ok([403, 404].includes(e.status));
});

test('verificación detecta evidencia manipulada (hash del registro)', async () => {
  const id = await w.newContract();
  await w.simC.signContract(id);
  await H.prisma.$executeRawUnsafe(`UPDATE signing_evidences SET payload = payload || 'x' WHERE "contractId" = '${id}' AND kind = 'ORIGEN'`).catch(async () => {
    await H.prisma.evidence.updateMany({ where: { contractId: id, kind: 'ORIGEN' }, data: { payload: 'manipulado' } });
  });
  const v = await verify.verifyContract(w.client, id);
  assert.equal(v.valid, false);
});
