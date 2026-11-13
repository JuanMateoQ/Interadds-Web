import { authed, jsonResponse } from '@/lib/routeKit';
import { markRead } from '@/modules/chat/notifications';

export const POST = authed(async ({ request, user }) => {
  const body = await request.json().catch(() => ({}));
  return jsonResponse(await markRead(user.id, body.ids));
});
