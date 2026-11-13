// RS-09 (FIA_USB.1): la sesión queda ligada al usuario y a su rol. El navegador solo conserva un token
// aleatorio en una cookie HttpOnly; en la base se guarda únicamente su hash SHA-256.
import crypto from 'crypto';
import { prisma } from '../../lib/db';
import { config } from '../../lib/env';
import { randomToken } from '../../lib/security/random';

const SESSION_COOKIE = 'interadds_session';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createSession(userId, userAgent) {
  const token = randomToken(32);
  const csrfToken = randomToken(24);
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3600 * 1000);
  const session = await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), csrfToken, expiresAt, userAgent: userAgent ? String(userAgent).slice(0, 200) : null },
  });
  return { token, csrfToken, expiresAt, sessionId: session.id };
}

/** Devuelve { session, user } si el token es válido, no venció, no fue revocado y el usuario está activo. */
async function validateSessionToken(token) {
  if (!token || typeof token !== 'string' || token.length > 200) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  if (session.user.status !== 'ACTIVO') return null;
  const u = session.user;
  return {
    session: { id: session.id, csrfToken: session.csrfToken, expiresAt: session.expiresAt },
    // RS-08: atributos de seguridad del usuario (rol y estado)
    user: { id: u.id, email: u.email, name: u.name, role: u.role, status: u.status },
  };
}

async function revokeSessionByToken(token) {
  if (!token) return null;
  const s = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!s) return null;
  await prisma.session.updateMany({ where: { id: s.id, revokedAt: null }, data: { revokedAt: new Date() } });
  return s.id;
}

async function revokeAllForUser(userId) {
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

function parseCookies(header) {
  const out: any = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try { out[k] = decodeURIComponent(v); } catch (_) { out[k] = v; }
    }
  }
  return out;
}

/** Cookie de sesión: HttpOnly (sin acceso desde JS), SameSite=Strict (anti-CSRF) y Secure en HTTPS. */
function sessionCookie(token, expiresAt) {
  const parts: any = [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Expires=${expiresAt.toUTCString()}`];
  if (config.cookieSecure) parts.push('Secure');
  return parts.join('; ');
}

function clearSessionCookie() {
  const parts: any = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT', 'Max-Age=0'];
  if (config.cookieSecure) parts.push('Secure');
  return parts.join('; ');
}

export {
  SESSION_COOKIE, hashToken, createSession, validateSessionToken, revokeSessionByToken, revokeAllForUser,
  parseCookies, sessionCookie, clearSessionCookie,
};
