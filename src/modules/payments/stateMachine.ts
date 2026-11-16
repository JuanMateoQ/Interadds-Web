// RNF-22: el estado de cada pago sigue solo transiciones válidas.
//   CREADA    -> CAPTURADA | PENDIENTE | FALLIDA
//   PENDIENTE -> CREADA (nueva orden con la misma referencia) | CAPTURADA | FALLIDA
//   FALLIDA   -> CREADA (reintento)
//   CAPTURADA es final: nunca se vuelve a cobrar.
import { ApiError } from '../../lib/http';

const TRANSITIONS: any = {
  CREADA: ['CAPTURADA', 'PENDIENTE', 'FALLIDA'],
  PENDIENTE: ['CREADA', 'CAPTURADA', 'FALLIDA'],
  FALLIDA: ['CREADA'],
  CAPTURADA: [],
};

function canTransition(from, to) {
  return from === to || (TRANSITIONS[from] || []).includes(to);
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new ApiError(409, 'INVALID_PAYMENT_TRANSITION', `Transición de pago no permitida: ${from} → ${to}`);
  }
}

export { TRANSITIONS, canTransition, assertTransition };
