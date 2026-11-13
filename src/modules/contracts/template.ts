/* Plantilla versionada del contrato general (RF-14, RNF-21). Cada contrato guarda la versión usada
 y su texto final; la plantilla puede evolucionar sin alterar los contratos ya generados. */
import { formatUsd } from '../../lib/money';

const TEMPLATE_VERSION = 1;

const TEMPLATE_BODY = `CONTRATO DE PRESTACIÓN DE SERVICIOS DE MARKETING
Plantilla versión {{templateVersion}} · Contrato {{contractId}} · Generado el {{generatedAt}} (UTC)

PARTES
CLIENTE: {{clientName}} ({{clientEmail}}).
PROVEEDOR: {{providerName}} ({{providerEmail}}).

PRIMERA. OBJETO
El Proveedor prestará al Cliente el servicio «{{serviceTitle}}» (categoría {{categoryName}}), descrito así: {{serviceDescription}}

SEGUNDA. PLAZO
El Proveedor entregará el contenido en un plazo de {{deliveryDays}} días contados desde el pago del anticipo.

TERCERA. PRECIO Y FORMA DE PAGO (CLÁUSULA 50/50)
El precio total es de {{total}}. El Cliente pagará el 50 % ({{anticipo}}) como anticipo, una vez que ambas partes hayan firmado este contrato y este se encuentre vigente, y el 50 % restante ({{saldo}}) cuando apruebe el contenido entregado. Los pagos se realizan con PayPal; Interadds no recibe ni guarda datos de tarjeta.

CUARTA. CUMPLIMIENTO DEL SERVICIO
El Proveedor se obliga a ejecutar el servicio con la diligencia profesional propia de su actividad y a entregar un contenido que corresponda a la descripción de la cláusula primera. El Cliente revisará el contenido entregado y, si corresponde a lo contratado, lo aprobará mediante firma digital; la aprobación habilita el pago del saldo.

QUINTA. CONFIDENCIALIDAD Y CIRCULACIÓN
Este contrato solo se comparte dentro de la plataforma Interadds, únicamente entre las dos partes. Ninguna parte lo reenviará a terceros ni lo publicará mediante enlaces. Cada lectura queda identificada con una marca de agua con el nombre, el correo y la hora del lector.

SEXTA. FIRMA DIGITAL Y EVIDENCIAS
Las partes firman el hash SHA-256 de este texto con firmas digitales ECDSA P-256, mediante certificados emitidos por la autoridad certificadora de Interadds. Cada firma, pago, entrega y aprobación genera evidencia de origen y de recepción con sello de tiempo. Cualquier cambio en este texto invalida las firmas.
`;

function renderContract(body, data) {
  const values: any = {
    templateVersion: String(data.templateVersion),
    contractId: data.contractId,
    generatedAt: data.generatedAt,
    clientName: data.clientName,
    clientEmail: data.clientEmail,
    providerName: data.providerName,
    providerEmail: data.providerEmail,
    serviceTitle: data.serviceTitle,
    categoryName: data.categoryName,
    serviceDescription: data.serviceDescription,
    deliveryDays: String(data.deliveryDays),
    total: formatUsd(data.totalCents),
    anticipo: formatUsd(data.anticipoCents),
    saldo: formatUsd(data.saldoCents),
  };
  // Un solo recorrido: el contenido de los datos nunca se vuelve a interpretar como marcador.
  return body.replace(/\{\{(\w+)\}\}/g, (m, key) => (Object.prototype.hasOwnProperty.call(values, key) ? values[key] : m));
}

export { TEMPLATE_VERSION, TEMPLATE_BODY, renderContract };