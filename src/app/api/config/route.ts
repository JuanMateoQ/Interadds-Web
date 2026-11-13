import { open, jsonResponse } from '@/lib/routeKit';

// Configuración pública para el navegador (el Client ID de PayPal NO es un secreto).
export const GET = open(async () => jsonResponse({
  paypalClientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID || '',
  paymentGateway: process.env.PAYMENT_GATEWAY || 'paypal',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 10),
}));
