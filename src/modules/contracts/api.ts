// Interfaz pública del módulo de contratos hacia los demás módulos (firma, pagos, chat).
import { prisma } from '../../lib/db';
import { ApiError, Errors } from '../../lib/http';
import { assertTransition, isAtLeast } from './stateMachine';
import * as policy from './policy';
import { assertContractIntegrity } from './integrity';

async function getContractById(id, client = prisma) {
  if (!id || typeof id !== 'string') return null;
  return client.contract.findUnique({ where: { id } });
}

// Carga el contrato y exige que el usuario sea una de las dos partes (RF-15, RS-19).
async function getContractForParty(user, contractId, client = prisma) {
  const contract = await getContractById(contractId, client);
  policy.assertParty(user, contract);
  return contract;
}

/**
 * Avanza el estado del contrato un paso (RNF-22). El UPDATE lleva el estado de origen en el WHERE
 * (concurrencia optimista) y además un trigger de PostgreSQL rechaza saltos o retrocesos.
 */
async function advanceStatus(contractId, to, { actorId = null, reason = null, tx = null }: any = {}) {
  const run = async (db) => {
    const contract = await db.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw Errors.notFound('Contrato no encontrado');
    assertTransition(contract.status, to);
    const res = await db.contract.updateMany({ where: { id: contractId, status: contract.status }, data: { status: to } });
    if (res.count !== 1) throw new ApiError(409, 'STATE_CONFLICT', 'El estado del contrato cambió mientras se procesaba la operación');
    await db.contractStateChange.create({ data: { contractId, fromStatus: contract.status, toStatus: to, actorId, reason } });
    return { ...contract, status: to };
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

export { getContractById, getContractForParty, advanceStatus, assertContractIntegrity, isAtLeast, policy };