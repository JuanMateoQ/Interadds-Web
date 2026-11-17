'use client';
// Sala de chat en tiempo real (RF-23..25) con Socket.IO. La conexión usa la cookie de sesión (handshake autenticado)
// y los mensajes se muestran siempre como TEXTO (React escapa el contenido).
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { dateTime } from '@/lib/client/api';

export default function ChatRoom({ room, user }) {
  const [msgs, setMsgs] = useState<any>([]);
  const [online, setOnline] = useState<any>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [state, setState] = useState('conectando');
  const socketRef = useRef<any>(null);
  const end = useRef<any>(null);
  const key = room.type === 'general' ? 'general' : room.contractId;

  useEffect(() => {
    setMsgs([]); setError(''); setState('conectando');
    const s = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = s;
    const same = (r) => r && r.type === room.type && (room.type === 'general' || r.contractId === room.contractId);
    s.on('connect', () => s.emit('room:join', room, (res) => {
      if (!res.ok) { setState('error'); return setError(res.message || 'No se pudo entrar a la sala'); }
      setState('listo'); setMsgs(res.history); setOnline(res.online);
    }));
    s.on('connect_error', () => { setState('error'); setError('No se pudo conectar. Inicia sesión de nuevo.'); });
    s.on('disconnect', () => setState('desconectado'));
    s.on('message:new', (e) => { if (same(e.room)) setMsgs((p) => [...p, e.message]); });
    s.on('presence:update', (e) => { if (same(e.room)) setOnline(e.online); });
    return () => { s.close(); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { end.current && end.current.scrollIntoView({ block: 'end' }); }, [msgs]);

  function send(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return setError('Escribe un mensaje');
    if (t.length > 1000) return setError('El mensaje no puede superar 1000 caracteres');
    setError('');
    socketRef.current.emit('message:send', { ...room, text: t }, (res) => { if (!res.ok) setError(res.message || 'No se pudo enviar'); else setText(''); });
  }
  return (
    <div className="card chat">
      <div className="row between" style={{ marginBottom: 8 }}>
        <span className="small muted">{state === 'listo' ? `En línea: ${online.map((o) => o.name).join(', ') || '—'}` : state === 'conectando' ? 'Conectando…' : 'Sin conexión'}</span>
      </div>
      <div className="msgs" role="log" aria-live="polite">
        {msgs.length === 0 && state === 'listo' && <p className="muted center">Aún no hay mensajes. ¡Escribe el primero!</p>}
        {msgs.map((m) => (<div key={m.id} className={`msg ${m.authorId === user.id ? 'mine' : ''}`}><small>{m.authorName} · {dateTime(m.createdAt)}</small>{m.text}</div>))}
        <div ref={end} />
      </div>
      <form className="row" onSubmit={send} noValidate style={{ marginTop: 10 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe un mensaje…" aria-label="Mensaje" maxLength={1200} style={{ flex: 1 }} disabled={state !== 'listo'} />
        <button className="btn primary" disabled={state !== 'listo'}>Enviar</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
