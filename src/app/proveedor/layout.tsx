import { requirePage } from '@/lib/serverAuth';

// RS-38: solo el rol Proveedor entra a estas pantallas (la API vuelve a comprobarlo).
export default async function ProveedorLayout({ children }) {
  await requirePage({ roles: ['PROVEEDOR'], next: '/proveedor/servicios' });
  return children;
}
