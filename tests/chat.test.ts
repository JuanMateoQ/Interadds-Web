// WebSocket y entregas: RF-23..28, RNF-04 (handshake autenticado, sala privada, saneamiento, límite de frecuencia)
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { io as connect } from 'socket.io-client';
import * as H from './helpers';
import { attachSocketServer } from '../src/modules/chat/socket';
import * as auth from '../src/modules/auth/service';
import { SESSION_COOKIE } from '../src/modules/auth/session';
import * as deliveries from '../src/modules/chat/deliveries';

let w, server, io, url;
const sockets: any = [];

async function login(user) {
  const { session } = await auth.login({ email: user.email, password: H.PASSWORD });
  return session;
}
function open(session) {
  const s = connect(url, {
    path: '/socket.io', transports: ['websocket'], reconnection: false,
    extraHeaders: session ? { cookie: `${SESSION_COOKIE}=${session.token}` } : {}, forceNew: true,
  });
  sockets.push(s);
  return new Promise<any>((resolve) => {
    s.on('connect', () => resolve({ socket: s, ok: true }));
    s.on('connect_error', (err) => resolve({ socket: s, ok: false, error: err.message }));
  });
}
const emit = (s, ev, data) => new Promise<any>((resolve) => s.emit(ev, data, resolve));

test.before(async () => {
  w = await H.world();
  server = http.createServer();
  io = attachSocketServer(server);
  await new Promise<any>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  sockets.forEach((s) => s.close());
  io.close();
  await new Promise<any>((r) => server.close(r));
  await H.close();
});

test('sin sesión (o con token falso) el handshake se rechaza', async () => {
  const a = await open(null);
  assert.equal(a.ok, false);
  assert.equal(a.error, 'unauthorized');
  const b = await open({ token: 'token-inventado' });
  assert.equal(b.ok, false);
});

test('el chat general funciona para Cliente y Proveedor; los mensajes se sanean', async () => {
  const c = await open(await login(w.client));
  assert.ok(c.ok);
  const joined = await emit(c.socket, 'room:join', { type: 'general' });
  assert.equal(joined.ok, true);
  const got = new Promise<any>((r) => c.socket.once('message:new', r));
  const sent = await emit(c.socket, 'message:send', { type: 'general', text: 'Hola <script>alert(1)</script> equipo' });
  assert.equal(sent.ok, true);
  const evt = await got;
  assert.ok(!/[<>]/.test(evt.message.text));
  assert.match(evt.message.text, /Hola/);
});

test('enviar sin entrar a la sala, mensajes vacíos o sin forma válida se rechazan', async () => {
  const c = await open(await login(w.client));
  assert.equal((await emit(c.socket, 'message:send', { type: 'general', text: 'hola' })).error, 'NOT_IN_ROOM');
  await emit(c.socket, 'room:join', { type: 'general' });
  assert.equal((await emit(c.socket, 'message:send', { type: 'general', text: '   ' })).ok, false);
  assert.equal((await emit(c.socket, 'message:send', { text: 'sin tipo' })).ok, false);
  assert.equal((await emit(c.socket, 'room:join', { type: 'contract', contractId: 'no-uuid' })).ok, false);
});

test('sala del contrato: bloqueada antes del anticipo, abierta solo a las dos partes después (RF-23)', async () => {
  const id = await w.advanceTo('VIGENTE');
  const c = await open(await login(w.client));
  const denied = await emit(c.socket, 'room:join', { type: 'contract', contractId: id });
  assert.equal(denied.ok, false);
  await w.pay(id, 'ANTICIPO');
  const ok = await emit(c.socket, 'room:join', { type: 'contract', contractId: id });
  assert.equal(ok.ok, true);
  const p = await open(await login(w.provider));
  assert.equal((await emit(p.socket, 'room:join', { type: 'contract', contractId: id })).ok, true);
  const intruder = await open(await login(w.other));
  const r = await emit(intruder.socket, 'room:join', { type: 'contract', contractId: id });
  assert.equal(r.ok, false);
  const admin = await open(await login(w.admin));
  assert.equal((await emit(admin.socket, 'room:join', { type: 'contract', contractId: id })).ok, false);
  // el mensaje llega a la otra parte y no al intruso
  const seen = new Promise<any>((res) => p.socket.once('message:new', res));
  let leaked: any = false;
  intruder.socket.on('message:new', () => { leaked = true; });
  assert.equal((await emit(c.socket, 'message:send', { type: 'contract', contractId: id, text: 'Hola, ya pagué el anticipo' })).ok, true);
  assert.equal((await seen).message.text, 'Hola, ya pagué el anticipo');
  await new Promise<any>((r2) => setTimeout(r2, 100));
  assert.equal(leaked, false);
});

test('límite de frecuencia: más de 10 mensajes en 10 s se rechazan', async () => {
  const c = await open(await login(w.client));
  await emit(c.socket, 'room:join', { type: 'general' });
  const results: any = [];
  for (let i = 0; i < 13; i++) results.push(await emit(c.socket, 'message:send', { type: 'general', text: `mensaje ${i}` }));
  assert.ok(results.slice(0, 10).every((r) => r.ok));
  assert.equal(results[12].error, 'RATE_LIMIT');
});

test('cerrar sesión desconecta el socket y los mensajes posteriores se rechazan (RS-37)', async () => {
  const session = await login(w.client);
  const c = await open(session);
  await emit(c.socket, 'room:join', { type: 'general' });
  const closed = new Promise<any>((r) => c.socket.once('disconnect', r));
  await auth.logout(session.token);
  // el servidor revalida la sesión en cada mensaje: lo rechaza y corta la conexión
  c.socket.emit('message:send', { type: 'general', text: 'sigo aquí' }, () => {});
  await Promise.race([closed, new Promise<any>((_, rej) => setTimeout(() => rej(new Error('el socket no se cerró')), 3000))]);
  assert.equal(c.socket.connected, false);
});

test('Origin ajeno se rechaza', async () => {
  const s = connect(url, { path: '/socket.io', transports: ['websocket'], reconnection: false, forceNew: true, extraHeaders: { origin: 'https://evil.example', cookie: `${SESSION_COOKIE}=${(await login(w.client)).token}` } });
  sockets.push(s);
  const res = await new Promise<any>((r) => { s.on('connect', () => r('connected')); s.on('connect_error', () => r('rejected')); });
  assert.equal(res, 'rejected');
});

test('entrega de contenido: solo el Proveedor sube, con el anticipo pagado, versionada y con hash (RF-26..27)', async () => {
  const id = await w.advanceTo('ANTICIPO_PAGADO');
  const e = await H.rejects(deliveries.saveDelivery({ user: w.client, contractId: id, file: { name: 'a.png', type: 'image/png', buffer: H.PNG } }));
  assert.equal(e.status, 403);
  const d1 = await w.upload(id);
  assert.equal(d1.version, 1);
  assert.match(d1.sha256, /^[0-9a-f]{64}$/);
  assert.equal((await H.prisma.contract.findUnique({ where: { id } })).status, 'CONTENIDO_ENTREGADO');
  const d2 = await w.upload(id);
  assert.equal(d2.version, 2);
  const bad = await H.rejects(w.upload(id, { name: 'virus.exe', type: 'application/x-msdownload' }));
  assert.equal(bad.status, 415);
  const forged = await H.rejects(w.upload(id, { name: 'foto.png', buffer: Buffer.from('no es una imagen') }));
  assert.equal(forged.code, 'CONTENT_MISMATCH');
});

test('contenido sin anticipo no se puede entregar', async () => {
  const id = await w.advanceTo('VIGENTE');
  const e = await H.rejects(w.upload(id));
  assert.ok(e.status >= 400);
});

test('un tercero no puede listar ni abrir entregas ajenas', async () => {
  const id = await w.advanceTo('CONTENIDO_ENTREGADO');
  const e = await H.rejects(deliveries.listDeliveries(w.other, id));
  assert.ok([403, 404].includes(e.status));
});
