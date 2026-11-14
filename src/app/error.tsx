'use client';
export default function ErrorPage({ reset }) {
  return (<div className="card stack center"><h1>Algo salió mal</h1><p className="muted">Ocurrió un error inesperado. Inténtalo de nuevo.</p><button className="btn primary" onClick={reset}>Reintentar</button></div>);
}
