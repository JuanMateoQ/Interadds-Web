// Módulo de Autenticación (Sebas Ramos): registro, login, logout, recuperación, perfil y re-autenticación.
import crypto from 'crypto';
import { prisma } from '../../lib/db';
import { config } from '../../lib/env';
import { ApiError, Errors } from '../../lib/http';
import { hashPassword, verifyPassword, dummyHash } from '../../lib/security/passwords';
import { randomToken } from '../../lib/security/random';
import { sendMail } from '../../lib/mailer';
import { registerSchema, loginSchema, forgotSchema, resetSchema, profileSchema } from '../../lib/validation/auth';
import { createSession, revokeSessionByToken, revokeAllForUser, hashToken } from './session';

/** RF-04 / RS-41: el usuario nuevo queda como Cliente, o Proveedor si lo elige. Nunca administrador. */
async function register(input) {
  const data = registerSchema.parse(input);
  const exists = await prisma.user.findUnique({ where: { email: data.email } });
  if (exists) throw new ApiError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese correo', { email: 'Este correo ya está registrado' });
  const passwordHash = await hashPassword(data.password);
  const user = await prisma.user.create({
    data: { email: data.email, name: data.name, passwordHash, role: data.role === 'PROVEEDOR' ? 'PROVEEDOR' : 'CLIENTE' },
  });
  return publicUser(user);
}

/** RF-05 / RS-04: error genérico, no revela si el correo existe ni si la clave fue la equivocada. */
async function login(input, { userAgent }: any = {}) {
  const data = loginSchema.parse(input);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  const hash = user && user.status === 'ACTIVO' ? user.passwordHash : await dummyHash();
  const ok = await verifyPassword(data.password, hash);
  if (!user || user.status !== 'ACTIVO' || !ok) {
    if (user) await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: { increment: 1 } } }).catch(() => {});
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Correo o clave incorrectos');
  }
  if (user.failedLoginCount) await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0 } });
  const session = await createSession(user.id, userAgent);
  return { user: publicUser(user), session };
}

/** RF-06 / RS-37: cierra la sesión activa (queda revocada en la base). Devuelve el id para cerrar sockets. */
async function logout(token) {
  return revokeSessionByToken(token);
}

/** RF-07: genera un token de un solo uso y con caducidad; el "correo" se imprime en consola. */
async function requestPasswordReset(input) {
  const { email } = forgotSchema.parse(input);
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.status === 'ACTIVO') {
    const token = randomToken(32); // RS-07: generado por el sistema con CSPRNG
    await prisma.passwordReset.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + config.resetTtlMinutes * 60 * 1000) },
    });
    const link = `${config.appOrigin}/recuperar/restablecer?token=${token}`;
    sendMail({
      to: user.email,
      subject: 'Recupera tu clave de Interadds',
      text: `Hola ${user.name},\nUsa este enlace para crear una clave nueva (vale ${config.resetTtlMinutes} minutos y se puede usar una sola vez):\n${link}`,
    });
  }
  // Misma respuesta exista o no el correo (RS-04)
  return { ok: true };
}

/** RS-03 / RS-42: el token se consume de forma atómica (un solo uso) y vence a los N minutos. */
async function resetPassword(input) {
  const data = resetSchema.parse(input);
  const tokenHash = hashToken(data.token);
  const passwordHash = await hashPassword(data.password);
  return prisma.$transaction(async (tx) => {
    const claim = await tx.passwordReset.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claim.count !== 1) throw new ApiError(400, 'TOKEN_INVALID', 'El enlace no es válido, ya se usó o venció');
    const reset = await tx.passwordReset.findUnique({ where: { tokenHash } });
    await tx.user.update({ where: { id: reset.userId }, data: { passwordHash, failedLoginCount: 0 } });
    await tx.session.updateMany({ where: { userId: reset.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  });
}

/** RS-26 (usado por firma y pago): vuelve a pedir la clave del usuario autenticado. */
async function reauthenticate(userId, password) {
  if (typeof password !== 'string' || !password) throw new ApiError(401, 'REAUTH_REQUIRED', 'Ingresa tu clave para continuar');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== 'ACTIVO' || !(await verifyPassword(password, user.passwordHash))) {
    throw new ApiError(401, 'REAUTH_FAILED', 'La clave no es correcta');
  }
  return true;
}

async function getProfile(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { providerProfile: true } });
  if (!user) throw Errors.notFound('Usuario no encontrado');
  return { ...publicUser(user), phone: user.phone || '', provider: user.providerProfile ? profileOut(user.providerProfile) : null };
}

/** RF-09: el Proveedor completa su perfil profesional; el Cliente edita nombre y teléfono. */
async function updateProfile(userId, input) {
  const data = profileSchema.parse(input);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw Errors.notFound('Usuario no encontrado');
  await prisma.user.update({ where: { id: userId }, data: { name: data.name, phone: data.phone || null } });
  if (user.role === 'PROVEEDOR' && data.provider) {
    const p = data.provider;
    const values: any = { tradeName: p.tradeName, description: p.description, contactEmail: p.contactEmail || null, contactPhone: p.contactPhone || null };
    await prisma.providerProfile.upsert({ where: { userId }, create: { userId, ...values }, update: values });
  }
  return getProfile(userId);
}

/** Directorio público mínimo para que otros módulos enriquezcan datos sin consultar tablas ajenas. */
async function getPublicUsers(ids) {
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, include: { providerProfile: true } });
  const map = new Map();
  for (const u of users) {
    map.set(u.id, {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      tradeName: (u.providerProfile && u.providerProfile.tradeName) || u.name,
      providerDescription: u.providerProfile ? u.providerProfile.description : '',
    });
  }
  return map;
}

async function getUserById(id) {
  const u = await prisma.user.findUnique({ where: { id } });
  return u ? publicUser(u) : null;
}

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, status: u.status };
}
function profileOut(p) {
  return { tradeName: p.tradeName, description: p.description, contactEmail: p.contactEmail || '', contactPhone: p.contactPhone || '' };
}

export {
  register, login, logout, requestPasswordReset, resetPassword, reauthenticate,
  getProfile, updateProfile, getPublicUsers, getUserById, revokeAllForUser,
};
