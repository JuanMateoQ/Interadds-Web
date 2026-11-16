// Vista compuesta del contrato para el frontend: une contrato, firmas, pagos, entregas y las acciones que el
// usuario puede hacer ahora.
import * as contractsService from './contracts/service';
import { prisma } from '../lib/db';
import { isAtLeast } from './contracts/stateMachine';
import * as policy from './contracts/policy';
import { getPaymentService } from './payments/service';
import * as deliveries from './chat/deliveries';
import * as certificates from './signing/certificates';

async function getContractWorkspace(user, contractId) {
  const detail = await contractsService.getContractDetail(user, contractId);
  const payments = await getPaymentService().listPayments(user, contractId);
  const deliveryList = await deliveries.listDeliveries(user, contractId);
  const sigRows = await prisma.evidence.findMany({
    where: { contractId: detail.id, kind: 'ORIGEN', event: { in: ['FIRMA_CLIENTE', 'FIRMA_PROVEEDOR'] } },
    select: { event: true, timestampUtc: true },
  });
  const signatures: any = {
    CLIENTE: sigRows.find((s) => s.event === 'FIRMA_CLIENTE')?.timestampUtc || null,
    PROVEEDOR: sigRows.find((s) => s.event === 'FIRMA_PROVEEDOR')?.timestampUtc || null,
  };
  const role = detail.viewerRole;
  const mySigned = !!signatures[role as string];
  const st = detail.status;
  const paid = (t) => payments.some((p) => p.tranche === t && p.status === 'CAPTURADA');
  const actions: any = {
    canSign: ['GENERADO', 'FIRMADO_PARCIAL'].includes(st) && !mySigned,
    canPayAnticipo: role === 'CLIENTE' && st === 'VIGENTE' && !paid('ANTICIPO'),
    canUpload: role === 'PROVEEDOR' && ['ANTICIPO_PAGADO', 'CONTENIDO_ENTREGADO'].includes(st),
    canApprove: role === 'CLIENTE' && st === 'CONTENIDO_ENTREGADO',
    canPaySaldo: role === 'CLIENTE' && st === 'CONTENIDO_APROBADO' && !paid('SALDO'),
  };
  return {
    ...detail,
    signatures,
    mySigned,
    payments,
    deliveries: deliveryList,
    chatEnabled: isAtLeast(st, 'ANTICIPO_PAGADO'),
    actions,
    hasCertificate: await certificates.hasActiveCertificate(user.id),
    nextStep: nextStep(role, st, mySigned),
  };
}

function nextStep(role, status, mySigned) {
  const isClient = role === 'CLIENTE';
  switch (status) {
    case 'GENERADO':
      return mySigned ? 'Esperando la firma de la contraparte.' : 'Lee el contrato y fírmalo con tu certificado.';
    case 'FIRMADO_PARCIAL':
      return mySigned ? 'Esperando la firma de la contraparte.' : 'La contraparte ya firmó: lee el contrato y fírmalo para dejarlo vigente.';
    case 'VIGENTE':
      return isClient ? 'Contrato vigente: paga el anticipo del 50 % con PayPal.' : 'Contrato vigente: esperando el pago del anticipo del Cliente.';
    case 'ANTICIPO_PAGADO':
      return isClient ? 'Anticipo pagado. Conversa con el Proveedor en el chat y espera el contenido.' : 'Anticipo recibido. Conversa con el Cliente y sube el contenido entregable.';
    case 'CONTENIDO_ENTREGADO':
      return isClient ? 'Hay contenido entregado: revísalo y apruébalo con tu firma.' : 'Contenido entregado: esperando la aprobación del Cliente.';
    case 'CONTENIDO_APROBADO':
      return isClient ? 'Contenido aprobado: paga el saldo del 50 % para completar el contrato.' : 'Contenido aprobado: esperando el pago del saldo.';
    case 'COMPLETADO':
      return 'Contrato completado. Gracias por usar Interadds.';
    default:
      return '';
  }
}

export { getContractWorkspace, nextStep };
