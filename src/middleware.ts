import { NextResponse } from 'next/server';

// Middleware de rutas (RS-01, RNF-02): las pantallas privadas exigen una cookie de sesión; sin ella se
// redirige a /login conservando el destino. La sesión REAL y el ROL se validan en el servidor (layouts y API).
const PROTECTED: any = ['/inicio', '/perfil', '/contratos', '/proveedor', '/chat'];

export function middleware(request) {
  const { pathname, search } = request.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/'));
  if (isProtected && !request.cookies.get('interadds_session')) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!api|_next|favicon.ico).*)'] };
