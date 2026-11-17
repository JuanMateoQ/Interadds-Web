'use client';
// Panel de firma (RF-17, RS-26). Pasos: 1) volver a pedir la clave, 2) el servidor entrega nonce + payload,
// 3) el navegador firma con ECDSA P-256, 4) el servidor valida y guarda la evidencia.
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { ensureCertificate, signPayload } from '@/lib/client/webcrypto';

const COPY: any = {
  sign: { title: 'Firmar el contrato', button: 'Firmar con mi certificado', prepare: 'sign/prepare', submit: 'sign', done: 'Contrato firmado correctamente.' },
  approve: { title: 'Aprobar el contenido entregado', button: 'Aprobar con mi firma', prepare: 'approve/prepare', submit: 'approve', done: 'Contenido aprobado y firmado.' },
};

export default function SignPanel({ user, contractId, kind = 'sign', onDone }) {
  const c = COPY[kind];
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!password) return setError('Ingresa tu clave para continuar');
    setBusy(true);
    try {
      const serial = await ensureCertificate(user);
      const prep = await api(`/api/contracts/${contractId}/${c.prepare}`, { method: 'POST', body: { password } });
      const { signature } = await signPayload(user.id, prep.payload);
      await api(`/api/contracts/${contractId}/${c.submit}`, { method: 'POST', body: { nonce: prep.nonce, signature, certificateSerial: serial } });
      setOk(c.done);
      setPassword('');
      onDone && onDone(c.done);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit} noValidate>
      <h3>{c.title}</h3>
      <p className="muted">
        Por seguridad te pedimos tu clave otra vez. Tu clave privada de firma nunca sale de este navegador: solo se envía la firma.
      </p>
      <label>
        Tu clave
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" aria-invalid={!!error} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {ok && <p className="success" role="status">{ok}</p>}
      <button className="btn primary" disabled={busy}>{busy ? 'Firmando…' : c.button}</button>
    </form>
  );
}
