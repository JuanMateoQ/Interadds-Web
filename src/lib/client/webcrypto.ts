'use client';
// Firma digital en el navegador (RF-16, RF-17, RS-14, RS-15). El par ECDSA P-256 se genera con WebCrypto como
// NO exportable: la clave privada nunca sale del navegador ni se envía al servidor. Se guarda en IndexedDB
// (una por usuario). Al servidor solo viajan la clave pública, la prueba de posesión y las firmas.
import { api } from './api';

const ALG: any = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN: any = { name: 'ECDSA', hash: 'SHA-256' };
const DB = 'interadds-keys';
const STORE = 'keys';

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idb(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = (db as any).transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}
const loadRecord = (userId: any): Promise<any> => idb('readonly', (s: any) => s.get(userId));
const saveRecord = (userId, rec) => idb('readwrite', (s) => s.put(rec, userId));

export function webCryptoAvailable() {
  return typeof window !== 'undefined' && !!window.crypto?.subtle && !!window.indexedDB;
}

/** Devuelve el serial del certificado del usuario, creando la clave y pidiendo el certificado si hace falta. */
export async function ensureCertificate(user) {
  if (!webCryptoAvailable()) throw new Error('Tu navegador no soporta la firma digital (WebCrypto / IndexedDB).');
  const existing = await loadRecord(user.id);
  if (existing && existing.serial) {
    const { certificates } = await api('/api/signing/certificates');
    if (certificates.some((c) => c.serial === existing.serial && c.status === 'ACTIVO')) return existing.serial;
  }
  const keys = await crypto.subtle.generateKey(ALG, false, ['sign', 'verify']); // privada no exportable
  const publicKey = toB64(await crypto.subtle.exportKey('spki', keys.publicKey));
  const { nonce } = await api('/api/signing/challenge', { method: 'POST' });
  const payload: any = ['interadds-cert-v1', user.id, nonce, publicKey].join('\n');
  const popSignature = toB64(await crypto.subtle.sign(SIGN, keys.privateKey, new TextEncoder().encode(payload)));
  const cert = await api('/api/signing/certificates', { method: 'POST', body: { publicKey, challenge: nonce, popSignature } });
  await saveRecord(user.id, { privateKey: keys.privateKey, publicKey: keys.publicKey, serial: cert.serial });
  return cert.serial;
}

/** Firma un texto (el payload que entrega el servidor) con la clave privada guardada del usuario. */
export async function signPayload(userId, text) {
  const rec = await loadRecord(userId);
  if (!rec || !rec.privateKey) throw new Error('Este navegador no tiene tu clave de firma. Genera tu certificado de nuevo.');
  return { signature: toB64(await crypto.subtle.sign(SIGN, rec.privateKey, new TextEncoder().encode(text))), serial: rec.serial };
}
