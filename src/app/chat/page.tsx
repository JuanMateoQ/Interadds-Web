import { requirePage } from '@/lib/serverAuth';
import { listContracts } from '@/modules/contracts/service';
import { isAtLeast } from '@/modules/contracts/stateMachine';
import ChatTabs from '@/components/ChatTabs';

export const metadata = { title: 'Chat · Interadds' };

export default async function Chat({ searchParams }) {
  const user = await requirePage({ next: '/chat' });
  const sp = await searchParams;
  const contracts = user.role === 'ADMIN_SISTEMA' ? [] : (await listContracts(user)).filter((c) => isAtLeast(c.status, 'ANTICIPO_PAGADO'));
  const rooms = contracts.map((c) => ({ id: c.id, title: c.serviceTitle, with: c.counterpartName }));
  return (<><h1>Chat</h1><ChatTabs user={{ id: user.id, name: user.name }} rooms={rooms} initial={String(sp.contrato || 'general')} /></>);
}
