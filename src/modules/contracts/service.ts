// Generación y consulta de contratos (Danna Morales): RF-13, RF-14, RF-15, RF-22, RF-36, RF-37.
import { prisma } from '../../lib/db';
import { ApiError, Errors } from '../../lib/http';
import { splitFiftyFifty } from '../../lib/money';
import { hashContractText } from '../signing/hash';
import { randomUuid } from '../../lib/security/random';
import { TEMPLATE_VERSION, TEMPLATE_BODY, renderContract } from './template';
import { STATES, LABELS } from './stateMachine';
import * as policy from './policy';
import { assertContractIntegrity } from './integrity';
import { assertFlow } from '../chat/flowPolicy';
import { notifyContractPending } from '../chat/notifications';
import * as auth from '../auth/service';

/** Plantilla activa más reciente; si la tabla está vacía se usa la plantilla v1 incluida en el código. */
async function currentTemplate() {
  const t = await prisma.contractTemplate.findFirst({ where: { active: true }, orderBy: { version: 'desc' } });
  return t ? { version: t.version, body: t.body } : { version: TEMPLATE_VERSION, body: TEMPLATE_BODY };
}

/**
 * RF-13 / RF-14: el Cliente solicita contratar un servicio publicado; el sistema genera el contrato desde la
 * plantilla (partes, servicio, precio, plazo, cláusula de cumplimiento y cláusula 50/50) y fija su hash SHA-256.
 */
async function requestContract(user, serviceId) {
  policy.assertCan(user, 'contract:create');
  const service = await prisma.service.findFirst({ where: { id: String(serviceId), status: 'PUBLICADO' }, include: { category: true } });
  if (!service) throw Errors.notFound('El servicio no existe o no está publicado');
  if (service.providerId === user.id) throw Errors.forbidden('No puedes contratar tu propio servicio');

  // Evita duplicados por doble clic: si ya hay un contrato en curso para el mismo servicio se devuelve ese.
  const open = await prisma.contract.findFirst({ where: { clientId: user.id, serviceId: service.id, status: { not: 'COMPLETADO' } }, orderBy: { createdAt: 'desc' } });
  if (open) return { contract: summarize(open, user), existing: true };

  const users = await auth.getPublicUsers([user.id, service.providerId]);
  const client = users.get(user.id);
  const provider = users.get(service.providerId);
  if (!client || !provider) throw Errors.notFound('No se encontró al proveedor');

  const template = await currentTemplate();
  const id = randomUuid();
  const generatedAt = new Date();
  const { anticipoCents, saldoCents } = splitFiftyFifty(service.priceCents);
  const text = renderContract(template.body, {
    templateVersion: template.version,
    contractId: id,
    generatedAt: generatedAt.toISOString(),
    clientName: client.name,
    clientEmail: client.email,
    providerName: provider.tradeName,
    providerEmail: provider.email,
    serviceTitle: service.title,
    categoryName: service.category.name,
    serviceDescription: service.description,
    deliveryDays: service.deliveryDays,
    totalCents: service.priceCents,
    anticipoCents,
    saldoCents,
  });
  const textHash = hashContractText(text); // inmutable desde este momento (RNF-21)

  const contract = await prisma.$transaction(async (tx) => {
    const c = await tx.contract.create({
      data: {
        id, serviceId: service.id, serviceTitle: service.title, serviceDescription: service.description, categoryName: service.category.name,
        clientId: client.id, clientName: client.name, clientEmail: client.email,
        providerId: provider.id, providerName: provider.tradeName, providerEmail: provider.email,
        templateVersion: template.version, text, textHash,
        totalCents: service.priceCents, anticipoCents, saldoCents, currency: 'USD', deliveryDays: service.deliveryDays,
        status: 'GENERADO', createdAt: generatedAt,
      },
    });
    await tx.contractStateChange.create({ data: { contractId: c.id, fromStatus: null, toStatus: 'GENERADO', actorId: user.id, reason: 'Contrato generado desde la plantilla' } });
    return c;
  });

  await notifyContractPending({ contract, recipient: provider });
  return { contract: summarize(contract, user), existing: false };
}

/** RF-22: historial y estado de los contratos propios. El Administrador del sistema no ve contratos. */
async function listContracts(user) {
  policy.assertCan(user, 'contract:read');
  const rows = await prisma.contract.findMany({
    where: { OR: [{ clientId: user.id }, { providerId: user.id }] },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map((c) => summarize(c, user));
}

/** Metadatos del contrato (sin el texto) para las dos partes. */
async function getContractDetail(user, contractId) {
  policy.assertCan(user, 'contract:read');
  const contract = await prisma.contract.findUnique({ where: { id: String(contractId) }, include: { history: { orderBy: { createdAt: 'asc' } } } });
  policy.assertParty(user, contract);
  return {
    ...summarize(contract, user),
    textHash: contract.textHash,
    templateVersion: contract.templateVersion,
    deliveryDays: contract.deliveryDays,
    anticipoCents: contract.anticipoCents,
    saldoCents: contract.saldoCents,
    client: { id: contract.clientId, name: contract.clientName },
    provider: { id: contract.providerId, name: contract.providerName },
    history: contract.history.map((h) => ({ from: h.fromStatus, to: h.toStatus, label: LABELS[h.toStatus], at: h.createdAt, actorId: h.actorId, reason: h.reason })),
    states: STATES.map((s) => ({ key: s, label: LABELS[s] })),
  };
}

/**
 * RF-37 / RF-15 / RS-45: visor protegido. El texto se entrega por POST autenticado (no existe una dirección
 * directa que se pueda copiar y compartir) junto con los datos de la marca de agua del lector.
 */
async function viewContract(user, contractId) {
  policy.assertCan(user, 'contract:read');
  const contract = await prisma.contract.findUnique({ where: { id: String(contractId) } });
  policy.assertParty(user, contract);
  assertFlow({ reader: user, contract, channel: 'platform', sessionValid: true });
  assertContractIntegrity(contract); // RS-20: se vuelve a comprobar el hash guardado
  const reader = await auth.getUserById(user.id);
  return {
    contractId: contract.id,
    status: contract.status,
    text: contract.text,
    hash: contract.textHash,
    templateVersion: contract.templateVersion,
    watermark: { name: reader!.name, email: reader!.email, at: new Date().toISOString() },
  };
}

function summarize(c, viewer) {
  const viewerRole = viewer ? policy.partyRole(viewer, c) : null;
  return {
    id: c.id,
    serviceId: c.serviceId,
    serviceTitle: c.serviceTitle,
    status: c.status,
    statusLabel: LABELS[c.status],
    totalCents: c.totalCents,
    currency: c.currency,
    viewerRole,
    counterpartName: viewerRole === 'CLIENTE' ? c.providerName : c.clientName,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export { requestContract, listContracts, getContractDetail, viewContract, currentTemplate };
