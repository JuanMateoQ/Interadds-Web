'use client';
// Visor protegido del contrato (RF-37, RS-45): el texto llega por POST autenticado, con marca de agua dinámica
// (nombre, correo y hora del lector) y disuasivos contra copiar, imprimir y guardar. Son medidas de disuasión.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, dateTime } from '@/lib/client/api';

export default function Visor() {
  const { id } = useParams();
  const [v, setV] = useState<any>(null);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState(false);

  useEffect(() => { api(`/api/contracts/${id}/view`, { method: 'POST' }).then(setV).catch((e) => setError(e.message)); }, [id]);
  useEffect(() => {
    const block = (e) => { e.preventDefault(); };
    const keys = (e) => { if ((e.ctrlKey || e.metaKey) && ['c', 'p', 's', 'a', 'x'].includes(e.key.toLowerCase())) e.preventDefault(); };
    const vis = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('copy', block); document.addEventListener('cut', block); document.addEventListener('contextmenu', block);
    document.addEventListener('dragstart', block); document.addEventListener('keydown', keys); document.addEventListener('visibilitychange', vis);
    return () => { ['copy', 'cut', 'contextmenu', 'dragstart'].forEach((t) => document.removeEventListener(t, block)); document.removeEventListener('keydown', keys); document.removeEventListener('visibilitychange', vis); };
  }, []);

  if (error) return <div className="card"><p className="error" role="alert">{error}</p><Link href={`/contratos/${id}`}>Volver</Link></div>;
  if (!v) return <p className="muted">Cargando contrato…</p>;
  const mark = `${v.watermark.name} · ${v.watermark.email} · ${dateTime(v.watermark.at)}`;
  return (
    <>
      <div className="row between"><p><Link href={`/contratos/${id}`}>← Volver al contrato</Link></p><span className="pill">{v.status.replaceAll('_', ' ').toLowerCase()}</span></div>
      <p className="muted small">Documento de uso personal. Cada lectura queda marcada con tu nombre, correo y hora; copiar o imprimir está deshabilitado. Huella SHA-256: <code style={{ wordBreak: 'break-all' }}>{v.hash}</code></p>
      <div className="viewer" aria-label="Texto del contrato" style={{ filter: hidden ? 'blur(12px)' : 'none' }}>
        <div className="watermark" aria-hidden="true">{Array.from({ length: 15 }, (_, i) => <span key={i}>{mark}</span>)}</div>
        <pre>{v.text}</pre>
      </div>
    </>
  );
}
