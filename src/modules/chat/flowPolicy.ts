// RS-44 (FDP_IFC.1) y RS-45 (FDP_IFF.1): política de flujo de información del contrato.
// El texto del contrato y el contenido entregado solo fluyen entre las dos partes y solo por la plataforma.
//   PERMITIR: el lector es parte del contrato y su sesión es válida, por el canal "platform".
//   NEGAR:    enlaces públicos, correos con el texto, adjuntos y reenvío a terceros.
import { ApiError } from '../../lib/http';
import { config } from '../../lib/env';

const CHANNELS: any = ['platform', 'public_link', 'email_body', 'email_attachment', 'forward'];

function evaluateFlow({ reader, contract, channel = 'platform', sessionValid = true }) {
  if (!CHANNELS.includes(channel)) return { allowed: false, reason: 'Canal desconocido' };
  if (channel !== 'platform') {
    return { allowed: false, reason: 'El contrato solo circula dentro de Interadds: no hay enlaces públicos, correos con el texto, adjuntos ni reenvío a terceros' };
  }
  if (!sessionValid || !reader) return { allowed: false, reason: 'Se requiere una sesión válida' };
  const isParty = contract && (contract.clientId === reader.id || contract.providerId === reader.id);
  if (!isParty) return { allowed: false, reason: 'El lector no es parte del contrato' };
  return { allowed: true, reason: 'Lector parte del contrato con sesión válida por la plataforma' };
}

function assertFlow(args) {
  const r = evaluateFlow(args);
  if (!r.allowed) throw new ApiError(403, 'FLOW_DENIED', r.reason);
  return r;
}

/** Correo que avisa de un contrato pendiente: SIN el texto del contrato y SIN adjuntos (RF-36, RS-44). */
function composePendingContractEmail({ toName, contractId }) {
  return {
    subject: 'Tienes un contrato pendiente en Interadds',
    text: `Hola ${toName},\nTienes un contrato pendiente de revisión y firma en Interadds.\nPara leerlo ingresa a la plataforma con tu cuenta:\n${config.appOrigin}/contratos/${contractId}\n\nPor seguridad, el contrato no se envía por correo.`,
  };
}

/** Detecta si un texto de salida (correo, aviso) reproduce párrafos del contrato. */
function leaksContractText(outgoing, contract) {
  const paragraphs = String(contract.text)
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 40);
  return paragraphs.some((p) => outgoing.includes(p.slice(0, 40)));
}

export { CHANNELS, evaluateFlow, assertFlow, composePendingContractEmail, leaksContractText };
