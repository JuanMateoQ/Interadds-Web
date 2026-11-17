import { requirePage } from '@/lib/serverAuth';
import ContractWorkspace from '@/components/ContractWorkspace';

export const metadata = { title: 'Contrato · Interadds' };
export default async function ContratoPage({ params }) {
  const { id } = await params;
  const user = await requirePage({ roles: ['CLIENTE', 'PROVEEDOR'], next: `/contratos/${id}` });
  return <ContractWorkspace id={id} user={{ id: user.id, name: user.name, role: user.role }} />;
}
