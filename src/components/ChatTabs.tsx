'use client';
import { useState } from 'react';
import ChatRoom from './ChatRoom';

export default function ChatTabs({ user, rooms, initial }) {
  const [sel, setSel] = useState(rooms.some((r) => r.id === initial) ? initial : 'general');
  const room = sel === 'general' ? { type: 'general' } : { type: 'contract', contractId: sel };
  return (
    <div className="stack">
      <div className="row" role="tablist" aria-label="Salas de chat">
        <button role="tab" aria-selected={sel === 'general'} className={`btn ${sel === 'general' ? 'primary' : 'ghost'}`} onClick={() => setSel('general')}>Chat general</button>
        {rooms.map((r) => (<button key={r.id} role="tab" aria-selected={sel === r.id} className={`btn ${sel === r.id ? 'primary' : 'ghost'}`} onClick={() => setSel(r.id)}>{r.title} · {r.with}</button>))}
      </div>
      {rooms.length === 0 && <p className="muted small">Los chats privados de contrato se abren cuando el Cliente paga el anticipo.</p>}
      <ChatRoom room={room} user={user} />
    </div>
  );
}
