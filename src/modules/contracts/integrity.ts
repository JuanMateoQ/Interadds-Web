/* RS-20 (FDP_SDI.1) y RNF-21: se vuelve a calcular el hash de lo guardado y se compara con el hash fijado
   al generar el contrato. Cualquier alteración del texto se detecta y deja sin validez las firmas. */
import { ApiError } from '../../lib/http';
import { hashContractText, safeEqualHex } from '../signing/hash';

function checkContractIntegrity(contract) {
  const actual = hashContractText(contract.text);
  return { ok: safeEqualHex(actual, contract.textHash), expected: contract.textHash, actual };
}

function assertContractIntegrity(contract) {
  const r = checkContractIntegrity(contract);
  if (!r.ok) {
    console.error(`[integridad] El contrato ${contract.id} no coincide con su hash`);
    throw new ApiError(409, 'INTEGRITY_VIOLATION', 'El contrato guardado no coincide con su hash: se detectó una alteración');
  }
  return r;
}

export { checkContractIntegrity, assertContractIntegrity };