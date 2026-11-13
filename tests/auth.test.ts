// Módulo de autenticación: RF-01..07, RS-03/04/12/37/41/42
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './helpers';
import * as auth from '../src/modules/auth/service';
import * as session from '../src/modules/auth/session';
import { verifyPassword } from '../src/lib/security/passwords';

test.before(() => H.resetAll());
test.after(() => H.close());

test('registro guarda la clave con bcrypt (nunca en claro) y el rol por defecto es Cliente', async () => {
  const u = await auth.register({ name: 'Ana Pérez', email: 'ana@correo.com', password: 'Clave1234', confirmPassword: 'Clave1234' });
  assert.equal(u.role, 'CLIENTE');
  const row = await H.prisma.user.findUnique({ where: { email: 'ana@correo.com' } });
  assert.match(row.passwordHash, /^\$2[aby]\$/);
  assert.notEqual(row.passwordHash, 'Clave1234');
  assert.ok(await verifyPassword('Clave1234', row.passwordHash));
});

test('correo duplicado y datos inválidos se rechazan', async () => {
  const e = await H.rejects(auth.register({ name: 'Otra', email: 'ana@correo.com', password: 'Clave1234', confirmPassword: 'Clave1234' }));
  assert.equal(e.status, 409);
  await H.rejects(auth.register({ name: '', email: 'x', password: '1', confirmPassword: '2' }));
});

test('login correcto crea sesión; el token solo se guarda como hash', async () => {
  const { session: s, user } = await auth.login({ email: 'ana@correo.com', password: 'Clave1234' });
  assert.equal(user.email, 'ana@correo.com');
  const row = await H.prisma.session.findFirst({ where: { userId: user.id } });
  assert.notEqual(row.tokenHash, s.token);
  assert.equal(row.tokenHash, session.hashToken(s.token));
  assert.ok(await session.validateSessionToken(s.token));
});

test('login fallido: mismo mensaje exista o no el correo (RS-04)', async () => {
  const a = await H.rejects(auth.login({ email: 'ana@correo.com', password: 'Equivocada1' }));
  const b = await H.rejects(auth.login({ email: 'nadie@correo.com', password: 'Equivocada1' }));
  assert.equal(a.status, 401);
  assert.equal(a.message, b.message);
  assert.equal(a.code, b.code);
});

test('logout revoca la sesión en la base (RS-37)', async () => {
  const { session: s } = await auth.login({ email: 'ana@correo.com', password: 'Clave1234' });
  await auth.logout(s.token);
  assert.equal(await session.validateSessionToken(s.token), null);
});

test('recuperación: token de un solo uso, vence y revoca sesiones (RS-03/RS-42)', async () => {
  const { session: s } = await auth.login({ email: 'ana@correo.com', password: 'Clave1234' });
  const req = await auth.requestPasswordReset({ email: 'ana@correo.com' });
  assert.deepEqual(req, { ok: true });
  const ghost = await auth.requestPasswordReset({ email: 'fantasma@correo.com' });
  assert.deepEqual(ghost, req); // misma respuesta
  const row = await H.prisma.passwordReset.findFirst({ orderBy: { createdAt: 'desc' } });
  // no conocemos el token en claro (solo su hash): lo reemplazamos por uno conocido para la prueba
  const token = 'token-de-prueba-' + 'x'.repeat(30);
  await H.prisma.passwordReset.update({ where: { id: row.id }, data: { tokenHash: session.hashToken(token) } });
  await auth.resetPassword({ token, password: 'NuevaClave99', confirmPassword: 'NuevaClave99' });
  const again = await H.rejects(auth.resetPassword({ token, password: 'Otra12345', confirmPassword: 'Otra12345' }));
  assert.equal(again.code, 'TOKEN_INVALID');
  assert.equal(await session.validateSessionToken(s.token), null); // sesiones anteriores revocadas
  await auth.login({ email: 'ana@correo.com', password: 'NuevaClave99' });
  await H.rejects(auth.login({ email: 'ana@correo.com', password: 'Clave1234' }));
});

test('token de recuperación vencido no sirve', async () => {
  await auth.requestPasswordReset({ email: 'ana@correo.com' });
  const row = await H.prisma.passwordReset.findFirst({ where: { usedAt: null }, orderBy: { createdAt: 'desc' } });
  const token = 'vencido-' + 'y'.repeat(40);
  await H.prisma.passwordReset.update({ where: { id: row.id }, data: { tokenHash: session.hashToken(token), expiresAt: new Date(Date.now() - 1000) } });
  const e = await H.rejects(auth.resetPassword({ token, password: 'Clave12345', confirmPassword: 'Clave12345' }));
  assert.equal(e.code, 'TOKEN_INVALID');
});

test('re-autenticación: clave incorrecta o vacía se rechaza (RS-26)', async () => {
  const u = await H.prisma.user.findUnique({ where: { email: 'ana@correo.com' } });
  assert.equal(await auth.reauthenticate(u.id, 'NuevaClave99'), true);
  await H.rejects(auth.reauthenticate(u.id, 'mala'));
  await H.rejects(auth.reauthenticate(u.id, ''));
});

test('perfil: Cliente edita nombre/teléfono y Proveedor su perfil profesional (RF-09)', async () => {
  const prov = await H.createUser('PROVEEDOR');
  const p = await auth.updateProfile(prov.id, { name: 'Valeria Ortiz', phone: '0991234567', provider: { tradeName: 'Ortiz Marketing', description: 'Agencia de marketing digital con foco en SEO.' } });
  assert.equal(p.provider!.tradeName, 'Ortiz Marketing');
  await H.rejects(auth.updateProfile(prov.id, { name: 'Valeria Ortiz', phone: 'abc' }));
});

test('parseo de cookie de sesión y atributos de seguridad', () => {
  const c = session.sessionCookie('tok', new Date(Date.now() + 60000));
  assert.match(c, /HttpOnly/i);
  assert.match(c, /SameSite=Strict/i);
  assert.equal(session.parseCookies(`a=1; ${session.SESSION_COOKIE}=tok`)[session.SESSION_COOKIE], 'tok');
});
