import { open, jsonResponse } from '@/lib/routeKit';
import { getPublished } from '@/modules/contracts/catalog';

// RF-02: detalle público de un servicio publicado.
export const GET = open(async ({ params }) => jsonResponse({ service: await getPublished(params.id) }));
