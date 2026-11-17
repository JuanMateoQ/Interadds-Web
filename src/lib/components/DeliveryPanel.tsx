'use client';
// Entregas (RF-26, RF-27): el Proveedor sube contenido; las dos partes lo descargan por una ruta autenticada.
import { useRef, useState } from 'react';
import { api, dateTime } from '@/lib/client/api';

const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function DeliveryPanel({ contractId, deliveries, canUpload, onDone }) {
  const input = useRef<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function upload(e) {
    e.preventDefault(); setError('');
    const f = input.current.files[0];
    if (!f) return setError('Elige un archivo para subir');
    const form = new FormData(); form.append('file', f);
    setBusy(true);
    try { await api(`/api/contracts/${contractId}/deliveries`, { method: 'POST', form }); input.current.value = ''; onDone && onDone(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <section className="card stack">
      <h2>Contenido entregado</h2>
      {canUpload && (
        <form className="row" onSubmit={upload} noValidate style={{ alignItems: 'flex-end' }}>
          <label style={{ flex: 1, minWidth: 220 }}>Subir archivo (PDF, imagen, MP4 o TXT)<input ref={input} type="file" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.mp4,.txt" /></label>
          <button className="btn primary" disabled={busy}>{busy ? 'Subiendo…' : 'Subir entrega'}</button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {deliveries.length === 0 && <p className="muted">Todavía no hay entregas.</p>}
      {deliveries.length > 0 && (
        <table><thead><tr><th>Versión</th><th>Archivo</th><th>Tamaño</th><th>Huella SHA-256</th><th>Subido</th></tr></thead>
          <tbody>{deliveries.map((d) => (<tr key={d.id}><td>v{d.version}{d.approvedAt && <> <span className="pill ok">Aprobada</span></>}</td>
            <td><a href={`/api/contracts/${contractId}/deliveries/${d.id}/file`} target="_blank" rel="noopener noreferrer">{d.name}</a></td><td>{kb(d.sizeBytes)}</td>
            <td><code className="small">{d.sha256.slice(0, 16)}…</code></td><td className="small muted">{dateTime(d.createdAt)}</td></tr>))}</tbody></table>
      )}
    </section>
  );
}
