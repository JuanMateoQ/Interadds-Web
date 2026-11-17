'use client';
// Pantalla del contrato (RF-14..22, 26..28, 37): estado, firmas, pago, entrega, aprobación y verificación.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, money, dateTime } from '@/lib/client/api';
import SignPanel from './SignPanel';
import PaypalButton from './PaypalButton';
import DeliveryPanel from './DeliveryPanel';
import EvidencePanel from './EvidencePanel';

const STATES: any = ['GENERADO', 'FIRMADO_PARCIAL', 'VIGENTE', 'ANTICIPO_PAGADO', 'CONTENIDO_ENTREGADO', 'CONTENIDO_APROBADO', 'COMPLETADO'];

export default function ContractWorkspace({ id, user }) {
  const [c, setC] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(() => api(`/api/contracts/${id}`).then((d) => setC(d.contract)).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  const done = (m) => { setNotice(typeof m === 'string' ? m : 'Pago registrado correctamente.'); load(); };

  if (error) return <div className="card"><p className="error" role="alert">{error}</p><Link href="/contratos">Volver a mis contratos</Link></div>;
  if (!c) return <p className="muted">Cargando contrato…</p>;
  const idx = STATES.indexOf(c.status);
  const a = c.actions;
  return (
    <>
      <div className="row between">
        <div><p className="muted small"><Link href="/contratos">← Contratos</Link></p><h1>{c.serviceTitle}</h1>
          <p className="muted">Cliente: <strong>{c.client.name}</strong> · Proveedor: <strong>{c.provider.name}</strong> · Total {money(c.totalCents)}</p></div>
        <span className="pill">{c.statusLabel}</span>
      </div>
      <ol className="steps" aria-label="Estado del contrato">
        {c.states.map((s, i) => <li key={s.key} className={i < idx ? 'done' : i === idx ? 'current' : ''}>{s.label}</li>)}
      </ol>
      {notice && <p className="card success" role="status">{notice}</p>}
      <div className="card"><strong>Siguiente paso:</strong> {c.nextStep}</div>

      <section className="card stack">
        <h2>Contrato</h2>
        <p className="muted small">Huella SHA-256 del texto: <code style={{ wordBreak: 'break-all' }}>{c.textHash}</code></p>
        <div className="row">
          <Link className="btn primary" href={`/contratos/${c.id}/visor`}>Leer el contrato</Link>
          {c.chatEnabled && <Link className="btn ghost" href={`/chat?contrato=${c.id}`}>Abrir el chat del contrato</Link>}
        </div>
        <p className="small">Firma del Cliente: {c.signatures.CLIENTE ? <span className="pill ok">Firmado {dateTime(c.signatures.CLIENTE)}</span> : <span className="pill gray">Pendiente</span>} · Firma del Proveedor: {c.signatures.PROVEEDOR ? <span className="pill ok">Firmado {dateTime(c.signatures.PROVEEDOR)}</span> : <span className="pill gray">Pendiente</span>}</p>
      </section>

      {a.canSign && <SignPanel user={user} contractId={c.id} kind="sign" onDone={done} />}
      {a.canPayAnticipo && <PaypalButton contractId={c.id} tranche="ANTICIPO" amountCents={c.anticipoCents} onDone={done} />}
      {a.canUpload && <DeliveryPanel contractId={c.id} deliveries={c.deliveries} canUpload onDone={() => done('Entrega subida correctamente.')} />}
      {!a.canUpload && c.deliveries.length > 0 && <DeliveryPanel contractId={c.id} deliveries={c.deliveries} canUpload={false} onDone={load} />}
      {a.canApprove && <SignPanel user={user} contractId={c.id} kind="approve" onDone={done} />}
      {a.canPaySaldo && <PaypalButton contractId={c.id} tranche="SALDO" amountCents={c.saldoCents} onDone={done} />}

      {c.payments.length > 0 && (
        <section className="card stack"><h2>Pagos</h2>
          <table><thead><tr><th>Tramo</th><th>Monto</th><th>Estado</th><th>Referencia PayPal</th></tr></thead>
            <tbody>{c.payments.map((p) => (<tr key={p.id}><td>{p.tranche === 'ANTICIPO' ? 'Anticipo 50 %' : 'Saldo 50 %'}</td><td>{money(p.amountCents)}</td>
              <td><span className={`pill ${p.status === 'CAPTURADA' ? 'ok' : p.status === 'FALLIDA' ? 'bad' : 'warn'}`}>{p.status}</span></td>
              <td className="small muted">{p.paypalCaptureId || p.paypalOrderId || '—'}{p.receiptNumber ? ` · recibo ${p.receiptNumber}` : ''}</td></tr>))}</tbody></table>
          {c.payments.some((p) => p.status === 'CAPTURADA') && <p className="muted small">El pago al Proveedor queda registrado como «pendiente de liquidación» (no se transfiere en el Bimestre 1).</p>}
        </section>
      )}

      <section className="card stack"><h2>Historial del contrato</h2>
        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 6 }}>{c.history.map((h, i) => (<li key={i} className="small"><strong>{h.label}</strong> <span className="muted">· {dateTime(h.at)} · {h.reason}</span></li>))}</ul>
      </section>
      <EvidencePanel contractId={c.id} refreshKey={c.status} />
    </>
  );
}
