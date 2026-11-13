// Evidencias de no repudio sobre los cinco eventos del happy path (RS-16 FCO_NRO.2 y RS-17 FCO_NRR.2).
//   ORIGEN    : prueba de quién emitió el hecho (firma del contrato, pago, entrega de contenido, aprobación).
//   RECEPCION : constancia de que la contraparte lo recibió, siempre generada por el sistema.
// Cada evidencia lleva hora UTC, un hash propio (recordHash) y un SELLO DE TIEMPO firmado por la CA emisora.
import { prisma } from '../../lib/db';
import { hashRecord } from './hash';
import { signWithCA, verifyCASignature } from './ca';

const EVENTS: any = ['FIRMA_CLIENTE', 'FIRMA_PROVEEDOR', 'PAGO', 'ENTREGA_CONTENIDO', 'APROBACION_CONTENIDO'];

function recordBody(e) {
  return {
    contractId: e.contractId, event: e.event, kind: e.kind, ref: e.ref || '', actorId: e.actorId,
    certificateId: e.certificateId || null, subjectHash: e.subjectHash, payload: e.payload,
    signature: e.signature || null, nonce: e.nonce || null, meta: e.meta || null,
    timestampUtc: new Date(e.timestampUtc).toISOString(),
  };
}

async function createEvidence(db, base) {
  const timestampUtc = new Date();
  const body = recordBody({ ...base, timestampUtc });
  const recordHash = hashRecord(body);
  const timestampToken = await signWithCA(`${recordHash}|${body.timestampUtc}`);
  return db.evidence.create({
    data: {
      contractId: body.contractId, event: body.event, kind: body.kind, ref: body.ref, actorId: body.actorId,
      certificateId: body.certificateId, subjectHash: body.subjectHash, payload: body.payload,
      signature: body.signature, nonce: body.nonce, meta: body.meta === null ? undefined : body.meta,
      timestampUtc, timestampToken, recordHash,
    },
  });
}

/** RS-16: evidencia de origen. `signature` y `certificateId` existen cuando firmó el navegador del usuario. */
async function recordOrigin(args: any, db: any = prisma) {
  return createEvidence(db, { ...args, kind: 'ORIGEN' });
}

/**
 * RS-17: constancia de recepción para la contraparte (`recipientId`). La emite el sistema y queda sellada por la CA.
 * Es idempotente: si ya existe devuelve la existente.
 */
async function recordReceipt({ contractId, event, ref = '', recipientId, subjectHash, meta = null }: any, db: any = prisma) {
  const existing = await db.evidence.findFirst({ where: { contractId, event, kind: 'RECEPCION', ref } });
  if (existing) return existing;
  try {
    return await createEvidence(db, {
      contractId, event, kind: 'RECEPCION', ref, actorId: recipientId, subjectHash,
      payload: `interadds-receipt-v1\n${event}\n${contractId}\n${subjectHash}\n${recipientId}`,
      meta: { ...(meta || {}), via: 'plataforma' },
    });
  } catch (e) {
    if (e && e.code === 'P2002') return db.evidence.findFirst({ where: { contractId, event, kind: 'RECEPCION', ref } });
    throw e;
  }
}

/** Comprueba el hash propio del registro y el sello de tiempo de la CA. */
async function verifyRecordIntegrity(ev) {
  const body = recordBody({ ...ev, timestampUtc: ev.timestampUtc });
  const recomputed = hashRecord(body);
  const hashOk = recomputed === ev.recordHash;
  let timestampOk: any = false;
  try {
    timestampOk = await verifyCASignature(`${ev.recordHash}|${body.timestampUtc}`, ev.timestampToken);
  } catch (_) {
    timestampOk = false;
  }
  return { hashOk, timestampOk };
}

async function listForContract(contractId, db = prisma) {
  return db.evidence.findMany({ where: { contractId }, orderBy: [{ timestampUtc: 'asc' }, { createdAt: 'asc' }] });
}

export { EVENTS, recordOrigin, recordReceipt, verifyRecordIntegrity, listForContract };
