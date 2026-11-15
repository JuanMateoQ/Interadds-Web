'use client';
// Formulario de servicio (RF-10, RF-11): 5 atributos validados con el mismo esquema que el servidor (RNF-01).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { serviceSchema } from '@/lib/validation/catalog';
import { validateForm } from '@/lib/validation/auth';
import Field from './Field';

export default function ServiceForm({ service }: { service?: any }) {
  const router = useRouter();
  const [cats, setCats] = useState<any>([]);
  const [v, setV] = useState(service ? { title: service.title, categoryId: service.categoryId, description: service.description, price: String(service.price), deliveryDays: String(service.deliveryDays), status: service.status } : { title: '', categoryId: '', description: '', price: '', deliveryDays: '', status: 'PUBLICADO' });
  const [errors, setErrors] = useState<any>({});
  const [fatal, setFatal] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/api/categories').then((d) => setCats(d.categories)).catch(() => {}); }, []);
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault(); setFatal('');
    const check = validateForm(serviceSchema, v);
    setErrors(check.errors || {});
    if (!check.ok) return;
    setBusy(true);
    try {
      await api(service ? `/api/provider/services/${service.id}` : '/api/provider/services', { method: service ? 'PUT' : 'POST', body: v });
      router.push('/proveedor/servicios');
    } catch (err) { if (err.details) setErrors(err.details); setFatal(err.message); setBusy(false); }
  }
  const E = errors;
  return (
    <form className="card stack" onSubmit={submit} noValidate style={{ maxWidth: 640 }}>
      <Field label="Título" error={E.title}><input value={v.title} onChange={set('title')} aria-invalid={!!E.title} /></Field>
      <Field label="Categoría" error={E.categoryId}>
        <select value={v.categoryId} onChange={set('categoryId')} aria-invalid={!!E.categoryId}><option value="">Elige una categoría</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </Field>
      <Field label="Descripción" error={E.description}><textarea value={v.description} onChange={set('description')} aria-invalid={!!E.description} /></Field>
      <div className="row">
        <div style={{ flex: 1, minWidth: 160 }}><Field label="Precio total (USD)" error={E.price} hint="Hasta 2 decimales"><input inputMode="decimal" value={v.price} onChange={set('price')} aria-invalid={!!E.price} /></Field></div>
        <div style={{ flex: 1, minWidth: 160 }}><Field label="Plazo de entrega (días)" error={E.deliveryDays}><input inputMode="numeric" value={v.deliveryDays} onChange={set('deliveryDays')} aria-invalid={!!E.deliveryDays} /></Field></div>
      </div>
      <Field label="Estado" error={E.status}><select value={v.status} onChange={set('status')}><option value="PUBLICADO">Publicado (visible en el catálogo)</option><option value="BORRADOR">Borrador</option><option value="PAUSADO">Pausado</option></select></Field>
      {fatal && <p className="error" role="alert">{fatal}</p>}
      <div className="row"><button className="btn primary" disabled={busy}>{busy ? 'Guardando…' : service ? 'Guardar cambios' : 'Crear servicio'}</button><button type="button" className="btn ghost" onClick={() => router.push('/proveedor/servicios')}>Cancelar</button></div>
    </form>
  );
}
