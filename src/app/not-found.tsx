import Link from 'next/link';
export default function NotFound() {
  return (<div className="card stack center"><h1>No encontramos esa página</h1><p className="muted">Puede que el enlace esté mal escrito o que no tengas acceso.</p><Link className="btn primary" href="/catalogo">Ir al catálogo</Link></div>);
}
