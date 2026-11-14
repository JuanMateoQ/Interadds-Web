// Emisión de certificados por la CA emisora de Interadds
// El navegador genera su par ECDSA P-256 (clave privada NO exportable) y envía SOLO la clave pública, con la
// sesión abierta, un reto del servidor firmado como prueba de posesión de la clave privada. La plataforma
// jamás conoce ni puede usar la clave privada del usuario: por eso no puede firmar por él (no repudio).
import { prisma } from '../../lib/db';
import { ApiError, Errors } from '../../lib/http';
import { randomNonce, randomSerialHex } from '../../lib/security/random';
import * as policy from '../contracts/policy';
import * as auth from '../auth/service';
import { X509Certificate as NodeX509 } from 'crypto';
import { loadCA, x509, subtle, EC_ALG, SIGN_ALG, DAY } from './ca';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const CERT_VALIDITY_DAYS = 365; // RS-42: los certificados caducan al año
const MAX_ACTIVE_CERTS = 5;

function certRequestPayload({ userId, nonce, publicKeySpki }) {
  return ['interadds-cert-v1', userId, nonce, publicKeySpki].join('\n');
}

const escapeDn = (s) => String(s).replace(/[,+"\\<>;=#\r\n]/g, ' ').trim();

async function importPublicKey(spkiB64) {
  if (typeof spkiB64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(spkiB64)) throw Errors.badRequest('La clave pública no tiene un formato válido');
  const der = Buffer.from(spkiB64, 'base64');
  if (der.length < 60 || der.length > 200) throw Errors.badRequest('La clave pública no tiene un tamaño válido');
  try {
    return await subtle.importKey('spki', der, EC_ALG, true, ['verify']);
  } catch (_) {
    throw Errors.badRequest('Se requiere una clave pública ECDSA P-256 válida');
  }
}

/** Paso 1 de la emisión: el servidor entrega un reto de un solo uso. */
async function createChallenge(user) {
  policy.assertCan(user, 'contract:sign');
  const nonce = randomNonce();
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await prisma.nonce.create({ data: { nonce, userId: user.id, purpose: 'CERTIFICADO', expiresAt } });
  return { nonce, expiresAt };
}

/** Paso 2: comprueba la sesión, el reto y la prueba de posesión, y firma el certificado del usuario. */
async function issueCertificate(user, { publicKey, challenge, popSignature }) {
  policy.assertCan(user, 'contract:sign');
  const pub = await importPublicKey(publicKey);
  if (typeof popSignature !== 'string' || !popSignature) throw Errors.badRequest('Falta la prueba de posesión de la clave');

  const row = await prisma.nonce.findUnique({ where: { nonce: String(challenge || '') } });
  if (!row || row.userId !== user.id || row.purpose !== 'CERTIFICADO' || row.consumedAt || row.expiresAt <= new Date()) {
    throw new ApiError(409, 'CHALLENGE_INVALID', 'El reto no es válido, venció o ya se usó');
  }
  const payload = certRequestPayload({ userId: user.id, nonce: row.nonce, publicKeySpki: publicKey });
  const popOk = await subtle.verify(SIGN_ALG, pub, Buffer.from(popSignature, 'base64'), Buffer.from(payload, 'utf8'));
  if (!popOk) throw new ApiError(400, 'POP_INVALID', 'La prueba de posesión de la clave privada no es válida');

  const activeCount = await prisma.certificate.count({ where: { userId: user.id, status: 'ACTIVO', notAfter: { gt: new Date() } } });
  if (activeCount >= MAX_ACTIVE_CERTS) throw new ApiError(409, 'TOO_MANY_CERTIFICATES', 'Alcanzaste el máximo de certificados activos');

  const claim = await prisma.nonce.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (claim.count !== 1) throw new ApiError(409, 'CHALLENGE_INVALID', 'El reto ya se usó');

  const dbUser = await auth.getUserById(user.id);
  const ca = await loadCA();
  const serial = randomSerialHex();
  const now = new Date();
  const notBefore = new Date(now.getTime() - 60 * 1000);
  const notAfter = new Date(now.getTime() + CERT_VALIDITY_DAYS * DAY);
  const subject = `CN=${escapeDn(dbUser!.name)}, OU=user:${user.id}, O=Interadds, C=EC`;

  const cert = await x509.X509CertificateGenerator.create({
    serialNumber: serial,
    subject,
    issuer: ca.issuingCert.subject,
    notBefore,
    notAfter,
    signingAlgorithm: SIGN_ALG,
    publicKey: pub,
    signingKey: ca.issuingKey,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.nonRepudiation, true),
      await x509.SubjectKeyIdentifierExtension.create(pub),
      await x509.AuthorityKeyIdentifierExtension.create(ca.issuingCert, false),
    ],
  });
  const pem = cert.toString('pem');
  const row2 = await prisma.certificate.create({
    data: { serial, userId: user.id, subject, publicKeySpki: publicKey, pem, issuerSerial: ca.issuingCert.serialNumber, notBefore, notAfter, status: 'ACTIVO' },
  });
  // RS-46 / RF-16: la CA entrega al usuario su certificado junto con la cadena hasta la raíz
  return { ...certOut(row2), pem, chain: { issuing: ca.issuingPem, root: ca.rootPem } };
}

/**
 * Verifica un certificado de usuario: firma de la CA emisora, firma de la raíz sobre la emisora y vigencia
 * en la fecha indicada (RS-27: verificación de la cadena).
 */
async function verifyCertificateChain(pem, at = new Date()) {
  // Se usa el verificador X.509 nativo de Node (OpenSSL): no depende de proveedores WebCrypto de terceros.
  const reasons: any = [];
  let cert: any;
  try {
    cert = new NodeX509(pem);
  } catch (_) {
    return { valid: false, reasons: ['Certificado ilegible'] };
  }
  const ca = await loadCA();
  const issuing = new NodeX509(ca.issuingPem);
  const root = new NodeX509(ca.rootPem);
  const inForce = (c) => new Date(c.validFrom) <= at && at <= new Date(c.validTo);
  if (!cert.verify(issuing.publicKey)) reasons.push('La firma de la CA emisora sobre el certificado no es válida');
  if (!inForce(cert)) reasons.push('El certificado no estaba vigente en la fecha indicada');
  if (!issuing.verify(root.publicKey)) reasons.push('La CA raíz no respalda a la CA emisora');
  if (!inForce(issuing)) reasons.push('La CA emisora no estaba vigente en la fecha indicada');
  if (!root.verify(root.publicKey) || !inForce(root)) reasons.push('El certificado raíz no es válido');
  return { valid: reasons.length === 0, reasons, subject: cert.subject, serial: cert.serialNumber, notBefore: new Date(cert.validFrom), notAfter: new Date(cert.validTo) };
}

async function listMine(userId) {
  const rows = await prisma.certificate.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  return rows.map(certOut);
}

/** RS-08: ¿el usuario tiene un certificado vigente? */
async function hasActiveCertificate(userId) {
  const c = await prisma.certificate.count({ where: { userId, status: 'ACTIVO', notAfter: { gt: new Date() } } });
  return c > 0;
}

async function findUsableCertificate(userId, serial) {
  const row = await prisma.certificate.findUnique({ where: { serial: String(serial || '') } });
  if (!row || row.userId !== userId) throw new ApiError(400, 'CERTIFICATE_INVALID', 'El certificado no pertenece al usuario');
  if (row.status !== 'ACTIVO') throw new ApiError(409, 'CERTIFICATE_REVOKED', 'El certificado está revocado');
  if (row.notAfter <= new Date()) throw new ApiError(409, 'CERTIFICATE_EXPIRED', 'El certificado venció');
  return row;
}

function certOut(c) {
  return { serial: c.serial, subject: c.subject, notBefore: c.notBefore, notAfter: c.notAfter, status: c.status, createdAt: c.createdAt };
}

export {
  CERT_VALIDITY_DAYS, certRequestPayload, createChallenge, issueCertificate, verifyCertificateChain,
  listMine, hasActiveCertificate, findUsableCertificate, importPublicKey,
};
