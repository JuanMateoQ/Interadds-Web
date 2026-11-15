// RF-19 y RS-27 (FDP_DAU.2): verificación de la evidencia de una firma: certificado, cadena, hash y hora.
import { prisma } from '../../lib/db';
import * as contracts from '../contracts/api';
import { checkContractIntegrity } from '../contracts/integrity';
import * as certificates from './certificates';
import * as evidence from './evidence';
import { verifySignature } from './signing';

const SIGNED_EVENTS = new Set(['FIRMA_CLIENTE', 'FIRMA_PROVEEDOR', 'APROBACION_CONTENIDO']);

/**
 * Verifica una evidencia. Para firmas del navegador comprueba además: certificado emitido por la cadena de
 * Interadds y vigente en el momento de firmar, firma ECDSA sobre el payload y que el hash firmado sea el del
 * contrato guardado (si el texto cambió, la verificación falla).
 */
async function verifyEvidence(ev, contract) {
  const checks: any = {};
  const integrity = await evidence.verifyRecordIntegrity(ev);
  checks.recordHash = integrity.hashOk;
  checks.timestamp = integrity.timestampOk;

  const signed = ev.kind === 'ORIGEN' && SIGNED_EVENTS.has(ev.event);
  if (signed) {
    const cert = ev.certificateId ? await prisma.certificate.findUnique({ where: { id: ev.certificateId } }) : null;
    checks.certificateChain = false;
    checks.signature = false;
    if (cert) {
      const chain = await certificates.verifyCertificateChain(cert.pem, new Date(ev.timestampUtc));
      checks.certificateChain = chain.valid;
      checks.signature = ev.signature ? await verifySignature(cert.publicKeySpki, ev.payload, ev.signature) : false;
    }
    if (ev.event === 'FIRMA_CLIENTE' || ev.event === 'FIRMA_PROVEEDOR') {
      const current = checkContractIntegrity(contract);
      checks.contractHash = current.ok && ev.subjectHash === contract.textHash && ev.payload.includes(contract.textHash);
    } else {
      checks.contentHash = ev.payload.includes(ev.subjectHash);
    }
  }
  const valid = Object.values(checks).every(Boolean);
  return {
    id: ev.id, event: ev.event, kind: ev.kind, ref: ev.ref, actorId: ev.actorId,
    subjectHash: ev.subjectHash, timestampUtc: ev.timestampUtc, certificateSerial: null,
    checks, valid,
  };
}

/** RF-19: las dos partes pueden revisar toda la evidencia del contrato. */
async function verifyContract(user, contractId) {
  const contract = await contracts.getContractForParty(user, contractId);
  const list = await evidence.listForContract(contract.id);
  const certIds: any = [...new Set(list.map((e) => e.certificateId).filter(Boolean))];
  const certs = certIds.length ? await prisma.certificate.findMany({ where: { id: { in: certIds } } }) : [];
  const bySerial = new Map<any, any>(certs.map((c: any) => [c.id, c]));
  const results: any = [];
  for (const ev of list) {
    const r: any = await verifyEvidence(ev, contract);
    const c = ev.certificateId ? bySerial.get(ev.certificateId) : null;
    r.certificateSerial = c ? c.serial : null;
    r.certificateSubject = c ? c.subject : null;
    r.signature = ev.signature ? ev.signature.slice(0, 24) + '…' : null;
    r.meta = ev.meta || null;
    results.push(r);
  }
  return { contractId: contract.id, contractHash: contract.textHash, valid: results.length > 0 && results.every((r) => r.valid), evidences: results };
}

/** Las dos firmas del contrato deben ser válidas para que quede Vigente (RF-18). */
async function bothContractSignaturesValid(contract, db = prisma) {
  const sigs = await db.evidence.findMany({ where: { contractId: contract.id, kind: 'ORIGEN', event: { in: ['FIRMA_CLIENTE', 'FIRMA_PROVEEDOR'] } } });
  if (sigs.length !== 2) return false;
  for (const ev of sigs) {
    const r: any = await verifyEvidence(ev, contract);
    if (!r.valid) return false;
  }
  return true;
}

export { verifyEvidence, verifyContract, bothContractSignaturesValid };
