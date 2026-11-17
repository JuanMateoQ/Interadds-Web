// Semillas de demostración (Sebas Ramos: usuarios por rol; Danna Morales: servicios y contratos en los 7 estados).
// Los contratos se construyen con los MISMOS servicios que usa la aplicación (firmas reales con certificados de la CA,
// pagos con la pasarela simulada, evidencias y entregas), así cada estado es coherente y verificable.
//   npm run db:seed        (borra los datos existentes: solo para desarrollo)
import 'reflect-metadata';
import { prisma } from '../src/lib/db';
import { config } from '../src/lib/env';
import { hashPassword } from '../src/lib/security/passwords';
import { TEMPLATE_VERSION, TEMPLATE_BODY } from '../src/modules/contracts/template';
import { requestContract } from '../src/modules/contracts/service';
import { createPaymentService } from '../src/modules/payments/service';
import { FakeGateway } from '../src/modules/payments/fakeGateway';
import { saveDelivery } from '../src/modules/chat/deliveries';
import * as rooms from '../src/modules/chat/rooms';
import { BrowserSim } from '../src/dev/browserSim';
import { loadCA } from '../src/modules/signing/ca';
import { truncateAll } from '../src/dev/resetDb';

const PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Demo1234!';

// PNG válido de 1x1 píxel para la entrega de demostración
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const CATEGORIES: any = [
  ['SEO y posicionamiento', 'seo'],
  ['Redes sociales', 'redes-sociales'],
  ['Branding e identidad', 'branding'],
  ['Email marketing', 'email-marketing'],
  ['Publicidad pagada (Ads)', 'publicidad-pagada'],
  ['Producción audiovisual', 'audiovisual'],
  ['Copywriting', 'copywriting'],
];

const SERVICES: any = [
  // proveedor 1 (Agencia Pixel Norte)
  { p: 1, c: 'seo', title: 'Auditoría SEO técnica completa', price: 180, days: 7, desc: 'Revisión técnica del sitio: velocidad, indexación, estructura de enlaces y plan de correcciones priorizado con informe en PDF.' },
  { p: 1, c: 'redes-sociales', title: 'Calendario de contenido para Instagram (30 días)', price: 240, days: 10, desc: 'Plan editorial de 30 publicaciones con ideas, textos y recomendaciones de horarios para tu cuenta de Instagram.' },
  { p: 1, c: 'branding', title: 'Identidad visual básica para emprendedores', price: 420, days: 14, desc: 'Logotipo, paleta de colores, tipografías y mini manual de marca listos para usar en redes y material impreso.' },
  { p: 1, c: 'email-marketing', title: 'Secuencia de 5 correos de bienvenida', price: 150, days: 6, desc: 'Redacción y diseño de una secuencia automatizada de 5 correos para dar la bienvenida a nuevos suscriptores.' },
  { p: 1, c: 'copywriting', title: 'Textos para landing page de alta conversión', price: 130, days: 5, desc: 'Redacción persuasiva de la landing page completa: titulares, beneficios, prueba social y llamadas a la acción.' },
  // proveedor 2 (Luz y Pixel Estudio)
  { p: 2, c: 'audiovisual', title: 'Video corporativo de 60 segundos', price: 650, days: 15, desc: 'Guion, grabación y edición de un video institucional de 60 segundos con música, rótulos y entrega en formato web.' },
  { p: 2, c: 'publicidad-pagada', title: 'Campaña de Google Ads por 30 días', price: 320, days: 30, desc: 'Configuración, optimización semanal y reporte final de una campaña de búsqueda en Google Ads para tu negocio.' },
  { p: 2, c: 'redes-sociales', title: 'Gestión de redes sociales por un mes', price: 380, days: 30, desc: 'Publicación diaria, respuesta a comentarios y reporte mensual de métricas en Facebook e Instagram.' },
  { p: 2, c: 'seo', title: 'Posicionamiento local en Google Maps', price: 210, days: 12, desc: 'Optimización de tu ficha de Google Business Profile, reseñas y palabras clave locales para aparecer en Maps.' },
  { p: 2, c: 'copywriting', title: 'Guion para video explicativo', price: 95, days: 4, desc: 'Guion claro y persuasivo para un video explicativo de 90 segundos sobre tu producto o servicio.' },
  { p: 2, c: 'branding', title: 'Rediseño de logotipo con 3 propuestas', price: 280, days: 9, desc: 'Tres propuestas de rediseño de logotipo, una ronda de ajustes y archivos finales en vectores y PNG.' },
  { p: 1, c: 'publicidad-pagada', title: 'Campaña en Meta Ads para tienda en línea', price: 340, days: 21, desc: 'Estrategia, creatividades y optimización de campañas en Facebook e Instagram Ads orientadas a ventas.' },
];

async function main() {
  await loadCA(); // falla pronto si falta "npm run ca:init"
  await truncateAll();

  const passwordHash = await hashPassword(PASSWORD);
  const mk = (email, name, role) => prisma.user.create({ data: { email, name, role, passwordHash } });
  const admin = await mk('admin@interadds.test', 'Administrador del Sistema', 'ADMIN_SISTEMA');
  const cliente = await mk('cliente@interadds.test', 'Camila Andrade', 'CLIENTE');
  const cliente2 = await mk('cliente2@interadds.test', 'Diego Salazar', 'CLIENTE');
  const prov1 = await mk('proveedor@interadds.test', 'Valeria Ortiz', 'PROVEEDOR');
  const prov2 = await mk('proveedor2@interadds.test', 'Martín Paredes', 'PROVEEDOR');
  await prisma.providerProfile.create({ data: { userId: prov1.id, tradeName: 'Agencia Pixel Norte', description: 'Agencia boutique de marketing digital: SEO, contenido y branding para pymes ecuatorianas.', contactEmail: 'hola@pixelnorte.test', contactPhone: '0991234567' } });
  await prisma.providerProfile.create({ data: { userId: prov2.id, tradeName: 'Luz y Pixel Estudio', description: 'Estudio audiovisual y de performance: video corporativo, Google Ads y gestión de redes sociales.', contactEmail: 'contacto@luzypixel.test', contactPhone: '0987654321' } });

  const cats: any = {};
  for (const [name, slug] of CATEGORIES) cats[slug] = await prisma.category.create({ data: { name, slug } });
  await prisma.contractTemplate.create({ data: { version: TEMPLATE_VERSION, name: 'Contrato general de servicios de marketing', body: TEMPLATE_BODY, active: true } });
  await rooms.ensureGeneralRoom();

  const services: any = [];
  for (const s of SERVICES) {
    services.push(await prisma.service.create({
      data: { providerId: s.p === 1 ? prov1.id : prov2.id, categoryId: cats[s.c].id, title: s.title, description: s.desc, priceCents: Math.round(s.price * 100), deliveryDays: s.days, status: 'PUBLICADO' },
    }));
  }
  // un borrador y uno pausado para mostrar los estados del servicio
  await prisma.service.create({ data: { providerId: prov1.id, categoryId: cats.seo.id, title: 'Consultoría SEO mensual (borrador)', description: 'Servicio en preparación: acompañamiento mensual de SEO con reuniones de seguimiento.', priceCents: 30000, deliveryDays: 30, status: 'BORRADOR' } });
  await prisma.service.create({ data: { providerId: prov2.id, categoryId: cats.audiovisual.id, title: 'Cobertura de eventos corporativos (pausado)', description: 'Servicio pausado temporalmente: fotografía y video de eventos corporativos de medio día.', priceCents: 45000, deliveryDays: 8, status: 'PAUSADO' } });

  const gateway = new FakeGateway();
  const payments = createPaymentService({ gateway });
  const u = (x) => ({ id: x.id, name: x.name, email: x.email, role: x.role });
  const simClient = new BrowserSim(u(cliente), PASSWORD);
  const simP1 = new BrowserSim(u(prov1), PASSWORD);
  const simP2 = new BrowserSim(u(prov2), PASSWORD);

  const owner = (svc) => (svc.providerId === prov1.id ? { sim: simP1, user: u(prov1) } : { sim: simP2, user: u(prov2) });
  async function newContract(svc) {
    const { contract } = await requestContract(u(cliente), svc.id);
    return contract.id;
  }
  async function pay(contractId, tranche) {
    const o = await payments.createOrder({ user: u(cliente), contractId, tranche, password: PASSWORD });
    gateway.approve(o.orderId);
    return payments.captureOrder({ user: u(cliente), contractId, orderId: o.orderId, nonce: o.nonce });
  }

  // Los 7 estados del contrato, cada uno en un servicio distinto (RNF-22)
  const ids: any = {};
  ids.GENERADO = await newContract(services[0]);

  ids.FIRMADO_PARCIAL = await newContract(services[1]);
  await simClient.signContract(ids.FIRMADO_PARCIAL);

  ids.VIGENTE = await newContract(services[2]);
  await simClient.signContract(ids.VIGENTE);
  await owner(services[2]).sim.signContract(ids.VIGENTE);

  async function untilAnticipo(svc) {
    const id = await newContract(svc);
    await simClient.signContract(id);
    await owner(svc).sim.signContract(id);
    await pay(id, 'ANTICIPO');
    return id;
  }

  ids.ANTICIPO_PAGADO = await untilAnticipo(services[3]);
  const room = await rooms.openContractRoom(ids.ANTICIPO_PAGADO);
  await rooms.saveMessage({ roomId: room.id, user: u(cliente), text: '¡Hola! Ya realicé el anticipo. ¿Cuándo podrías compartirme el primer avance?' });
  await rooms.saveMessage({ roomId: room.id, user: u(prov1), text: 'Hola Camila, gracias. Te comparto el primer borrador en un par de días.' });

  async function delivered(svc) {
    const id = await untilAnticipo(svc);
    await saveDelivery({ user: owner(svc).user, contractId: id, file: { name: 'entrega-v1.png', type: 'image/png', buffer: PNG_1X1 } });
    return id;
  }
  ids.CONTENIDO_ENTREGADO = await delivered(services[4]);

  ids.CONTENIDO_APROBADO = await delivered(services[5]);
  await simClient.approveContent(ids.CONTENIDO_APROBADO);

  ids.COMPLETADO = await delivered(services[6]);
  await simClient.approveContent(ids.COMPLETADO);
  await pay(ids.COMPLETADO, 'SALDO');

  // El segundo cliente queda "limpio" para recorrer el happy path completo en la demo
  console.log('\nSemillas creadas.');
  console.log(`Clave de TODAS las cuentas de demostración: ${PASSWORD}`);
  console.table([
    { rol: 'Administrador del sistema', correo: admin.email },
    { rol: 'Cliente', correo: cliente.email },
    { rol: 'Cliente (sin contratos)', correo: cliente2.email },
    { rol: 'Proveedor (Agencia Pixel Norte)', correo: prov1.email },
    { rol: 'Proveedor (Luz y Pixel Estudio)', correo: prov2.email },
  ]);
  console.log('Contratos de demostración por estado:');
  console.table(Object.entries(ids).map(([estado, id]) => ({ estado, contrato: id })));
}

main()
  .catch((e) => {
    console.error('Error en el seed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
