// Servidor Socket.IO dentro del mismo proceso Node (RNF-10) con seguridad WebSocket (RNF-04):
//   - Autenticación en el HANDSHAKE: sin sesión válida la conexión se rechaza.
//   - Comprobación de Origin; en el despliegue el canal es wss.
//   - Validación y saneamiento de cada mensaje; límite de frecuencia por conexión.
//   - Sala privada por contrato (RF-23): solo las dos partes y solo con el anticipo pagado.
import { Server } from 'socket.io';
import { z } from 'zod';
import { config } from '../../lib/env';
import { SESSION_COOKIE, parseCookies, validateSessionToken } from '../auth/session';
import * as policy from '../contracts/policy';
import * as rooms from './rooms';
import { validateMessage } from './sanitize';

const joinSchema = z.object({
  type: z.enum(['general', 'contract']),
  contractId: z.string().uuid().optional(),
});
const sendSchema = joinSchema.extend({ text: z.string().max(4000) });

const RATE_LIMIT: any = { max: 10, windowMs: 10000 };

function originAllowed(origin, host) {
  if (!origin) return true; // clientes no navegador: igual necesitan cookie de sesión válida
  try {
    return origin === config.appOrigin || new URL(origin).host === host;
  } catch (_) {
    return false;
  }
}

function descriptorOf(key) {
  if (key === 'room:general') return { type: 'general' };
  return { type: 'contract', contractId: key.replace('room:contract:', '') };
}

function attachSocketServer(httpServer, opts: any = {}) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 64 * 1024,
    allowRequest: (req, cb) => cb(null, originAllowed(req.headers.origin, req.headers.host)),
    ...opts,
  });
  globalThis.__interaddsIO = io;

  // Handshake autenticado (RNF-04): lee la cookie HttpOnly de sesión y la valida en la base.
  io.use(async (socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const auth = await validateSessionToken(cookies[SESSION_COOKIE]);
      if (!auth) return next(new Error('unauthorized'));
      socket.data.user = auth.user;
      socket.data.sessionId = auth.session.id;
      socket.data.sessionExpiresAt = auth.session.expiresAt;
      return next();
    } catch (_) {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.id}`); // notificaciones en tiempo real (RF-29)
    socket.join(`session:${socket.data.sessionId}`); // para cerrar el socket al cerrar sesión (RS-37)

    // La sesión vence: se cierra el socket
    const ms = Math.max(1000, new Date(socket.data.sessionExpiresAt).getTime() - Date.now());
    const expiry = setTimeout(() => socket.disconnect(true), Math.min(ms, 2 ** 31 - 1));
    expiry.unref?.();

    const stamps: any = [];
    const limited = () => {
      const now = Date.now();
      while (stamps.length && now - stamps[0] > RATE_LIMIT.windowMs) stamps.shift();
      if (stamps.length >= RATE_LIMIT.max) return true;
      stamps.push(now);
      return false;
    };

    async function resolveRoom(payload) {
      if (payload.type === 'general') {
        if (!policy.can(user, 'chat:general')) return { error: 'FORBIDDEN', message: 'Sin permiso' };
        const room = await rooms.ensureGeneralRoom();
        return { key: 'room:general', room };
      }
      if (!payload.contractId) return { error: 'BAD_REQUEST', message: 'Falta el contrato' };
      const access = await rooms.checkContractRoomAccess(user, payload.contractId);
      if (!access.allowed) return { error: access.code, message: access.reason };
      const room = await rooms.openContractRoom(payload.contractId);
      return { key: `room:contract:${payload.contractId}`, room };
    }

    async function presence(key) {
      const sockets = await io.in(key).fetchSockets();
      const seen = new Map();
      for (const s of sockets) seen.set(s.data.user.id, { id: s.data.user.id, name: s.data.user.name });
      const online: any = [...seen.values()];
      io.to(key).emit('presence:update', { room: descriptorOf(key), online });
      return online;
    }

    socket.on('room:join', async (raw, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const payload = joinSchema.parse(raw);
        const r = await resolveRoom(payload);
        if (r.error) return reply({ ok: false, error: r.error, message: r.message });
        await socket.join(r.key as string);
        const [history, online] = await Promise.all([rooms.history(r.room.id), presence(r.key)]);
        return reply({ ok: true, room: descriptorOf(r.key), history, online });
      } catch (_) {
        return reply({ ok: false, error: 'BAD_REQUEST', message: 'Solicitud inválida' });
      }
    });

    socket.on('room:leave', async (raw, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const payload = joinSchema.parse(raw);
        const key = payload.type === 'general' ? 'room:general' : `room:contract:${payload.contractId}`;
        await socket.leave(key);
        await presence(key);
        reply({ ok: true });
      } catch (_) {
        reply({ ok: false, error: 'BAD_REQUEST' });
      }
    });

    socket.on('message:send', async (raw, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        if (limited()) return reply({ ok: false, error: 'RATE_LIMIT', message: 'Estás enviando mensajes muy rápido' });
        const payload = sendSchema.parse(raw);
        const key = payload.type === 'general' ? 'room:general' : `room:contract:${payload.contractId}`;
        if (!socket.rooms.has(key)) return reply({ ok: false, error: 'NOT_IN_ROOM', message: 'Primero entra a la sala' });
        // Se vuelve a comprobar el acceso en cada mensaje (la sesión o el contrato pudieron cambiar)
        const stillValid = await validateSessionToken(parseCookies(socket.handshake.headers.cookie)[SESSION_COOKIE]);
        if (!stillValid) {
          socket.disconnect(true);
          return reply({ ok: false, error: 'unauthorized' });
        }
        const r = await resolveRoom(payload);
        if (r.error) return reply({ ok: false, error: r.error, message: r.message });
        const v = validateMessage(payload.text);
        if (!v.ok) return reply({ ok: false, error: 'INVALID_MESSAGE', message: v.error });
        const message = await rooms.saveMessage({ roomId: r.room.id, user, text: v.text });
        io.to(key).emit('message:new', { room: descriptorOf(key), message });
        return reply({ ok: true, message });
      } catch (_) {
        return reply({ ok: false, error: 'BAD_REQUEST', message: 'Solicitud inválida' });
      }
    });

    socket.on('disconnecting', () => {
      clearTimeout(expiry);
      const keys: any = [...socket.rooms].filter((r) => r.startsWith('room:'));
      setImmediate(() => keys.forEach((k) => presence(k).catch(() => {})));
    });
  });

  return io;
}

/** Cierra todos los sockets de una sesión (al cerrar sesión). */
function closeSessionSockets(sessionId) {
  const io = globalThis.__interaddsIO;
  if (io && sessionId) io.in(`session:${sessionId}`).disconnectSockets(true);
}

export { attachSocketServer, closeSessionSockets };
