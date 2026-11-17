// RNF-01: validación (requeridos, formato, longitud, solo números). Pruebas unitarias sin base de datos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSchema, loginSchema, profileSchema, resetSchema, validateForm } from '../src/lib/validation/auth';
import { serviceSchema, catalogQuerySchema } from '../src/lib/validation/catalog';
import { sanitizeMessage, validateMessage, MAX_MESSAGE_LENGTH } from '../src/modules/chat/sanitize';
import { validateFile } from '../src/modules/chat/deliveries';
import { config } from '../src/lib/env';
import { safeNext } from '../src/lib/http';
import { splitFiftyFifty, toDecimalString } from '../src/lib/money';

const good: any = { name: 'Ana Pérez', email: 'ana@correo.com', password: 'Clave1234', confirmPassword: 'Clave1234', role: 'CLIENTE' };

test('registro: datos válidos y rol por defecto Cliente (RS-41)', () => {
  const r = registerSchema.parse({ ...good, role: undefined });
  assert.equal(r.role, 'CLIENTE');
  assert.equal(r.email, 'ana@correo.com');
});

test('registro: nunca se puede elegir el rol de administrador', () => {
  assert.equal(registerSchema.safeParse({ ...good, role: 'ADMIN_SISTEMA' }).success, false);
});

test('registro: requeridos, formato de correo, longitud de clave y coincidencia', () => {
  const v = validateForm(registerSchema, { name: '', email: 'no-es-correo', password: 'corta', confirmPassword: 'otra' });
  assert.equal(v.ok, false);
  assert.ok(v.errors.name && v.errors.email && v.errors.password && v.errors.confirmPassword || v.errors.password);
  assert.match(v.errors.email, /correo válido/);
  const mismatch = validateForm(registerSchema, { ...good, confirmPassword: 'Distinta999' });
  assert.equal(mismatch.errors.confirmPassword, 'Las claves no coinciden');
});

test('registro: la clave exige al menos una letra y un número', () => {
  assert.equal(registerSchema.safeParse({ ...good, password: '12345678', confirmPassword: '12345678' }).success, false);
  assert.equal(registerSchema.safeParse({ ...good, password: 'soloLetras', confirmPassword: 'soloLetras' }).success, false);
});

test('teléfono: solo números de 7 a 15 dígitos', () => {
  assert.equal(profileSchema.safeParse({ name: 'Ana Pérez', phone: '0991234567' }).success, true);
  assert.equal(profileSchema.safeParse({ name: 'Ana Pérez', phone: '099-123-456' }).success, false);
  assert.equal(profileSchema.safeParse({ name: 'Ana Pérez', phone: '12345' }).success, false);
});

test('login y reset: campos requeridos', () => {
  assert.equal(loginSchema.safeParse({ email: '', password: '' }).success, false);
  assert.equal(resetSchema.safeParse({ token: 'x', password: 'Clave1234', confirmPassword: 'Clave1234' }).success, false);
});

test('servicio: al menos 5 atributos validados (título, categoría, descripción, precio y plazo)', () => {
  const ok: any = { title: 'Auditoría SEO completa', categoryId: 'cat-1', description: 'Descripción suficientemente larga del servicio.', price: '120.50', deliveryDays: '7' };
  const parsed = serviceSchema.parse(ok);
  assert.equal(parsed.price, 120.5);
  assert.equal(parsed.deliveryDays, 7);
  assert.equal(parsed.status, 'BORRADOR');
  for (const bad of [{ title: 'abc' }, { categoryId: '' }, { description: 'corta' }, { price: '-3' }, { price: '10.999' }, { deliveryDays: '0' }, { deliveryDays: '2.5' }, { deliveryDays: '400' }]) {
    assert.equal(serviceSchema.safeParse({ ...ok, ...bad }).success, false, JSON.stringify(bad));
  }
});

test('catálogo: parámetros con valores por defecto y rango de precio coherente', () => {
  const q = catalogQuerySchema.parse({});
  assert.deepEqual([q.page, q.pageSize], [1, 9]);
  assert.equal(catalogQuerySchema.safeParse({ min: '50', max: '10' }).success, false);
  assert.equal(catalogQuerySchema.safeParse({ pageSize: '500' }).success, false);
});

test('mensajes del chat: se eliminan etiquetas, caracteres de control y marcas bidi', () => {
  const dirty = 'Hola <script>alert(1)</script><b>mundo</b>\u0000‮ <img src=x onerror=alert(1)>';
  const clean = sanitizeMessage(dirty);
  assert.ok(!/<|>/.test(clean), clean);
  assert.ok(!clean.includes('\u0000') && !clean.includes('‮'));
  assert.ok(clean.startsWith('Hola'));
  assert.ok(!sanitizeMessage('<scr<script>ipt>x</scr</script>ipt>').includes('<'));
});

test('mensajes del chat: vacíos y demasiado largos', () => {
  assert.equal(validateMessage('   ').ok, false);
  assert.equal(validateMessage(123).ok, false);
  assert.equal(validateMessage('a'.repeat(MAX_MESSAGE_LENGTH * 3)).ok, false);
  assert.equal(sanitizeMessage('a'.repeat(MAX_MESSAGE_LENGTH + 50)).length, MAX_MESSAGE_LENGTH);
});

test('archivos: tipo, extensión, firma real y tamaño (RF-26)', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  assert.doesNotThrow(() => validateFile({ name: 'a.png', type: 'image/png', buffer: png }));
  const throwsCode = (args, code) => assert.throws(() => validateFile(args), (e: any) => e.code === code, code);
  throwsCode({ name: 'a.exe', type: 'application/x-msdownload', buffer: png }, 'TYPE_NOT_ALLOWED');
  throwsCode({ name: 'a.jpg', type: 'image/png', buffer: png }, 'EXTENSION_MISMATCH');
  throwsCode({ name: 'a.png', type: 'image/png', buffer: Buffer.from('MZ-no-soy-una-imagen') }, 'CONTENT_MISMATCH');
  assert.throws(() => validateFile({ name: 'a.png', type: 'image/png', buffer: Buffer.alloc(0) }));
  throwsCode({ name: 'a.pdf', type: 'application/pdf', buffer: Buffer.alloc(config.maxUploadBytes + 1, 0x25) }, 'FILE_TOO_LARGE');
});

test('redirección: solo rutas internas (evita open redirect)', () => {
  assert.equal(safeNext('/servicios/abc'), '/servicios/abc');
  for (const bad of ['https://evil.test', '//evil.test', '\\\\evil', 'javascript:alert(1)', undefined, 42]) {
    assert.equal(safeNext(bad), '/inicio', String(bad));
  }
});

test('dinero: reparto 50/50 sin perder centavos y formato decimal de PayPal', () => {
  assert.deepEqual(splitFiftyFifty(10000), { anticipoCents: 5000, saldoCents: 5000 });
  assert.deepEqual(splitFiftyFifty(10001), { anticipoCents: 5000, saldoCents: 5001 });
  assert.equal(toDecimalString(5000), '50.00');
  assert.equal(toDecimalString(5001), '50.01');
});
