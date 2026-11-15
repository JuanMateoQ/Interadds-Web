import AuthForm from '@/components/AuthForm';
import { safeNext } from '@/lib/http';

export const metadata = { title: 'Ingresar · Interadds' };
export default async function Login({ searchParams }) {
  const sp = await searchParams;
  return (
    <>
      {sp.registrado && <p className="success auth" role="status">Cuenta creada. Ya puedes ingresar.</p>}
      {sp.restablecida && <p className="success auth" role="status">Clave actualizada. Ingresa con la nueva.</p>}
      <AuthForm mode="login" next={safeNext(sp.next)} />
    </>
  );
}
