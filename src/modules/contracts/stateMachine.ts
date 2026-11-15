// RNF-22: el contrato recorre siete estados y solo avanza en este orden. Cada flecha es una transición válida.
import { ApiError } from '../../lib/http';

const STATES: any = [
  'GENERADO',
  'FIRMADO_PARCIAL',
  'VIGENTE',
  'ANTICIPO_PAGADO',
  'CONTENIDO_ENTREGADO',
  'CONTENIDO_APROBADO',
  'COMPLETADO',
];

const LABELS: any = {
  GENERADO: 'Generado',
  FIRMADO_PARCIAL: 'Firmado por una parte',
  VIGENTE: 'Vigente',
  ANTICIPO_PAGADO: 'Anticipo pagado',
  CONTENIDO_ENTREGADO: 'Contenido entregado',
  CONTENIDO_APROBADO: 'Contenido aprobado',
  COMPLETADO: 'Completado',
};

const TRANSITIONS = STATES.slice(0, -1).map((s, i) => [s, STATES[i + 1]]);

function indexOf(status) {
  const i = STATES.indexOf(status);
  if (i < 0) throw new ApiError(500, 'UNKNOWN_STATE', `Estado de contrato desconocido: ${status}`);
  return i;
}

function nextState(status) {
  const i = indexOf(status);
  return i < STATES.length - 1 ? STATES[i + 1] : null;
}

function canTransition(from, to) {
  if (!STATES.includes(from) || !STATES.includes(to)) return false;
  return indexOf(to) === indexOf(from) + 1;
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new ApiError(409, 'INVALID_TRANSITION', `Transición no permitida: ${LABELS[from] || from} → ${LABELS[to] || to}`);
  }
}

/** ¿El contrato ya alcanzó (o superó) el estado indicado? */
function isAtLeast(status, minimum) {
  return indexOf(status) >= indexOf(minimum);
}

export { STATES, LABELS, TRANSITIONS, nextState, canTransition, assertTransition, isAtLeast };