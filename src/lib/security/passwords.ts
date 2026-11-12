// RS-12 (FCS_CKM.5) y RNF-03: la clave guardada se deriva con bcrypt (hash + sal por usuario).
// Nunca se guarda en texto plano ni cifrada de forma reversible.
import bcrypt from 'bcryptjs';
import { config } from '../env';

async function hashPassword(plain) {
  return bcrypt.hash(plain, config.bcryptRounds);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

// Hash "señuelo": cuando el correo no existe se compara igual para que el tiempo de respuesta
// no delate si la cuenta existe (RS-04).
let dummyPromise: any = null;
function dummyHash() {
  if (!dummyPromise) dummyPromise = bcrypt.hash('interadds-dummy-password', config.bcryptRounds);
  return dummyPromise;
}

export { hashPassword, verifyPassword, dummyHash };
