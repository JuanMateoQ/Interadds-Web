// Correo SIMULADO: en el Bimestre 1 los correos se imprimen en consola (RF-07) y se guardan en
// una bandeja en memoria para las pruebas. Nunca se envían adjuntos (RS-45).
const outbox = (globalThis.__interaddsOutbox = globalThis.__interaddsOutbox || []);

function sendMail({ to, subject, text, attachments }: { to: any; subject: any; text: any; attachments?: any }) {
  if (attachments && attachments.length) {
    // RS-45 / FDP_IFF.1: los correos nunca llevan adjuntos del contrato
    throw new Error('FLOW_DENIED: los correos de Interadds no admiten adjuntos');
  }
  const mail: any = { to, subject, text, sentAt: new Date().toISOString() };
  outbox.push(mail);
  if (outbox.length > 200) outbox.shift();
  if (process.env.NODE_ENV !== 'test') {
    console.log(`\n[correo simulado] Para: ${to}\n  Asunto: ${subject}\n  ${text.split('\n').join('\n  ')}\n`);
  }
  return mail;
}

export { sendMail, outbox };
