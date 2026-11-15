'use client';
// Formularios de acceso (RF-04..07). La validación (RNF-01) usa los MISMOS esquemas zod que el servidor.
import { useState } from 'react';
import Link from 'next/link';
import { api, setCsrfToken } from '@/lib/client/api';
import { registerSchema, loginSchema, forgotSchema, resetSchema, validateForm } from '@/lib/validation/auth';
import Field from './Field';

const SCHEMAS: any = { login: loginSchema, register: registerSchema, forgot: forgotSchema, reset: resetSchema };

export default function AuthForm({ mode, next = '/inicio', token = '' }) {
  const [v, setV] = useState<any>({ role: 'CLIENTE' });
  const [errors, setErrors] = useState<any>({});
  const [msg, setMsg] = useState('');
  const [fatal, setFatal] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setFatal(''); setMsg('');
    const data = mode === 'reset' ? { ...v, token } : v;
    const check = validateForm(SCHEMAS[mode], data);
    setErrors(check.errors || {});
    if (!check.ok) return;
    setBusy(true);
    try {
      if (mode === 'login') {
        const r = await api('/api/auth/login', { method: 'POST', body: check.data });
        setCsrfToken(r.csrfToken);
        window.location.href = next;
      } else if (mode === 'register') {
        await api('/api/auth/register', { method: 'POST', body: check.data });
        window.location.href = '/login?registrado=1';
      } else if (mode === 'forgot') {
        await api('/api/auth/forgot', { method: 'POST', body: check.data });
        setMsg('Si el correo existe, te enviamos un enlace para crear una clave nueva. En este entorno de desarrollo el enlace aparece en la consola del servidor.');
      } else {
        await api('/api/auth/reset', { method: 'POST', body: check.data });
        window.location.href = '/login?restablecida=1';
      }
    } catch (err) {
      if (err.details && Object.keys(err.details).length) setErrors(err.details);
      setFatal(err.message);
    } finally {
      setBusy(false);
    }
  }

  const E = errors;
  return (
    <form className="card stack auth" onSubmit={submit} noValidate>
      <h1>{{ login: 'Ingresar', register: 'Crear cuenta', forgot: 'Recuperar clave', reset: 'Nueva clave' }[mode]}</h1>
      {mode === 'register' && (
        <>
          <Field label="Nombre completo" error={E.name}><input value={v.name || ''} onChange={set('name')} autoComplete="name" aria-invalid={!!E.name} /></Field>
          <Field label="Quiero usar Interadds como" error={E.role}>
            <select value={v.role} onChange={set('role')}><option value="CLIENTE">Cliente (contrato servicios)</option><option value="PROVEEDOR">Proveedor (ofrezco servicios)</option></select>
          </Field>
        </>
      )}
      {mode !== 'reset' && <Field label="Correo electrónico" error={E.email}><input type="email" value={v.email || ''} onChange={set('email')} autoComplete="email" aria-invalid={!!E.email} /></Field>}
      {mode !== 'forgot' && (
        <Field label={mode === 'reset' ? 'Clave nueva' : 'Clave'} error={E.password} hint={mode !== 'login' ? 'Mínimo 8 caracteres, con letras y números' : undefined}>
          <input type="password" value={v.password || ''} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} aria-invalid={!!E.password} />
        </Field>
      )}
      {(mode === 'register' || mode === 'reset') && (
        <Field label="Repite la clave" error={E.confirmPassword}><input type="password" value={v.confirmPassword || ''} onChange={set('confirmPassword')} autoComplete="new-password" aria-invalid={!!E.confirmPassword} /></Field>
      )}
      {E.token && <p className="error">{E.token}</p>}
      {fatal && <p className="error" role="alert">{fatal}</p>}
      {msg && <p className="success" role="status">{msg}</p>}
      <button className="btn primary" disabled={busy}>{busy ? 'Enviando…' : { login: 'Ingresar', register: 'Crear cuenta', forgot: 'Enviar enlace', reset: 'Guardar clave' }[mode]}</button>
      <div className="small muted stack" style={{ gap: 4 }}>
        {mode === 'login' && <><Link href="/recuperar">¿Olvidaste tu clave?</Link><span>¿No tienes cuenta? <Link href="/registro">Regístrate</Link></span></>}
        {mode === 'register' && <span>¿Ya tienes cuenta? <Link href="/login">Ingresa</Link></span>}
        {(mode === 'forgot' || mode === 'reset') && <Link href="/login">Volver a ingresar</Link>}
      </div>
    </form>
  );
}
