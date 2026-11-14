import { open, jsonResponse } from '@/lib/routeKit';
import { listCategories } from '@/modules/contracts/catalog';

export const GET = open(async () => jsonResponse({ categories: await listCategories() }));
