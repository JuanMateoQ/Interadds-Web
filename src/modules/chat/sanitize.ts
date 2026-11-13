// Saneamiento y validación de mensajes del chat (RNF-04, RNF-01): se descartan caracteres de control,
// marcas de dirección Unicode (bidi), etiquetas HTML y se limita la longitud. El cliente además renderiza
// siempre como TEXTO (React escapa), nunca como HTML.
const MAX_MESSAGE_LENGTH = 1000;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const BIDI_AND_ZERO_WIDTH = /[​-‏‪-‮⁦-⁩﻿]/g;
const HTML_TAGS = /<\/?[a-zA-Z!][^>]*>/g;

function sanitizeMessage(input) {
  if (typeof input !== 'string') return '';
  let text = input.normalize('NFC');
  text = text.replace(CONTROL_CHARS, '').replace(BIDI_AND_ZERO_WIDTH, '');
  // se repite hasta que no queden etiquetas (evita "<scr<script>ipt>")
  let prev: any;
  do {
    prev = text;
    text = text.replace(HTML_TAGS, '');
  } while (text !== prev);
  text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return text.slice(0, MAX_MESSAGE_LENGTH);
}

/** Devuelve { ok, text, error }. */
function validateMessage(input) {
  if (typeof input !== 'string') return { ok: false, text: '', error: 'El mensaje debe ser texto' };
  if (input.length > MAX_MESSAGE_LENGTH * 2) return { ok: false, text: '', error: `El mensaje no puede superar ${MAX_MESSAGE_LENGTH} caracteres` };
  const text = sanitizeMessage(input);
  if (!text) return { ok: false, text: '', error: 'El mensaje está vacío' };
  return { ok: true, text, error: null };
}

/** Escapado HTML para cualquier contexto que sí inserte texto en HTML (por ejemplo correos). */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}

export { MAX_MESSAGE_LENGTH, sanitizeMessage, validateMessage, escapeHtml };
