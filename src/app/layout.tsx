import './globals.css';
import NavBar from '@/components/NavBar';
import { getCurrentUser } from '@/lib/serverAuth';

export const metadata = {
  title: 'Interadds — servicios de marketing con contratos firmados',
  description: 'Contrata servicios de marketing digital con contrato digital, firma electrónica y pago seguro con PayPal.',
};
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }) {
  const user = await getCurrentUser();
  const safe = user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null;
  return (
    <html lang="es">
      <body>
        <a href="#contenido" className="skip">Saltar al contenido</a>
        <NavBar user={safe} />
        <main id="contenido" className="container">{children}</main>
        <footer className="footer">Interadds · Bimestre 1 · Pagos en PayPal Sandbox (no se cobra dinero real)</footer>
      </body>
    </html>
  );
}
