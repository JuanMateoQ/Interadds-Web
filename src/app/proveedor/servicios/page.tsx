'use client';
// Gestión de servicios propios (RF-10..12): listar, editar y eliminar con confirmación.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, money } from '@/lib/client/api';

const STATUS: any = { PUBLICADO: ['Publicado', 'ok'], BORRADOR: ['Borrador', 'gray'], PAUSADO: ['Pausado', 'warn'] };

export default function MisServicios() {
  const [list, setList] = useState<any>(null);
  const [confirm, setConfirm] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => api('/api/provider/services').then((d) => setList(d.services)).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function remove(s) {
    setError(''); setMsg('');
    try {
      const r = await api(`/api/provider/services/${s.id}`, { method: 'DELETE', body: { confirm: true } });
      setMsg(r.deleted ? 'Servicio eliminado.' : r.message);
      setConfirm(null); load();
    } catch (e) { setError(e.message); }
  }
  return (
    <>
      <div className="row between"><h1>Mis servicios</h1><Link className="btn primary" href="/proveedor/servicios/nuevo">Nuevo servicio</Link></div>
      {msg && <p className="success" role="status">{msg}</p>}{error && <p className="error" role="alert">{error}</p>}
      {!list && <p className="muted">Cargando…</p>}
      {list && list.length === 0 && <div className="card center"><p>Aún no publicaste servicios.</p></div>}
      {list && list.length > 0 && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Título</th><th>Categoría</th><th>Precio</th><th>Plazo</th><th>Estado</th><th /></tr></thead>
            <tbody>{list.map((s) => (
              <tr key={s.id}><td>{s.title}</td><td>{s.category?.name}</td><td>{money(s.priceCents)}</td><td>{s.deliveryDays} d</td>
                <td><span className={`pill ${STATUS[s.status][1]}`}>{STATUS[s.status][0]}</span></td>
                <td className="row"><Link className="btn ghost" href={`/proveedor/servicios/${s.id}/editar`}>Editar</Link>
                  {confirm === s.id ? (<><button className="btn danger" onClick={() => remove(s)}>Sí, eliminar</button><button className="btn ghost" onClick={() => setConfirm(null)}>No</button></>)
                    : <button className="btn ghost" onClick={() => setConfirm(s.id)}>Eliminar</button>}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
