import { authed, jsonResponse } from '@/lib/routeKit';
import { getProfile, updateProfile } from '@/modules/auth/service';

// RF-09: ver y editar el perfil propio.
export const GET = authed(async ({ user }) => jsonResponse({ profile: await getProfile(user.id) }));
export const PUT = authed(async ({ request, user }) => {
  const body = await request.json().catch(() => ({}));
  return jsonResponse({ profile: await updateProfile(user.id, body) });
});
