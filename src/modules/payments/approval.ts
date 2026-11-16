// Aprobación del contenido entregado y desbloqueo del pago del saldo (RF-27, RF-28, Mateo Quisilema).
// La aprobación es una FIRMA del Cliente sobre el hash del archivo: queda como evidencia de origen (RS-16)
// y el Proveedor recibe su constancia de recepción (RS-17).
import { prisma } from '../../lib/db';
import { ApiError, Errors } from '../../lib/http';
import * as contracts from '../contracts/api';
import * as policy from '../contracts/policy';
import { assertContractIntegrity } from '../contracts/integrity';
import * as signing from '../signing/signing';
import * as evidence from '../signing/evidence';
import * as deliveries from '../chat/deliveries';
import { notify } from '../chat/notifications';

const PURPOSE = 'APROBACION';

async function loadForApproval(user, contractId) {
  policy.assertCan(user, 'content:approve');
  const contract = await contracts.getContractForParty(user, contractId);
  if (!policy.isClientOf(user, contract)) throw Errors.forbidden('Solo el Cliente aprueba el contenido');
  assertContractIntegrity(contract);
  if (contract.status !== 'CONTENIDO_ENTREGADO') throw new ApiError(409, 'APPROVAL_NOT_ALLOWED', 'Solo se puede aprobar cuando hay contenido entregado');
  const delivery = await deliveries.getLatestDelivery(contract.id);
  if (!delivery) throw new ApiError(409, 'NO_CONTENT', 'Aún no hay contenido entregado');
  return { contract, delivery };
}

/** Paso 1: re-autenticación (RS-26) y nonce; el texto a firmar incluye el hash del archivo. */
async function prepareApproval({ user, contractId, password }) {
  const { contract, delivery } = await loadForApproval(user, contractId);
  const p = await signing.prepare({ user, contractId: contract.id, purpose: PURPOSE, subjectHash: delivery.sha256, password });
  return { ...p, contractId: contract.id, deliveryId: delivery.id, version: delivery.version, fileName: delivery.originalName };
}

/** Paso 2: valida la firma de aprobación y habilita el pago del saldo (el contrato pasa a «Contenido aprobado»). */
async function approveContent({ user, contractId, nonce, signature, certificateSerial }) {
  const { contract, delivery } = await loadForApproval(user, contractId);
  const verified = await signing.verifySubmission({ user, contractId: contract.id, purpose: PURPOSE, nonce, signature, certificateSerial });
  if (verified.subjectHash !== delivery.sha256) throw new ApiError(409, 'HASH_MISMATCH', 'Se subió una versión nueva mientras aprobabas: vuelve a revisarla');

  await prisma.$transaction(async (tx) => {
    try {
      await evidence.recordOrigin({
        contractId: contract.id, event: 'APROBACION_CONTENIDO', ref: String(delivery.version), actorId: user.id, certificateId: verified.certificate.id,
        subjectHash: delivery.sha256, payload: verified.payload, signature, nonce,
        meta: { version: delivery.version, fileName: delivery.originalName, certificateSerial: verified.certificate.serial },
      }, tx);
    } catch (e) {
      if (e && e.code === 'P2002') throw new ApiError(409, 'ALREADY_APPROVED', 'Este contenido ya fue aprobado');
      throw e;
    }
    await evidence.recordReceipt({
      contractId: contract.id, event: 'APROBACION_CONTENIDO', ref: String(delivery.version), recipientId: contract.providerId, subjectHash: delivery.sha256,
      meta: { description: 'Constancia de que el Proveedor recibió la aprobación' },
    }, tx);
    await deliveries.markApproved(delivery.id, tx);
    await contracts.advanceStatus(contract.id, 'CONTENIDO_APROBADO', { actorId: user.id, reason: 'Contenido aprobado con firma del Cliente', tx });
  });

  await notify({
    userId: contract.providerId, type: 'CONTENIDO_APROBADO', contractId: contract.id,
    title: 'Contenido aprobado', body: `${contract.clientName} aprobó el contenido de «${contract.serviceTitle}». Falta el pago del saldo del 50 %.`,
  });
  return { status: 'CONTENIDO_APROBADO', saldoUnlocked: true };
}

export { PURPOSE, prepareApproval, approveContent };
