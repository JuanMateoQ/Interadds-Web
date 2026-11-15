'use client';
// Detalle del servicio (RF-02) y contratación (RF-13): quien no ha ingresado es llevado al login (RS-02).
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, money } from '@/lib/client/api';

export default function Detalle() {
  const { id } = useParams();
  const router = useRouter();
  const [s, setS] = useState<any>(null);
  const [me, setMe] = useState<any>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/api/services/${id}`).then((d) => setS(d.service)).catch((e) => setError(e.message));
    api('/api/auth/me').then((d) => setMe(d.user)).catch(() => setMe(null));
  }, [id]);

  async function hire() {
    if (!me) return router.push(`/login?next=${encodeURIComponent(`/servicios/${id}`)}`);
    setBusy(true); setError('');
    try {
      const r = await api('/api/contracts', { method: 'POST', body: { serviceId: id } });
      router.push(`/contratos/${r.contract.id}`);
    } catch (e) { setError(e.message); setBusy(false); }
  }

  if (error && !s) return <div className="card"><p className="error" role="alert">{error}</p></div>;
  if (!s) return <p className="muted">Cargando…</p>;
  const half = Math.floor(s.priceCents / 2);
  return (
    <article className="card stack">
      <div className="row between"><span className="pill">{s.category?.name}</span><span className="muted">Entrega en {s.deliveryDays} días</span></div>
      <h1>{s.title}</h1>
      <p style={{ whiteSpace: 'pre-wrap' }}>{s.description}</p>
      <div className="card" style={{ background: '#faf9f6' }}>
        <p className="price">{money(s.priceCents)}</p>
        <p className="muted small">Se paga en dos partes con PayPal: 50 % de anticipo ({money(half)}) cuando el contrato esté firmado por ambos y 50 % de saldo ({money(s.priceCents - half)}) cuando apruebes el contenido.</p>
      </div>
      <p className="muted">Proveedor: <strong>{s.provider?.tradeName}</strong>{s.provider?.description ? ` — ${s.provider.description}` : ''}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {me?.role === 'PROVEEDOR' ? <p className="muted small">Ingresaste como Proveedor: solo los Clientes pueden contratar.</p>
        : <button className="btn primary" onClick={hire} disabled={busy}>{busy ? 'Generando contrato…' : 'Contratar este servicio'}</button>}
    </article>
  );
}
