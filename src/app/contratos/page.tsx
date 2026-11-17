import Link from 'next/link';
import { requirePage } from '@/lib/serverAuth';
import { listContracts } from '@/modules/contracts/service';
import { LABELS } from '@/modules/contracts/stateMachine';
import { formatUsd } from '@/lib/money';

export const metadata = { title: 'Contratos · Interadds' };

// RF-22: historial de contratos propios, con su estado (solo las dos partes los ven).
export default async function Contratos() {
  const user = await requirePage({ roles: ['CLIENTE', 'PROVEEDOR'], next: '/contratos' });
  const rows = await listContracts(user);
  return (
    <>
      <h1>{user.role === 'CLIENTE' ? 'Mis contratos' : 'Contratos de mis servicios'}</h1>
      {rows.length === 0 && <div className="card center stack"><p>Todavía no hay contratos.</p>{user.role === 'CLIENTE' && <Link className="btn primary" href="/catalogo">Explorar el catálogo</Link>}</div>}
      {rows.length > 0 && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Servicio</th><th>{user.role === 'CLIENTE' ? 'Proveedor' : 'Cliente'}</th><th>Total</th><th>Estado</th><th>Actualizado</th><th /></tr></thead>
            <tbody>{rows.map((c) => (
              <tr key={c.id}><td>{c.serviceTitle}</td><td>{c.counterpartName}</td><td>{formatUsd(c.totalCents)}</td>
                <td><span className={`pill ${c.status === 'COMPLETADO' ? 'ok' : ''}`}>{LABELS[c.status]}</span></td>
                <td className="muted small">{new Date(c.updatedAt).toLocaleDateString('es-EC')}</td>
                <td><Link href={`/contratos/${c.id}`}>Abrir</Link></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
