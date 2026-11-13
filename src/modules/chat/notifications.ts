// RF-29: notificación en tiempo real de cada hito (la contraparte firmó, anticipo recibido, contenido subido,
// contenido aprobado y saldo pagado). Se guarda en la base y se emite por Socket.IO a la sala privada del usuario.
import { prisma } from '../../lib/db';
import { sendMail } from '../../lib/mailer';
import { composePendingContractEmail } from './flowPolicy';

function getIO() {
  return globalThis.__interaddsIO || null;
}

function emitToUser(userId, event, payload) {
  const io = getIO();
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

/** Crea y emite una notificación. El texto nunca incluye partes del contrato (RS-44). */
async function notify({ userId, type, contractId = null, title, body }: any) {
  const n = await prisma.notification.create({ data: { userId, type, contractId, title, body } });
  emitToUser(userId, 'notification', serialize(n));
  return n;
}

/** Contrato generado: aviso en la plataforma y correo simulado sin texto ni adjuntos (RF-36). */
async function notifyContractPending({ contract, recipient }) {
  await notify({
    userId: recipient.id,
    type: 'CONTRATO_PENDIENTE',
    contractId: contract.id,
    title: 'Tienes un contrato pendiente',
    body: `Hay un contrato nuevo por el servicio «${contract.serviceTitle}». Ábrelo dentro de Interadds para leerlo y firmarlo.`,
  });
  const mail = composePendingContractEmail({ toName: recipient.name, contractId: contract.id });
  sendMail({ to: recipient.email, subject: mail.subject, text: mail.text });
}

async function listForUser(userId, { limit = 30 }: any = {}) {
  const rows = await prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: limit });
  const unread = await prisma.notification.count({ where: { userId, readAt: null } });
  return { items: rows.map(serialize), unread };
}

async function markRead(userId, ids) {
  const where: any = { userId, readAt: null };
  if (Array.isArray(ids) && ids.length) where.id = { in: ids };
  const r = await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
  return { updated: r.count };
}

function serialize(n) {
  return { id: n.id, type: n.type, contractId: n.contractId, title: n.title, body: n.body, read: !!n.readAt, createdAt: n.createdAt };
}

export { notify, notifyContractPending, listForUser, markRead, emitToUser, getIO };
