import { authed, jsonResponse } from '@/lib/routeKit';
import { listForUser } from '@/modules/chat/notifications';

export const GET = authed(async ({ user }) => jsonResponse(await listForUser(user.id)));
