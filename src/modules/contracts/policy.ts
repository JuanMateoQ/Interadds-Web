// RS-18 (FDP_ACC.1): política de control de acceso por rol sobre servicios, contratos, pagos, chat y contenido.
// RS-19 (FDP_ACF.1): reglas por atributos: el proveedor solo edita sus servicios y solo las DOS partes ven su
// contrato, sus pagos y su sala. El Administrador del sistema no puede abrir contratos ni chats.
import { Errors } from '../../lib/http';

// acción - roles autorizados (RS-18)
const ROLE_POLICY: any = {
  'service:create': ['PROVEEDOR'],
  'service:update': ['PROVEEDOR'],
  'service:delete': ['PROVEEDOR'],
  'contract:create': ['CLIENTE'],
  'contract:read': ['CLIENTE', 'PROVEEDOR'],
  'contract:sign': ['CLIENTE', 'PROVEEDOR'],
  'payment:create': ['CLIENTE'],
  'payment:read': ['CLIENTE', 'PROVEEDOR'],
  'content:upload': ['PROVEEDOR'],
  'content:read': ['CLIENTE', 'PROVEEDOR'],
  'content:approve': ['CLIENTE'],
  'chat:contract': ['CLIENTE', 'PROVEEDOR'],
  'chat:general': ['CLIENTE', 'PROVEEDOR', 'ADMIN_SISTEMA'],
};

function can(user, action) {
  const roles = ROLE_POLICY[action];
  return !!(user && roles && roles.includes(user.role));
}

function assertCan(user, action) {
  if (!can(user, action)) throw Errors.forbidden();
}

function isClientOf(user, contract) {
  return !!user && contract.clientId === user.id;
}
function isProviderOf(user, contract) {
  return !!user && contract.providerId === user.id;
}
/** Atributo clave de RS-19: ser una de las dos partes del contrato. */
function isParty(user, contract) {
  return isClientOf(user, contract) || isProviderOf(user, contract);
}

/** Quien no es parte recibe 404 (no se revela ni que el contrato existe). */
function assertParty(user, contract) {
  if (!contract || !isParty(user, contract)) throw Errors.notFound('Contrato no encontrado');
}

function partyRole(user, contract) {
  if (isClientOf(user, contract)) return 'CLIENTE';
  if (isProviderOf(user, contract)) return 'PROVEEDOR';
  return null;
}

export { ROLE_POLICY, can, assertCan, isParty, isClientOf, isProviderOf, assertParty, partyRole };