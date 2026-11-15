import AuthForm from '@/components/AuthForm';
export const metadata = { title: 'Nueva clave · Interadds' };
export default async function Restablecer({ searchParams }) {
  const sp = await searchParams;
  return <AuthForm mode="reset" token={String(sp.token || '')} />;
}
