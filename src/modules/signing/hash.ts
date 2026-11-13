// RS-14 (FCS_COP.1): operación criptográfica de hash SHA-256 del contrato y de los registros de evidencia.
import crypto from 'crypto';

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** Hash SHA-256 (hex) del texto final del contrato, codificado en UTF-8 (RF-14). */
function hashContractText(text) {
  return sha256Hex(Buffer.from(text, 'utf8'));
}

/** JSON canónico: claves ordenadas, para que el mismo registro produzca siempre el mismo hash. */
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value === undefined ? null : value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
}

function hashRecord(record) {
  return sha256Hex(canonicalize(record));
}

function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export { sha256Hex, hashContractText, canonicalize, hashRecord, safeEqualHex };
