// Catálogo público y CRUD de servicios del Proveedor (RF-01, RF-02, RF-10, RF-11, RF-12).
import { prisma } from '../../lib/db';
import { Errors } from '../../lib/http';
import { toCents, fromCents } from '../../lib/money';
import { serviceSchema, catalogQuerySchema, deleteServiceSchema } from '../../lib/validation/catalog';
import * as auth from '../auth/service';
import * as policy from './policy';

async function listCategories() {
  return prisma.category.findMany({ orderBy: { name: 'asc' } });
}

function serviceOut(s: any, provider?: any) {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    category: s.category ? { id: s.category.id, name: s.category.name, slug: s.category.slug } : undefined,
    categoryId: s.categoryId,
    price: fromCents(s.priceCents),
    priceCents: s.priceCents,
    deliveryDays: s.deliveryDays,
    status: s.status,
    providerId: s.providerId,
    provider: provider ? { id: provider.id, tradeName: provider.tradeName, description: provider.providerDescription } : undefined,
    createdAt: s.createdAt,
  };
}

/** RF-01: listado paginado de servicios PUBLICADOS con búsqueda y filtro por título, categoría y rango de precio. */
async function listPublished(rawQuery: any = {}) {
  const q = catalogQuerySchema.parse(rawQuery);
  const where: any = { status: 'PUBLICADO' };
  if (q.q) where.title = { contains: q.q, mode: 'insensitive' };
  if (q.category) where.category = { OR: [{ slug: q.category }, { id: q.category }] };
  if (q.min !== undefined || q.max !== undefined) {
    where.priceCents = {};
    if (q.min !== undefined) where.priceCents.gte = toCents(q.min);
    if (q.max !== undefined) where.priceCents.lte = toCents(q.max);
  }
  const [total, rows] = await Promise.all([
    prisma.service.count({ where }),
    prisma.service.findMany({
      where,
      include: { category: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  const providers = await auth.getPublicUsers([...new Set(rows.map((r) => r.providerId))]);
  return {
    items: rows.map((s) => serviceOut(s, providers.get(s.providerId))),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

/** RF-02: detalle de un servicio publicado (precio, plazo y proveedor). */
async function getPublished(id) {
  const s = await prisma.service.findFirst({ where: { id: String(id), status: 'PUBLICADO' }, include: { category: true } });
  if (!s) throw Errors.notFound('El servicio no existe o no está publicado');
  const providers = await auth.getPublicUsers([s.providerId]);
  return serviceOut(s, providers.get(s.providerId));
}

// ── CRUD del Proveedor: solo sobre sus propios servicios (RS-19) ──

async function listOwn(user) {
  policy.assertCan(user, 'service:create');
  const rows = await prisma.service.findMany({ where: { providerId: user.id }, include: { category: true }, orderBy: { createdAt: 'desc' } });
  return rows.map((s) => serviceOut(s));
}

async function loadOwn(user, id) {
  const s = await prisma.service.findUnique({ where: { id: String(id) }, include: { category: true } });
  if (!s || s.providerId !== user.id) throw Errors.notFound('Servicio no encontrado');
  return s;
}

async function getOwn(user, id) {
  policy.assertCan(user, 'service:update');
  return serviceOut(await loadOwn(user, id));
}

async function ensureCategory(categoryId) {
  const c = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!c) throw Errors.badRequest('La categoría elegida no existe', { categoryId: 'Elige una categoría válida' });
  return c;
}

/** RF-10: crear un servicio con al menos 5 atributos validados (título, categoría, descripción, precio y plazo). */
async function createService(user, input) {
  policy.assertCan(user, 'service:create');
  const d = serviceSchema.parse(input);
  await ensureCategory(d.categoryId);
  const s = await prisma.service.create({
    data: { providerId: user.id, categoryId: d.categoryId, title: d.title, description: d.description, priceCents: toCents(d.price), deliveryDays: d.deliveryDays, status: d.status },
    include: { category: true },
  });
  return serviceOut(s);
}

/** RF-11: actualizar un servicio propio. */
async function updateService(user, id, input) {
  policy.assertCan(user, 'service:update');
  await loadOwn(user, id);
  const d = serviceSchema.parse(input);
  await ensureCategory(d.categoryId);
  const s = await prisma.service.update({
    where: { id: String(id) },
    data: { categoryId: d.categoryId, title: d.title, description: d.description, priceCents: toCents(d.price), deliveryDays: d.deliveryDays, status: d.status },
    include: { category: true },
  });
  return serviceOut(s);
}

/**
 * RF-12: eliminar con confirmación. Si el servicio tiene contratos activos (no completados) solo se puede
 * pausar: se pausa en lugar de borrarse.
 */
async function deleteService(user, id, input) {
  policy.assertCan(user, 'service:delete');
  deleteServiceSchema.parse(input);
  const s = await loadOwn(user, id);
  const active = await prisma.contract.count({ where: { serviceId: s.id, status: { not: 'COMPLETADO' } } });
  if (active > 0) {
    await prisma.service.update({ where: { id: s.id }, data: { status: 'PAUSADO' } });
    return { deleted: false, paused: true, activeContracts: active, message: 'El servicio tiene contratos activos: solo se puede pausar. Quedó en estado Pausado.' };
  }
  await prisma.service.delete({ where: { id: s.id } });
  return { deleted: true, paused: false };
}

export { listCategories, listPublished, getPublished, listOwn, getOwn, createService, updateService, deleteService };
