// Autoridad certificadora propia de Interadds, de DOS niveles (RF-16, RS-10, RS-11, RS-46):
//   CA raíz   -> su clave privada se genera y se guarda FUERA DE LÍNEA (ca-offline/); solo firma a la emisora.
//   CA emisora-> firma el certificado X.509 de cada usuario. Su clave privada se lee solo desde archivo/variable
//                de entorno (nunca del código fuente).
import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import { webcrypto, X509Certificate as NodeX509 } from 'crypto';
import * as x509 from '@peculiar/x509';
import { config } from '../../lib/env';
import { randomSerialHex } from '../../lib/security/random';

x509.cryptoProvider.set(webcrypto as any);
const subtle = webcrypto.subtle;

const EC_ALG: any = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN_ALG: any = { name: 'ECDSA', hash: 'SHA-256' };
const DAY = 24 * 3600 * 1000;

function pemEncode(label, der) {
  const b64 = Buffer.from(der).toString('base64').replace(/(.{64})/g, '$1\n');
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}
function pemToDer(pem) {
  const b64 = String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Buffer.from(b64, 'base64');
}

/** RS-10 (FCS_CKM.1): generación de un par de claves ECDSA P-256 con el CSPRNG del sistema. */
async function generateKeyPair() {
  return subtle.generateKey(EC_ALG, true, ['sign', 'verify']);
}

/**
 * Crea la jerarquía de la CA: raíz autofirmada (10 años) y emisora firmada por la raíz (5 años).
 * La clave privada de la raíz se escribe en `offlineDir` para que se retire del servidor.
 */
async function initCA({ dir = config.ca.dir, offlineDir = config.ca.offlineDir, force = false }: any = {}) {
  const files: any = {
    rootCert: path.join(dir, 'root-ca.cert.pem'),
    issuingCert: path.join(dir, 'issuing-ca.cert.pem'),
    issuingKey: path.join(dir, 'issuing-ca.key.pem'),
    rootKey: path.join(offlineDir, 'root-ca.key.pem'),
  };
  if (!force && fs.existsSync(files.issuingKey)) {
    throw new Error(`La CA ya existe en ${dir}. Usa --force para regenerarla (invalida los certificados emitidos).`);
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(offlineDir, { recursive: true });

  const now = new Date();
  const rootKeys = await generateKeyPair();
  const rootCert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: randomSerialHex(),
    name: 'CN=Interadds Root CA, O=Interadds, C=EC',
    notBefore: new Date(now.getTime() - 60 * 1000),
    notAfter: new Date(now.getTime() + 3650 * DAY),
    signingAlgorithm: SIGN_ALG,
    keys: rootKeys,
    extensions: [
      new x509.BasicConstraintsExtension(true, 1, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
      await x509.SubjectKeyIdentifierExtension.create(rootKeys.publicKey),
    ],
  });

  const issuingKeys = await generateKeyPair();
  const issuingCert = await x509.X509CertificateGenerator.create({
    serialNumber: randomSerialHex(),
    subject: 'CN=Interadds Issuing CA, O=Interadds, C=EC',
    issuer: rootCert.subject,
    notBefore: new Date(now.getTime() - 60 * 1000),
    notAfter: new Date(now.getTime() + 1825 * DAY),
    signingAlgorithm: SIGN_ALG,
    publicKey: issuingKeys.publicKey,
    signingKey: rootKeys.privateKey,
    extensions: [
      new x509.BasicConstraintsExtension(true, 0, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign | x509.KeyUsageFlags.digitalSignature, true),
      await x509.SubjectKeyIdentifierExtension.create(issuingKeys.publicKey),
      await x509.AuthorityKeyIdentifierExtension.create(rootCert, false),
    ],
  });

  const rootKeyPem = pemEncode('PRIVATE KEY', await subtle.exportKey('pkcs8', rootKeys.privateKey));
  const issuingKeyPem = pemEncode('PRIVATE KEY', await subtle.exportKey('pkcs8', issuingKeys.privateKey));
  fs.writeFileSync(files.rootCert, rootCert.toString('pem') + '\n');
  fs.writeFileSync(files.issuingCert, issuingCert.toString('pem') + '\n');
  fs.writeFileSync(files.issuingKey, issuingKeyPem, { mode: 0o600 });
  fs.writeFileSync(files.rootKey, rootKeyPem, { mode: 0o600 });
  resetCACache();
  return { files, rootSerial: rootCert.serialNumber, issuingSerial: issuingCert.serialNumber };
}

function readSource(b64, file) {
  if (b64) return Buffer.from(b64, 'base64').toString('utf8');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  return null;
}

/** RS-11 (FCS_CKM.3): el material de la CA solo se lee de variables de entorno o de archivos protegidos. */
async function loadCA() {
  const g = globalThis;
  if (g.__interaddsCA) return g.__interaddsCA;
  const rootPem = readSource(config.ca.rootCertB64, config.ca.rootCertFile);
  const issuingPem = readSource(config.ca.issuingCertB64, config.ca.issuingCertFile);
  const keyPem = readSource(config.ca.issuingKeyB64, config.ca.issuingKeyFile);
  if (!rootPem || !issuingPem || !keyPem) {
    throw new Error('La CA de Interadds no está inicializada. Ejecuta "npm run ca:init" y revisa las variables CA_* del .env.');
  }
  const rootCert = new x509.X509Certificate(rootPem);
  const issuingCert = new x509.X509Certificate(issuingPem);
  const issuingKey = await subtle.importKey('pkcs8', pemToDer(keyPem), EC_ALG, false, ['sign']);
  g.__interaddsCA = { rootCert, issuingCert, issuingKey, rootPem: rootCert.toString('pem'), issuingPem: issuingCert.toString('pem') };
  return g.__interaddsCA;
}

function resetCACache() {
  globalThis.__interaddsCA = null;
}

/** Firma con la clave de la CA emisora (sellos de tiempo y constancias). Devuelve base64 (r||s). */
async function signWithCA(data) {
  const ca = await loadCA();
  const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  const sig = await subtle.sign(SIGN_ALG, ca.issuingKey, bytes);
  return Buffer.from(sig).toString('base64');
}

async function verifyCASignature(data, signatureB64) {
  const ca = await loadCA();
  const spki = new NodeX509(ca.issuingPem).publicKey.export({ type: 'spki', format: 'der' });
  const key = await subtle.importKey('spki', spki, EC_ALG, false, ['verify']);
  const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return subtle.verify(SIGN_ALG, key, Buffer.from(signatureB64, 'base64'), bytes);
}

export { EC_ALG, SIGN_ALG, DAY, subtle, x509, pemEncode, pemToDer, generateKeyPair, initCA, loadCA, resetCACache, signWithCA, verifyCASignature };
