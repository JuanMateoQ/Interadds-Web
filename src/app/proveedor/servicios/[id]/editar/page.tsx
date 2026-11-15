'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/client/api';
import ServiceForm from '@/components/ServiceForm';

export default function Editar() {
  const { id } = useParams();
  const [s, setS] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => { api(`/api/provider/services/${id}`).then((d) => setS(d.service)).catch((e) => setError(e.message)); }, [id]);
  if (error) return <p className="error" role="alert">{error}</p>;
  if (!s) return <p className="muted">Cargando…</p>;
  return (<><h1>Editar servicio</h1><ServiceForm service={s} /></>);
}
