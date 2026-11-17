'use client';
// Verificación de evidencia (RF-19): certificado, cadena de la CA, hash del contrato y sello de tiempo.
import { useEffect, useState } from 'react';
import { api, dateTime } from '@/lib/client/api';

const NAMES: any = { FIRMA_CLIENTE: 'Firma del Cliente', FIRMA_PROVEEDOR: 'Firma del Proveedor', PAGO: 'Pago', ENTREGA_CONTENIDO: 'Entrega de contenido', APROBACION_CONTENIDO: 'Aprobación del contenido' };
const CHECKS: any = { recordHash: 'Registro íntegro', timestamp: 'Sello de tiempo', certificateChain: 'Cadena de certificados', signature: 'Firma ECDSA', contractHash: 'Hash del contrato', contentHash: 'Hash del contenido' };

export default function EvidencePanel({ contractId, refreshKey }) {
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) api(`/api/contracts/${contractId}/evidences`).then(setData).catch((e) => setError(e.message)); }, [open, contractId, refreshKey]);
  return (
    <section className="card stack">
      <div className="row between"><h2>Evidencia y verificación</h2><button className="btn ghost" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Ocultar' : 'Verificar evidencia'}</button></div>
      {open && error && <p className="error" role="alert">{error}</p>}
      {open && data && (
        <>
          <p>{data.valid ? <span className="pill ok">Toda la evidencia es válida</span> : <span className="pill bad">Hay evidencia que no supera la verificación</span>}</p>
          <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Evento</th><th>Tipo</th><th>Fecha (UTC)</th><th>Comprobaciones</th></tr></thead>
            <tbody>{data.evidences.map((e) => (<tr key={e.id}><td>{NAMES[e.event] || e.event}{e.ref ? ` · ${e.ref}` : ''}</td><td>{e.kind === 'ORIGEN' ? 'Origen' : 'Recepción'}</td><td className="small">{dateTime(e.timestampUtc)}</td>
              <td>{Object.entries(e.checks).map(([k, ok]) => <span key={k} className={`pill ${ok ? 'ok' : 'bad'}`} style={{ marginRight: 4 }}>{ok ? '✓' : '✗'} {CHECKS[k] || k}</span>)}</td></tr>))}</tbody></table></div>
        </>
      )}
    </section>
  );
}
