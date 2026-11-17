import Link from 'next/link';
import { requirePage } from '@/lib/serverAuth';
import { listContracts } from '@/modules/contracts/service';
import { LABELS } from '@/modules/contracts/stateMachine';
import { formatUsd as money } from '@/lib/money';

export const metadata = { title: 'Inicio · Interadds' };

const NEXT: any = {
  GENERADO: 'Firma pendiente', FIRMADO_PARCIAL: 'Falta una firma', VIGENTE: 'Anticipo pendiente', ANTICIPO_PAGADO: 'En producción',
  CONTENIDO_ENTREGADO: 'Por aprobar', CONTENIDO_APROBADO: 'Saldo pendiente', COMPLETADO: 'Completado',
};

export default async function Inicio({ searchParams }) {
  const user = await requirePage({ next: '/inicio' });
  const sp = await searchParams;
  const contracts = user.role === 'ADMIN_SISTEMA' ? [] : await listContracts(user);
  const active = contracts.filter((c) => c.status !== 'COMPLETADO');
  return (
    <>
      {sp.aviso === 'permiso' && <p className="error card" role="alert">No tienes permiso para abrir esa sección.</p>}
      <div><h1>Hola, {user.name.split(' ')[0]}</h1>
        <p className="muted">{user.role === 'CLIENTE' ? 'Explora el catálogo y gestiona tus contratos.' : user.role === 'PROVEEDOR' ? 'Gestiona tus servicios y los contratos en curso.' : 'Cuenta de administración del sistema: acceso al chat general.'}</p></div>
      <div className="row">
        {user.role === 'CLIENTE' && <Link className="btn primary" href="/catalogo">Explorar catálogo</Link>}
        {user.role === 'PROVEEDOR' && <><Link className="btn primary" href="/proveedor/servicios/nuevo">Publicar un servicio</Link><Link className="btn ghost" href="/proveedor/servicios">Mis servicios</Link></>}
        <Link className="btn ghost" href="/chat">Chat general</Link>
      </div>
      {user.role !== 'ADMIN_SISTEMA' && (
        <section className="card stack" aria-labelledby="h-contratos">
          <div className="row between"><h2 id="h-contratos">Contratos en curso ({active.length})</h2><Link href="/contratos">Ver todos</Link></div>
          {active.length === 0 && <p className="muted">Todavía no tienes contratos en curso.</p>}
          {active.length > 0 && (
            <table>
              <thead><tr><th>Servicio</th><th>Con</th><th>Total</th><th>Estado</th><th /></tr></thead>
              <tbody>{active.map((c) => (
                <tr key={c.id}><td>{c.serviceTitle}</td><td>{c.counterpartName}</td><td>{money(c.totalCents)}</td>
                  <td><span className="pill">{LABELS[c.status]}</span> <span className="muted small">{NEXT[c.status]}</span></td>
                  <td><Link href={`/contratos/${c.id}`}>Abrir</Link></td></tr>
              ))}</tbody>
            </table>
          )}
        </section>
      )}
    </>
  );
}
