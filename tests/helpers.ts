// Utilidades compartidas por las pruebas: base limpia, CA temporal, usuarios, catálogo y atajos del happy path.
import './envSetup';
import 'reflect-metadata';
import fs from 'fs';
import { prisma } from '../src/lib/db';
import { config } from '../src/lib/env';
import { truncateAll } from '../src/dev/resetDb';
// Los módulos de negocio se cargan solo cuando una prueba los usa (así cada commit del equipo puede probarse por separado).
const lazy = (path) => require(path);

const PASSWORD = 'Clave1234';
// PNG 1x1 válido
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function assertTestDatabase() {
  const name = new URL(process.env.DATABASE_URL as string).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) throw new Error(`Las pruebas solo corren sobre una base terminada en _test (actual: ${name})`);
}

async function ensureCA() {
  let initCA: any;
  try {
    ({ initCA } = lazy('../src/modules/signing/ca'));
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') return; // la CA aún no existe en este punto del historial
    throw e;
  }
  if (!fs.existsSync(config.ca.issuingKeyFile)) await initCA({ force: true });
}

/** Deja la base vacía y lista para una prueba. */
async function resetAll() {
  assertTestDatabase();
  await ensureCA();
  await truncateAll();
}

let counter: any = 0;
async function createUser(role = 'CLIENTE', name: any = null) {
  counter += 1;
  const label = role === 'PROVEEDOR' ? 'Proveedor' : 'Cliente';
  const email = `${label.toLowerCase()}${counter}.${Date.now()}@interadds.test`;
  const u = await lazy('../src/modules/auth/service').register({ name: name || `${label} Prueba${'abcdefghij'[counter % 10]}`, email, password: PASSWORD, confirmPassword: PASSWORD, role });
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

async function createAdmin() {
  const { hashPassword } = lazy('../src/lib/security/passwords');
  const u = await prisma.user.create({ data: { email: `admin${Date.now()}${counter++}@interadds.test`, name: 'Admin Sistema', role: 'ADMIN_SISTEMA', passwordHash: await hashPassword(PASSWORD) } });
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

async function createCategory(name = 'SEO y posicionamiento', slug = 'seo') {
  return prisma.category.upsert({ where: { slug }, create: { name, slug }, update: {} });
}

async function createService(provider, over: any = {}) {
  const cat = over.categoryId ? null : await createCategory();
  return prisma.service.create({
    data: {
      providerId: provider.id,
      categoryId: over.categoryId || cat.id,
      title: over.title || 'Auditoría SEO técnica completa',
      description: over.description || 'Revisión técnica del sitio con informe y plan de correcciones priorizado.',
      priceCents: over.priceCents ?? 10000,
      deliveryDays: over.deliveryDays ?? 7,
      status: over.status || 'PUBLICADO',
    },
  });
}

async function seedTemplate() {
  const { TEMPLATE_VERSION, TEMPLATE_BODY } = lazy('../src/modules/contracts/template');
  await prisma.contractTemplate.upsert({ where: { version: TEMPLATE_VERSION }, create: { version: TEMPLATE_VERSION, name: 'General', body: TEMPLATE_BODY }, update: {} });
}

/** Mundo base: cliente, proveedor, un tercero, un administrador, un servicio publicado y simuladores de navegador. */
async function world(over: any = {}) {
  const { requestContract } = lazy('../src/modules/contracts/service');
  const { createPaymentService } = lazy('../src/modules/payments/service');
  const { FakeGateway } = lazy('../src/modules/payments/fakeGateway');
  const { saveDelivery } = lazy('../src/modules/chat/deliveries');
  const { BrowserSim } = lazy('../src/dev/browserSim');
  await resetAll();
  await seedTemplate();
  const client = await createUser('CLIENTE', 'Camila Andrade');
  const provider = await createUser('PROVEEDOR', 'Valeria Ortiz');
  const other = await createUser('CLIENTE', 'Tercero Curioso');
  const admin = await createAdmin();
  const service = await createService(provider, over.service || {});
  const gateway = new FakeGateway();
  const payments = createPaymentService({ gateway });
  const simC = new BrowserSim(client, PASSWORD);
  const simP = new BrowserSim(provider, PASSWORD);
  const w: any = { client, provider, other, admin, service, gateway, payments, simC, simP };
  // requestContract devuelve el contrato abierto del mismo servicio; por eso cada contrato de prueba usa un servicio nuevo
  w.newContract = async (svc) => (await requestContract(client, (svc || (await createService(provider))).id)).contract.id;
  w.pay = async (contractId, tranche) => {
    const o = await payments.createOrder({ user: client, contractId, tranche, password: PASSWORD });
    gateway.approve(o.orderId);
    return payments.captureOrder({ user: client, contractId, orderId: o.orderId, nonce: o.nonce });
  };
  w.upload = (contractId, over2: any = {}) => saveDelivery({ user: provider, contractId, file: { name: 'entrega.png', type: 'image/png', buffer: PNG, ...over2 } });
  /** Lleva un contrato nuevo hasta el estado indicado usando los mismos servicios que la aplicación. */
  w.advanceTo = async (target, svc) => {
    const order: any = ['GENERADO', 'FIRMADO_PARCIAL', 'VIGENTE', 'ANTICIPO_PAGADO', 'CONTENIDO_ENTREGADO', 'CONTENIDO_APROBADO', 'COMPLETADO'];
    const t = order.indexOf(target);
    const id = await w.newContract(svc);
    if (t >= 1) await simC.signContract(id);
    if (t >= 2) await simP.signContract(id);
    if (t >= 3) await w.pay(id, 'ANTICIPO');
    if (t >= 4) await w.upload(id);
    if (t >= 5) await simC.approveContent(id);
    if (t >= 6) await w.pay(id, 'SALDO');
    return id;
  };
  return w;
}

/** Captura el resultado de una promesa que debe fallar. */
async function rejects(promise) {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error('Se esperaba un error y la operación terminó bien');
}

async function close() {
  await prisma.$disconnect();
}

export { PASSWORD, PNG, prisma, resetAll, world, createUser, createAdmin, createCategory, createService, seedTemplate, rejects, close };
