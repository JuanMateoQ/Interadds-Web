'use client';
// Barra de navegación con menú por rol y campana de notificaciones en tiempo real (RF-29, RNF-10).
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { io } from 'socket.io-client';
import { api, setCsrfToken, dateTime } from '@/lib/client/api';

const MENUS: any = {
  CLIENTE: [['/catalogo', 'Catálogo'], ['/inicio', 'Inicio'], ['/contratos', 'Mis contratos'], ['/chat', 'Chat'], ['/perfil', 'Perfil']],
  PROVEEDOR: [['/inicio', 'Inicio'], ['/proveedor/servicios', 'Mis servicios'], ['/contratos', 'Contratos'], ['/chat', 'Chat'], ['/perfil', 'Perfil']],
  ADMIN_SISTEMA: [['/inicio', 'Inicio'], ['/chat', 'Chat general'], ['/perfil', 'Perfil']],
};
const ROLE_LABEL: any = { CLIENTE: 'Cliente', PROVEEDOR: 'Proveedor', ADMIN_SISTEMA: 'Administrador' };

export default function NavBar({ user }) {
  const path = usePathname();
  const [items, setItems] = useState<any>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const d = await api('/api/notifications');
      setItems(d.items);
      setUnread(d.unread);
    } catch (_) { /* sin sesión: se ignora */ }
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    load();
    const socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    socket.on('notification', (n) => {
      setItems((prev) => [n, ...prev].slice(0, 30));
      setUnread((u) => u + 1);
    });
    return () => { socket.close(); };
  }, [user, load]);

  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  async function toggle() {
    setOpen(!open);
    if (!open && unread) {
      await api('/api/notifications/read', { method: 'POST', body: {} }).catch(() => {});
      setUnread(0);
    }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setCsrfToken(null);
    window.location.href = '/login';
  }

  const menu = user ? MENUS[user.role] || [] : [['/catalogo', 'Catálogo']];
  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href={user ? '/inicio' : '/catalogo'} className="brand">Inter<span>adds</span></Link>
        <nav aria-label="Principal" className="nav-links">
          {menu.map(([href, label]) => (
            <Link key={href} href={href} className={path === href || path.startsWith(href + '/') ? 'active' : ''}>{label}</Link>
          ))}
        </nav>
        <div className="nav-right">
          {user ? (
            <>
              <div className="bell-wrap" ref={box}>
                <button className="bell" onClick={toggle} aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ''}`} aria-expanded={open}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" /></svg>
                  {unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
                </button>
                {open && (
                  <div className="dropdown" role="region" aria-label="Notificaciones">
                    {items.length === 0 && <p className="muted pad">No tienes notificaciones.</p>}
                    {items.map((n) => (
                      <Link key={n.id} href={n.contractId ? `/contratos/${n.contractId}` : '/inicio'} className="notif" onClick={() => setOpen(false)}>
                        <strong>{n.title}</strong>
                        <span>{n.body}</span>
                        <small>{dateTime(n.createdAt)}</small>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <span className="who" title={user.email}>{user.name}<small>{ROLE_LABEL[user.role]}</small></span>
              <button className="btn ghost" onClick={logout}>Salir</button>
            </>
          ) : (
            <>
              <Link className="btn ghost" href="/login">Ingresar</Link>
              <Link className="btn primary" href="/registro">Crear cuenta</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
