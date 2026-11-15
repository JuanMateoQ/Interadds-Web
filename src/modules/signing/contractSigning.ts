// Firma del contrato por Cliente y Proveedor (RF-17, RF-18, RS-16, RS-17, RS-26).
import { prisma } from '../../lib/db';
import { ApiError } from '../../lib/http';
import * as contracts from '../contracts/api';
import * as policy from '../contracts/policy';
import { assertContractIntegrity } from '../contracts/integrity';
import * as signing from './signing';
import * as evidence from './evidence';
import * as verify from './verify';
import { notify } from '../chat/notifications';

const PURPOSE = 'FIRMA_CONTRATO';

function eventFor(role) {
  return role === 'CLIENTE' ? 'FIRMA_CLIENTE' : 'FIRMA_PROVEEDOR';
}

/** Paso 1 (RS-26): re-autenticación y entrega del nonce junto con el texto a firmar. */
async function prepareContractSignature({ user, contractId, password }) {
  policy.assertCan(user, 'contract:sign');
  const contract = await contracts.getContractForParty(user, contractId);
  assertContractIntegrity(contract); // RS-20: no se firma un contrato alterado
  if (!['GENERADO', 'FIRMADO_PARCIAL'].includes(contract.status)) {
    throw new ApiError(409, 'NOT_SIGNABLE', 'El contrato ya no admite firmas en su estado actual');
  }
  const role = policy.partyRole(user, contract);
  const already = await prisma.evidence.findFirst({ where: { contractId: contract.id, event: eventFor(role), kind: 'ORIGEN' } });
  if (already) throw new ApiError(409, 'ALREADY_SIGNED', 'Ya firmaste este contrato');
  const p = await signing.prepare({ user, contractId: contract.id, purpose: PURPOSE, subjectHash: contract.textHash, password });
  return { ...p, contractId: contract.id, hash: contract.textHash };
}

/**
 * Paso 2: valida la firma y guarda la evidencia de origen; deja constancia de recepción a la contraparte.
 * La primera firma pasa el contrato a «Firmado por una parte»; la segunda, a «Vigente» (RF-18).
 */
async function signContract({ user, contractId, nonce, signature, certificateSerial }) {
  policy.assertCan(user, 'contract:sign');
  const contract = await contracts.getContractForParty(user, contractId);
  assertContractIntegrity(contract);
  if (!['GENERADO', 'FIRMADO_PARCIAL'].includes(contract.status)) {
    throw new ApiError(409, 'NOT_SIGNABLE', 'El contrato ya no admite firmas en su estado actual');
  }
  const role = policy.partyRole(user, contract);
  const event = eventFor(role);
  const counterpartId = role === 'CLIENTE' ? contract.providerId : contract.clientId;

  const verified = await signing.verifySubmission({ user, contractId: contract.id, purpose: PURPOSE, nonce, signature, certificateSerial });
  if (verified.subjectHash !== contract.textHash) throw new ApiError(409, 'HASH_MISMATCH', 'El hash firmado no coincide con el contrato');

  const result = await prisma.$transaction(async (tx) => {
    let origin: any;
    try {
      origin = await evidence.recordOrigin({
        contractId: contract.id, event, actorId: user.id, certificateId: verified.certificate.id,
        subjectHash: contract.textHash, payload: verified.payload, signature, nonce,
        meta: { role, certificateSerial: verified.certificate.serial },
      }, tx);
    } catch (e) {
      if (e && e.code === 'P2002') throw new ApiError(409, 'ALREADY_SIGNED', 'Ya firmaste este contrato');
      throw e;
    }
    await evidence.recordReceipt({
      contractId: contract.id, event, recipientId: counterpartId, subjectHash: contract.textHash,
      meta: { receivedFrom: user.id, description: 'Constancia de que la contraparte recibió el contrato firmado' },
    }, tx);

    const signatures = await tx.evidence.count({ where: { contractId: contract.id, kind: 'ORIGEN', event: { in: ['FIRMA_CLIENTE', 'FIRMA_PROVEEDOR'] } } });
    let status = contract.status;
    if (signatures === 1) {
      await contracts.advanceStatus(contract.id, 'FIRMADO_PARCIAL', { actorId: user.id, reason: 'Primera firma válida', tx });
      status = 'FIRMADO_PARCIAL';
    } else if (signatures === 2) {
      // RF-18: solo con las dos firmas VÁLIDAS el contrato pasa a Vigente
      const fresh = await tx.contract.findUnique({ where: { id: contract.id } });
      if (!(await verify.bothContractSignaturesValid(fresh, tx))) throw new ApiError(409, 'SIGNATURES_INVALID', 'Las firmas no superan la verificación');
      await contracts.advanceStatus(contract.id, 'VIGENTE', { actorId: user.id, reason: 'Las dos firmas son válidas', tx });
      status = 'VIGENTE';
    }
    return { origin, status };
  });

  // RF-29: aviso en tiempo real a la contraparte (sin texto del contrato)
  await notify({
    userId: counterpartId, type: 'CONTRAPARTE_FIRMO', contractId: contract.id,
    title: result.status === 'VIGENTE' ? 'El contrato quedó vigente' : 'La contraparte firmó el contrato',
    body: result.status === 'VIGENTE'
      ? `Ambas partes firmaron «${contract.serviceTitle}». Ya se puede pagar el anticipo del 50 %.`
      : `${user.name || 'La contraparte'} firmó el contrato «${contract.serviceTitle}». Revisa y firma para dejarlo vigente.`,
  });
  return { status: result.status, evidenceId: result.origin.id, signedAt: result.origin.timestampUtc };
}

export { PURPOSE, prepareContractSignature, signContract };
