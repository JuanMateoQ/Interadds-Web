'use client';
// Pago con PayPal Sandbox (RF-20, RF-21, RF-28). El navegador NUNCA envía el monto: el servidor lo calcula desde
// el contrato. Con PAYMENT_GATEWAY=fake aparece un botón que simula la aprobación del Cliente en PayPal.
import { useEffect, useRef, useState } from 'react';
import { api, money } from '@/lib/client/api';

function loadSdk(clientId) {
  if ((window as any).paypal) return Promise.resolve((window as any).paypal);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&disable-funding=credit,card`;
    s.onload = () => resolve((window as any).paypal);
    s.onerror = () => reject(new Error('No se pudo cargar PayPal. Revisa tu conexión.'));
    document.head.appendChild(s);
  });
}

export default function PaypalButton({ contractId, tranche, amountCents, onDone }) {
  const [config, setConfig] = useState<any>(null);
  const [password, setPassword] = useState('');
  const [order, setOrder] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const box = useRef<any>(null);
  const label = tranche === 'ANTICIPO' ? 'anticipo (50 %)' : 'saldo (50 %)';

  useEffect(() => { api('/api/config').then(setConfig).catch(() => {}); }, []);

  async function capture(o) {
    const res = await api(`/api/contracts/${contractId}/payments/capture`, { method: 'POST', body: { orderId: o.orderId, nonce: o.nonce } });
    setOrder(null);
    setPassword('');
    onDone && onDone(res);
  }

  async function prepare(e) {
    e.preventDefault();
    setError('');
    if (!password) return setError('Ingresa tu clave para continuar');
    setBusy(true);
    try {
      setOrder(await api(`/api/contracts/${contractId}/payments/order`, { method: 'POST', body: { tranche, password } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function simulate() {
    setBusy(true);
    setError('');
    try {
      await api(`/api/contracts/${contractId}/payments/dev-approve`, { method: 'POST', body: { orderId: order.orderId } });
      await capture(order);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!order || !config || config.paymentGateway === 'fake') return undefined;
    let cancelled: any = false;
    loadSdk(config.paypalClientId).then((paypal) => {
      if (cancelled || !box.current) return;
      box.current.innerHTML = '';
      paypal.Buttons({
        createOrder: () => order.orderId,
        onApprove: async () => { try { await capture(order); } catch (err) { setError(err.message); } },
        onError: () => setError('PayPal no pudo completar el pago. Puedes intentarlo de nuevo.'),
      }).render(box.current);
    }).catch((err) => setError(err.message));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, config]);

  return (
    <div className="card stack">
      <h3>Pagar el {label}</h3>
      <p>Monto a pagar: <strong>{money(amountCents)}</strong> · Pasarela: PayPal Sandbox{config?.paymentGateway === 'fake' ? ' (simulada)' : ''}</p>
      {!order && (
        <form className="stack" onSubmit={prepare} noValidate>
          <label>
            Tu clave
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          <button className="btn primary" disabled={busy}>{busy ? 'Preparando…' : `Continuar al pago`}</button>
        </form>
      )}
      {order && config?.paymentGateway === 'fake' && (
        <button className="btn paypal" onClick={simulate} disabled={busy}>{busy ? 'Procesando…' : `Aprobar pago simulado de ${money(order.amountCents)}`}</button>
      )}
      {order && config?.paymentGateway !== 'fake' && <div ref={box} aria-label="Botones de PayPal" />}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
