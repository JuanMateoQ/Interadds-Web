// RS-15 (FCS_RNG.1): generador aleatorio criptográficamente seguro para tokens, nonces y referencias.
// RS-07 (FIA_SOS.2): todos los secretos de la plataforma se generan aquí, nunca con Math.random().
import crypto from 'crypto';

/** Token aleatorio en base64url (256 bits por defecto). */
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Nonce hexadecimal de 128 bits para firmas y pagos. */
function randomNonce(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Serial positivo (bit alto en 0) para certificados X.509. */
function randomSerialHex(bytes = 16) {
  const buf = crypto.randomBytes(bytes);
  buf[0] &= 0x7f;
  if (buf[0] === 0) buf[0] = 0x01;
  return buf.toString('hex');
}

/** Referencia legible y única para recibos. */
function randomReceiptNumber() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `INT-REC-${d}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function randomUuid() {
  return crypto.randomUUID();
}

export { randomToken, randomNonce, randomSerialHex, randomReceiptNumber, randomUuid };
