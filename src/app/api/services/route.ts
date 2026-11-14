import { open, jsonResponse } from '@/lib/routeKit';
import { listPublished } from '@/modules/contracts/catalog';

// RF-01: catálogo público, paginado, con búsqueda y filtros (los valida listPublished con Zod).
export const GET = open(async ({ request }) => {
  const query = Object.fromEntries(new URL(request.url).searchParams.entries());
  return jsonResponse(await listPublished(query));
});
