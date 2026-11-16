// Catálogo y servicios: RF-08, RF-10..13, RS-41 (control de acceso por rol)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './helpers';
import * as catalog from '../src/modules/contracts/catalog';
import { requestContract } from '../src/modules/contracts/service';

let w: any;
test.before(async () => { w = await H.world(); });
test.after(() => H.close());

const body = (cat, over: any = {}) => ({ title: 'Gestión de redes sociales', categoryId: cat, description: 'Planificación y publicación de contenido durante un mes.', price: '80.00', deliveryDays: '10', status: 'PUBLICADO', ...over });

test('el Proveedor crea, edita y lista sus servicios; el Cliente no puede crear', async () => {
  const s = await catalog.createService(w.provider, body(w.service.categoryId));
  assert.equal(s.priceCents, 8000);
  const upd = await catalog.updateService(w.provider, s.id, body(w.service.categoryId, { title: 'Gestión de redes ampliada', price: '95.50' }));
  assert.equal(upd.priceCents, 9550);
  assert.ok((await catalog.listOwn(w.provider)).length >= 2);
  const e = await H.rejects(catalog.createService(w.client, body(w.service.categoryId)));
  assert.equal(e.status, 403);
});

test('un Proveedor no puede editar ni borrar servicios de otro', async () => {
  const other = await H.createUser('PROVEEDOR');
  const e1 = await H.rejects(catalog.updateService(other, w.service.id, body(w.service.categoryId)));
  assert.ok([403, 404].includes(e1.status));
  const e2 = await H.rejects(catalog.deleteService(other, w.service.id, { confirm: true }));
  assert.ok([403, 404].includes(e2.status));
});

test('el catálogo público solo muestra servicios publicados, con búsqueda, filtro y paginación', async () => {
  await catalog.createService(w.provider, body(w.service.categoryId, { title: 'Borrador secreto', status: 'BORRADOR' }));
  const all = await catalog.listPublished({});
  assert.ok(all.items.every((i) => i.status === 'PUBLICADO'));
  assert.ok(!all.items.some((i) => i.title === 'Borrador secreto'));
  const q = await catalog.listPublished({ q: 'redes' });
  assert.ok(q.items.length >= 1 && q.items.every((i) => /redes/i.test(i.title + i.description)));
  const price = await catalog.listPublished({ min: '90', max: '200' });
  assert.ok(price.items.every((i) => i.priceCents >= 9000));
  const page = await catalog.listPublished({ pageSize: '1', page: '1' });
  assert.equal(page.items.length, 1);
  assert.ok(page.total >= 2);
});

test('detalle público: un borrador no es accesible', async () => {
  const draft = await catalog.createService(w.provider, body(w.service.categoryId, { title: 'Otro borrador', status: 'BORRADOR' }));
  const e = await H.rejects(catalog.getPublished(draft.id));
  assert.equal(e.status, 404);
  assert.equal((await catalog.getPublished(w.service.id)).id, w.service.id);
});

test('eliminar exige confirmación y, con contratos activos, solo se pausa (RF-12)', async () => {
  const s = await catalog.createService(w.provider, body(w.service.categoryId, { title: 'Servicio temporal' }));
  await H.rejects(catalog.deleteService(w.provider, s.id, {}));
  const r = await catalog.deleteService(w.provider, s.id, { confirm: true });
  assert.equal(r.deleted, true);
  await requestContract(w.client, w.service.id);
  const paused = await catalog.deleteService(w.provider, w.service.id, { confirm: true });
  assert.equal(paused.deleted, false);
  assert.equal(paused.paused, true);
});
