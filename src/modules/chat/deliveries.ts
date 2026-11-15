// Entrega de contenido (RF-26): el Proveedor sube archivos ligados al contrato con tipo, tamaño y hash validados.
// El contenido solo fluye entre las dos partes y por la plataforma (RS-44).
import fs from 'fs';
import path from 'path';
import { prisma } from '../../lib/db';
import { config } from '../../lib/env';
import { ApiError, Errors } from '../../lib/http';
import { sha256Hex, safeEqualHex } from '../signing/hash';
import { randomUuid } from '../../lib/security/random';
import * as contracts from '../contracts/api';
import * as policy from '../contracts/policy';
import * as evidence from '../signing/evidence';
import { assertFlow } from './flowPolicy';
import { notify } from './notifications';

// Tipos permitidos: MIME declarado, extensiones y firma ("magic bytes") del archivo.
const ALLOWED_TYPES: any = {
  'application/pdf': { exts: ['.pdf'], magic: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  'image/png': { exts: ['.png'], magic: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/jpeg': { exts: ['.jpg', '.jpeg'], magic: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/gif': { exts: ['.gif'], magic: (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')) },
  'image/webp': { exts: ['.webp'], magic: (b) => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  'video/mp4': { exts: ['.mp4'], magic: (b) => b.length > 12 && b.subarray(4, 8).toString('latin1') === 'ftyp' },
  'text/plain': { exts: ['.txt'], magic: (b) => !b.includes(0) },
};
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']);
const UPLOADABLE_STATES: any = ['ANTICIPO_PAGADO', 'CONTENIDO_ENTREGADO'];

function safeFileName(name) {
  const base = path.basename(String(name || 'archivo')).replace(/[^\p{L}\p{N}._ -]/gu, '_').replace(/\.{2,}/g, '.').trim();
  return (base || 'archivo').slice(0, 100);
}

function validateFile({ name, type, buffer }) {
  if (!buffer || !buffer.length) throw Errors.badRequest('El archivo está vacío');
  if (buffer.length > config.maxUploadBytes) {
    throw new ApiError(413, 'FILE_TOO_LARGE', `El archivo supera el máximo de ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB`);
  }
  const rule = ALLOWED_TYPES[type];
  if (!rule) throw new ApiError(415, 'TYPE_NOT_ALLOWED', `Tipo de archivo no permitido (${type || 'desconocido'}). Permitidos: PDF, PNG, JPG, GIF, WEBP, MP4 y TXT`);
  const ext = path.extname(String(name || '')).toLowerCase();
  if (!rule.exts.includes(ext)) throw new ApiError(415, 'EXTENSION_MISMATCH', 'La extensión del archivo no corresponde a su tipo');
  if (!rule.magic(buffer)) throw new ApiError(415, 'CONTENT_MISMATCH', 'El contenido del archivo no corresponde al tipo declarado');
}

function pathFor(storageKey) {
  const full = path.resolve(config.uploadDir, storageKey);
  if (!full.startsWith(path.resolve(config.uploadDir) + path.sep)) throw new Error('Ruta de almacenamiento inválida');
  return full;
}

async function saveDelivery({ user, contractId, file }) {
  policy.assertCan(user, 'content:upload');
  const contract = await contracts.getContractForParty(user, contractId);
  if (!policy.isProviderOf(user, contract)) throw Errors.forbidden('Solo el Proveedor del contrato puede subir contenido');
  if (!UPLOADABLE_STATES.includes(contract.status)) {
    throw new ApiError(409, 'UPLOAD_NOT_ALLOWED', 'El contenido solo se puede subir con el anticipo pagado y antes de la aprobación');
  }
  validateFile(file);
  const sha256 = sha256Hex(file.buffer);
  const storageKey = `${contract.id}/${randomUuid()}`;
  const full = pathFor(storageKey);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, file.buffer, { mode: 0o600 });

  try {
    const delivery = await prisma.$transaction(async (tx) => {
      const last = await tx.delivery.findFirst({ where: { contractId: contract.id }, orderBy: { version: 'desc' } });
      const version = (last ? last.version : 0) + 1;
      const d = await tx.delivery.create({
        data: { contractId: contract.id, uploaderId: user.id, version, originalName: safeFileName(file.name), mimeType: file.type, sizeBytes: file.buffer.length, sha256, storageKey },
      });
      // RS-16: evidencia de origen = hash del archivo ligado al contrato y a la identidad del Proveedor
      await evidence.recordOrigin({
        contractId: contract.id, event: 'ENTREGA_CONTENIDO', ref: String(version), actorId: user.id, subjectHash: sha256,
        payload: ['interadds-delivery-v1', contract.id, sha256, user.id, String(version)].join('\n'),
        meta: { fileName: d.originalName, mimeType: d.mimeType, sizeBytes: d.sizeBytes, version },
      }, tx);
      if (contract.status === 'ANTICIPO_PAGADO') {
        await contracts.advanceStatus(contract.id, 'CONTENIDO_ENTREGADO', { actorId: user.id, reason: 'Primer contenido entregado', tx });
      }
      return d;
    });
    await notify({
      userId: contract.clientId, type: 'CONTENIDO_SUBIDO', contractId: contract.id,
      title: 'Nuevo contenido entregado', body: `${contract.providerName} subió contenido (versión ${delivery.version}) del contrato «${contract.serviceTitle}». Revísalo y apruébalo.`,
    });
    return deliveryOut(delivery);
  } catch (e) {
    fs.rmSync(full, { force: true });
    if (e && e.code === 'P2002') throw new ApiError(409, 'VERSION_CONFLICT', 'Se subió otra versión al mismo tiempo, intenta de nuevo');
    throw e;
  }
}

async function listDeliveries(user, contractId) {
  policy.assertCan(user, 'content:read');
  const contract = await contracts.getContractForParty(user, contractId);
  const rows = await prisma.delivery.findMany({ where: { contractId: contract.id }, orderBy: { version: 'desc' } });
  return rows.map(deliveryOut);
}

/** Abre un archivo entregado. La primera apertura del Cliente genera su constancia de recepción (RS-17). */
async function openDelivery({ user, contractId, deliveryId }) {
  policy.assertCan(user, 'content:read');
  const contract = await contracts.getContractForParty(user, contractId);
  assertFlow({ reader: user, contract, channel: 'platform', sessionValid: true });
  const d = await prisma.delivery.findFirst({ where: { id: String(deliveryId), contractId: contract.id } });
  if (!d) throw Errors.notFound('Archivo no encontrado');
  const buffer = fs.readFileSync(pathFor(d.storageKey));
  if (!safeEqualHex(sha256Hex(buffer), d.sha256)) {
    throw new ApiError(409, 'INTEGRITY_VIOLATION', 'El archivo guardado no coincide con su hash: se detectó una alteración');
  }
  if (policy.isClientOf(user, contract) && !d.openedAt) {
    await prisma.delivery.updateMany({ where: { id: d.id, openedAt: null }, data: { openedAt: new Date() } });
    await evidence.recordReceipt({
      contractId: contract.id, event: 'ENTREGA_CONTENIDO', ref: String(d.version), recipientId: user.id, subjectHash: d.sha256,
      meta: { description: 'Constancia de que el Cliente abrió el contenido entregado' },
    });
  }
  return { buffer, name: d.originalName, mimeType: d.mimeType, sha256: d.sha256, inline: INLINE_TYPES.has(d.mimeType) };
}

async function getLatestDelivery(contractId, db = prisma) {
  return db.delivery.findFirst({ where: { contractId }, orderBy: { version: 'desc' } });
}

async function markApproved(deliveryId, db = prisma) {
  return db.delivery.update({ where: { id: deliveryId }, data: { status: 'APROBADO', approvedAt: new Date() } });
}

function deliveryOut(d) {
  return {
    id: d.id, version: d.version, name: d.originalName, mimeType: d.mimeType, sizeBytes: d.sizeBytes, sha256: d.sha256,
    status: d.status, opened: !!d.openedAt, approvedAt: d.approvedAt, createdAt: d.createdAt,
  };
}

export { ALLOWED_TYPES, safeFileName, validateFile, saveDelivery, listDeliveries, openDelivery, getLatestDelivery, markApproved, deliveryOut };
