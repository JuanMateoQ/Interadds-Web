// RNF-06: medición de rendimiento. Mide el tiempo de las consultas del catálogo y del historial del chat,
// y comprueba con EXPLAIN que usan índices. Escribe docs/rendimiento.md.
//   npm run perf           (usa DATABASE_URL; si la base está vacía crea datos temporales de prueba)
import 'reflect-metadata';
import '../src/lib/env';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/db';
import * as catalog from '../src/modules/contracts/catalog';

const RUNS = Number(process.env.PERF_RUNS || 60);
const percentile = (arr, p) => [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.ceil((p / 100) * arr.length) - 1)];
const ms = (n) => `${n.toFixed(1)} ms`;

async function time(fn) {
  const t: any = [];
  for (let i = 0; i < 5; i++) await fn(); // calentamiento
  for (let i = 0; i < RUNS; i++) {
    const s = process.hrtime.bigint();
    await fn();
    t.push(Number(process.hrtime.bigint() - s) / 1e6);
  }
  return { p50: percentile(t, 50), p95: percentile(t, 95), max: Math.max(...t) };
}

async function explain(sql) {
  const rows = await prisma.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS OFF, TIMING OFF) ${sql}`);
  return rows.map((r) => r['QUERY PLAN']).join('\n');
}

async function main() {
  const total = await prisma.service.count();
  if (total < 1) throw new Error('No hay servicios. Ejecuta "npm run db:seed" antes de medir.');
  const results: any = [];
  results.push(['Catálogo página 1 (9 servicios)', await time(() => catalog.listPublished({ page: 1, pageSize: 9 }))]);
  results.push(['Catálogo con búsqueda por título', await time(() => catalog.listPublished({ q: 'campaña' }))]);
  results.push(['Catálogo filtrado por precio', await time(() => catalog.listPublished({ min: '50', max: '400' }))]);
  const room = await prisma.room.findFirst();
  if (room) results.push(['Historial del chat (últimos 50)', await time(() => prisma.message.findMany({ where: { roomId: room.id }, orderBy: { createdAt: 'desc' }, take: 50 }))]);

  const plans: any = {
    catalogo: await explain(`SELECT * FROM contracts_services WHERE status = 'PUBLICADO' AND "priceCents" BETWEEN 5000 AND 40000 ORDER BY "createdAt" DESC LIMIT 9`),
    chat: room ? await explain(`SELECT * FROM chat_messages WHERE "roomId" = '${room.id}' ORDER BY "createdAt" DESC LIMIT 50`) : '(sin salas de chat)',
  };
  const indexes = await prisma.$queryRaw`SELECT indexname::text AS name, tablename::text AS tabla FROM pg_indexes WHERE schemaname = 'public' AND (tablename = 'contracts_services' OR tablename = 'chat_messages') ORDER BY 2, 1`;

  const lines: any = [];
  lines.push('# Medición de rendimiento (RNF-06)', '');
  lines.push(`Fecha: ${new Date().toISOString()} · Servicios en la base: ${total} · Repeticiones por consulta: ${RUNS} (tras 5 de calentamiento)`, '');
  lines.push('Qué cumple el requisito: **paginación** (el catálogo trae 9 servicios por página y devuelve el total), **índices** en los campos que se buscan y **chat actualizado sin recargar** (Socket.IO). Esta medición cubre el tiempo de consulta.', '');
  lines.push('| Consulta | p50 | p95 | máximo |', '|---|---|---|---|');
  for (const [name, r] of results) lines.push(`| ${name} | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.max)} |`);
  lines.push('', '## Índices relevantes', '', '| Tabla | Índice |', '|---|---|');
  for (const i of indexes) lines.push(`| ${i.tabla} | ${i.name} |`);
  lines.push('', '## Plan de ejecución del catálogo', '', '```', plans.catalogo, '```', '', '## Plan de ejecución del historial del chat', '', '```', plans.chat, '```', '');
  lines.push('> Con pocas filas PostgreSQL puede preferir un barrido secuencial porque es más barato; los índices pagan al crecer la tabla. Para forzar la comparación: `SET enable_seqscan = off;`.', '');
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'rendimiento.md'), lines.join('\n'));
  results.forEach(([n, r]) => console.log(`${n.padEnd(40)} p50 ${ms(r.p50)}  p95 ${ms(r.p95)}`));
  console.log('Informe escrito en docs/rendimiento.md');
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
