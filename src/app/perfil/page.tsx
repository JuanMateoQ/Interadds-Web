'use client';
// Perfil (RF-09): Cliente edita nombre y teléfono; Proveedor además su perfil profesional. Muestra los certificados.
import { useEffect, useState } from 'react';
import { api, dateTime } from '@/lib/client/api';
import { profileSchema, validateForm } from '@/lib/validation/auth';
import Field from '@/components/Field';

export default function Perfil() {
  const [p, setP] = useState<any>(null);
  const [certs, setCerts] = useState<any>([]);
  const [errors, setErrors] = useState<any>({});
  const [msg, setMsg] = useState('');
  const [fatal, setFatal] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/profile').then((d) => setP(d.profile || d)).catch((e) => setFatal(e.message));
    api('/api/signing/certificates').then((d) => setCerts(d.certificates)).catch(() => {});
  }, []);
  if (!p) return fatal ? <p className="error">{fatal}</p> : <p className="muted">Cargando…</p>;

  const prov = p.provider || {};
  const setTop = (k) => (e) => setP({ ...p, [k]: e.target.value });
  const setProv = (k) => (e) => setP({ ...p, provider: { ...prov, [k]: e.target.value } });

  async function save(e) {
    e.preventDefault(); setMsg(''); setFatal('');
    const payload: any = { name: p.name, phone: p.phone || '', ...(p.role === 'PROVEEDOR' ? { provider: { tradeName: prov.tradeName || '', description: prov.description || '', contactEmail: prov.contactEmail || '', contactPhone: prov.contactPhone || '' } } : {}) };
    const check = validateForm(profileSchema, payload);
    setErrors(check.errors || {});
    if (!check.ok) return;
    setBusy(true);
    try { const d = await api('/api/profile', { method: 'PUT', body: check.data }); setP(d.profile || d); setMsg('Perfil guardado.'); }
    catch (err) { if (err.details) setErrors(err.details); setFatal(err.message); }
    finally { setBusy(false); }
  }
  const E = errors;
  return (
    <>
      <h1>Mi perfil</h1>
      <form className="card stack" onSubmit={save} noValidate style={{ maxWidth: 640 }}>
        <Field label="Correo electrónico"><input value={p.email} disabled /></Field>
        <Field label="Nombre completo" error={E.name}><input value={p.name || ''} onChange={setTop('name')} aria-invalid={!!E.name} /></Field>
        <Field label="Teléfono (solo números)" error={E.phone}><input inputMode="numeric" value={p.phone || ''} onChange={setTop('phone')} aria-invalid={!!E.phone} /></Field>
        {p.role === 'PROVEEDOR' && (
          <>
            <h2>Perfil profesional</h2>
            <Field label="Nombre comercial" error={E['provider.tradeName']}><input value={prov.tradeName || ''} onChange={setProv('tradeName')} /></Field>
            <Field label="Descripción" error={E['provider.description']}><textarea value={prov.description || ''} onChange={setProv('description')} /></Field>
            <Field label="Correo de contacto" error={E['provider.contactEmail']}><input type="email" value={prov.contactEmail || ''} onChange={setProv('contactEmail')} /></Field>
            <Field label="Teléfono de contacto" error={E['provider.contactPhone']}><input inputMode="numeric" value={prov.contactPhone || ''} onChange={setProv('contactPhone')} /></Field>
          </>
        )}
        {fatal && <p className="error" role="alert">{fatal}</p>}
        {msg && <p className="success" role="status">{msg}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
      </form>
      {p.role !== 'ADMIN_SISTEMA' && (
        <section className="card stack" style={{ maxWidth: 640 }}>
          <h2>Mis certificados de firma</h2>
          <p className="muted small">Se crean automáticamente la primera vez que firmas. Los emite la CA de Interadds; la clave privada se queda en este navegador.</p>
          {certs.length === 0 && <p className="muted">Aún no tienes certificados.</p>}
          {certs.map((c) => (<div key={c.serial} className="row between small"><span>Serial <code>{c.serial.slice(0, 16)}…</code></span><span className={`pill ${c.status === 'ACTIVO' ? 'ok' : 'gray'}`}>{c.status}</span><span className="muted">vence {dateTime(c.notAfter)}</span></div>))}
        </section>
      )}
    </>
  );
}
