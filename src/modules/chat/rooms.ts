// Salas de chat: una sala general de Interadds (RF-25) y una sala privada por contrato (RF-23).
// La sala del contrato solo se habilita con el anticipo pagado y solo entran las dos partes.
import { prisma } from '../../lib/db';
import * as contracts from '../contracts/api';
import * as policy from '../contracts/policy';
import { isAtLeast } from '../contracts/stateMachine';

const GENERAL_ROOM_ID = 'general';
const HISTORY_LIMIT = 50;

async function ensureGeneralRoom(db = prisma) {
  return db.room.upsert({
    where: { id: GENERAL_ROOM_ID },
    create: { id: GENERAL_ROOM_ID, kind: 'GENERAL', name: 'Sala general de Interadds' },
    update: {},
  });
}

async function openContractRoom(contractId, db = prisma) {
  return db.room.upsert({
    where: { contractId },
    create: { kind: 'CONTRATO', contractId, name: `Contrato ${contractId.slice(0, 8)}` },
    update: {},
  });
}

/** RF-23: ¿puede este usuario entrar a la sala del contrato? (parte del contrato + anticipo pagado). */
async function checkContractRoomAccess(user, contractId) {
  if (!policy.can(user, 'chat:contract')) return { allowed: false, code: 'FORBIDDEN', reason: 'Tu rol no puede usar el chat del contrato' };
  const contract = await contracts.getContractById(contractId);
  if (!contract || !policy.isParty(user, contract)) return { allowed: false, code: 'NOT_PARTY', reason: 'No eres parte de este contrato' };
  if (!isAtLeast(contract.status, 'ANTICIPO_PAGADO')) {
    return { allowed: false, code: 'NOT_ENABLED', reason: 'El chat se habilita cuando el anticipo está pagado' };
  }
  return { allowed: true, contract };
}

async function history(roomId, limit = HISTORY_LIMIT) {
  const rows = await prisma.message.findMany({ where: { roomId }, orderBy: { createdAt: 'desc' }, take: limit });
  return rows.reverse().map(messageOut);
}

async function saveMessage({ roomId, user, text }) {
  const m = await prisma.message.create({ data: { roomId, authorId: user.id, authorName: user.name, text } });
  return messageOut(m);
}

function messageOut(m) {
  return { id: m.id, authorId: m.authorId, authorName: m.authorName, text: m.text, createdAt: m.createdAt };
}

export { GENERAL_ROOM_ID, ensureGeneralRoom, openContractRoom, checkContractRoomAccess, history, saveMessage };
