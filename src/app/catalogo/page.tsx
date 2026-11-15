'use client';
// Catálogo público (RF-01): búsqueda, filtro por categoría y precio, paginación.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, money } from '@/lib/client/api';

export default function Catalogo() {
  const [filters, setFilters] = useState<any>({ q: '', category: '', min: '', max: '' });
  const [page, setPage] = useState(1);
  const [cats, setCats] = useState<any>([]);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => { api('/api/categories').then((d) => setCats(d.categories || [])).catch(() => {}); }, []);

  const load = useCallback(async (f: any, p: any) => {
    setError('');
    const qs = new URLSearchParams({ page: String(p), pageSize: '9' });
    Object.entries(f).forEach(([k, v]) => v && qs.set(k, v as string));
    try { setData(await api(`/api/services?${qs}`)); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(filters, page); }, [page, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setFilters((p) => ({ ...p, [k]: e.target.value }));
  const search = (e) => { e.preventDefault(); setPage(1); load(filters, 1); };

  return (
    <>
      <div><h1>Catálogo de servicios</h1><p className="muted">Servicios de marketing de proveedores verificados por contrato digital.</p></div>
      <form className="card row" onSubmit={search} style={{ alignItems: 'flex-end' }}>
        <label style={{ flex: 2, minWidth: 180 }}>Buscar<input value={filters.q} onChange={set('q')} placeholder="Ej. SEO, redes sociales…" /></label>
        <label style={{ flex: 1, minWidth: 150 }}>Categoría
          <select value={filters.category} onChange={set('category')}><option value="">Todas</option>{cats.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select>
        </label>
        <label style={{ width: 110 }}>Precio mín.<input inputMode="decimal" value={filters.min} onChange={set('min')} placeholder="0" /></label>
        <label style={{ width: 110 }}>Precio máx.<input inputMode="decimal" value={filters.max} onChange={set('max')} placeholder="500" /></label>
        <button className="btn primary">Filtrar</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {!data && !error && <p className="muted">Cargando…</p>}
      {data && data.items.length === 0 && <div className="card center"><p>No encontramos servicios con esos filtros.</p></div>}
      {data && (
        <div className="grid">
          {data.items.map((s) => (
            <article key={s.id} className="card stack">
              <div className="row between"><span className="pill">{s.category?.name}</span><span className="muted small">{s.deliveryDays} días</span></div>
              <h2 style={{ fontSize: '1.1rem' }}><Link href={`/servicios/${s.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{s.title}</Link></h2>
              <p className="muted small">{s.description.length > 110 ? `${s.description.slice(0, 110)}…` : s.description}</p>
              <div className="row between" style={{ marginTop: 'auto' }}><span className="price">{money(s.priceCents)}</span><Link className="btn ghost" href={`/servicios/${s.id}`}>Ver detalle</Link></div>
              <span className="muted small">Por {s.provider?.tradeName}</span>
            </article>
          ))}
        </div>
      )}
      {data && data.totalPages > 1 && (
        <nav className="row center" aria-label="Paginación" style={{ justifyContent: 'center' }}>
          <button className="btn ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Anterior</button>
          <span className="muted">Página {data.page} de {data.totalPages} · {data.total} servicios</span>
          <button className="btn ghost" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Siguiente →</button>
        </nav>
      )}
    </>
  );
}
