// Núcleo de la firma digital: nonce de un solo uso, re-autenticación y verificación de la firma del navegador.
//   1. prepare : el usuario VUELVE a ingresar su clave (RS-26) y el servidor entrega un nonce (RS-07).
//   2. el navegador firma con su clave privada (WebCrypto, no exportable) el texto `payload` (hash + nonce).
//   3. verifySubmission: el servidor verifica certificado vigente y no revocado, cadena hasta la CA y firma,
//      y rechaza repeticiones consumiendo el nonce una sola vez.
import { prisma } from '../../lib/db';
import { ApiError } from '../../lib/http';
import { randomNonce } from '../../lib/security/random';
import * as auth from '../auth/service';
import * as certificates from './certificates';
import { subtle, SIGN_ALG } from './ca';

const NONCE_TTL_MS = 5 * 60 * 1000;

/** Texto exacto que firma el navegador: el hash del contrato (o del archivo) más el nonce. */
function buildSigningPayload({ purpose, contractId, subjectHash, nonce }) {
  return ['interadds-sign-v1', purpose, contractId, subjectHash, nonce].join('\n');
}

async function prepare({ user, contractId, purpose, subjectHash, password }) {
  await auth.reauthenticate(user.id, password); // RS-26 (FIA_UAU.6)
  if (!(await certificates.hasActiveCertificate(user.id))) {
    throw new ApiError(409, 'CERTIFICATE_REQUIRED', 'Primero genera tu clave de firma y obtén tu certificado');
  }
  // Solo el nonce más reciente sirve: se anulan los anteriores sin usar
  await prisma.nonce.updateMany({ where: { userId: user.id, purpose, contractId, consumedAt: null }, data: { consumedAt: new Date() } });
  const nonce = randomNonce();
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
  await prisma.nonce.create({ data: { nonce, userId: user.id, purpose, contractId, subject: subjectHash, expiresAt } });
  return { nonce, expiresAt, subjectHash, payload: buildSigningPayload({ purpose, contractId, subjectHash, nonce }) };
}

async function verifySubmission({ user, contractId, purpose, nonce, signature, certificateSerial }) {
  if (typeof signature !== 'string' || !signature || typeof nonce !== 'string' || !nonce) {
    throw new ApiError(400, 'BAD_REQUEST', 'Faltan la firma o el nonce');
  }
  const row = await prisma.nonce.findUnique({ where: { nonce } });
  if (!row || row.userId !== user.id || row.purpose !== purpose || row.contractId !== contractId) {
    throw new ApiError(409, 'NONCE_INVALID', 'El nonce no es válido para esta firma');
  }
  if (row.consumedAt) throw new ApiError(409, 'REPLAY_DETECTED', 'Esta firma ya fue presentada: se rechaza la repetición');
  if (row.expiresAt <= new Date()) throw new ApiError(409, 'NONCE_EXPIRED', 'El nonce venció, vuelve a iniciar la firma');

  const cert = await certificates.findUsableCertificate(user.id, certificateSerial);
  const chain = await certificates.verifyCertificateChain(cert.pem);
  if (!chain.valid) throw new ApiError(409, 'CERTIFICATE_UNTRUSTED', 'El certificado no pertenece a la cadena de Interadds', chain.reasons);

  const payload = buildSigningPayload({ purpose, contractId, subjectHash: row.subject, nonce });
  const ok = await verifySignature(cert.publicKeySpki, payload, signature);
  if (!ok) throw new ApiError(400, 'SIGNATURE_INVALID', 'La firma digital no es válida');

  // El nonce se consume una sola vez, de forma atómica (RS-30: rechazar repeticiones)
  const claim = await prisma.nonce.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (claim.count !== 1) throw new ApiError(409, 'REPLAY_DETECTED', 'Esta firma ya fue presentada: se rechaza la repetición');
  return { certificate: cert, payload, subjectHash: row.subject, nonce };
}

/** RS-14: verificación ECDSA P-256 / SHA-256 (firma en formato r||s de WebCrypto). */
async function verifySignature(publicKeySpkiB64, payload, signatureB64) {
  try {
    const key = await certificates.importPublicKey(publicKeySpkiB64);
    return await subtle.verify(SIGN_ALG, key, Buffer.from(signatureB64, 'base64'), Buffer.from(payload, 'utf8'));
  } catch (_) {
    return false;
  }
}

export { NONCE_TTL_MS, buildSigningPayload, prepare, verifySubmission, verifySignature };
