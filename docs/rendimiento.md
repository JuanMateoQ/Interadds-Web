# Medición de rendimiento (RNF-06)

Fecha: 2026-11-17T12:34:39.286Z · Servicios en la base: 14 · Repeticiones por consulta: 60 (tras 5 de calentamiento)

Qué cumple el requisito: **paginación** (el catálogo trae 9 servicios por página y devuelve el total), **índices** en los campos que se buscan y **chat actualizado sin recargar** (Socket.IO). Esta medición cubre el tiempo de consulta.

| Consulta | p50 | p95 | máximo |
|---|---|---|---|
| Catálogo página 1 (9 servicios) | 10.1 ms | 11.4 ms | 12.4 ms |
| Catálogo con búsqueda por título | 8.7 ms | 10.2 ms | 12.7 ms |
| Catálogo filtrado por precio | 8.2 ms | 9.5 ms | 10.6 ms |
| Historial del chat (últimos 50) | 1.8 ms | 2.0 ms | 2.3 ms |

## Índices relevantes

| Tabla | Índice |
|---|---|
| chat_messages | chat_messages_pkey |
| chat_messages | chat_messages_roomId_createdAt_idx |
| contracts_services | contracts_services_pkey |
| contracts_services | contracts_services_providerId_idx |
| contracts_services | contracts_services_status_categoryId_idx |
| contracts_services | contracts_services_status_priceCents_idx |
| contracts_services | contracts_services_title_idx |

## Plan de ejecución del catálogo

```
Limit  (cost=8.18..8.19 rows=1 width=188) (actual rows=9 loops=1)
  ->  Sort  (cost=8.18..8.19 rows=1 width=188) (actual rows=9 loops=1)
        Sort Key: "createdAt" DESC
        Sort Method: quicksort  Memory: 30kB
        ->  Index Scan using "contracts_services_status_priceCents_idx" on contracts_services  (cost=0.15..8.17 rows=1 width=188) (actual rows=10 loops=1)
              Index Cond: ((status = 'PUBLICADO'::"ServiceStatus") AND ("priceCents" >= 5000) AND ("priceCents" <= 40000))
Planning Time: 0.197 ms
Execution Time: 0.068 ms
```

## Plan de ejecución del historial del chat

```
Limit  (cost=9.51..9.52 rows=2 width=168) (actual rows=0 loops=1)
  ->  Sort  (cost=9.51..9.52 rows=2 width=168) (actual rows=0 loops=1)
        Sort Key: "createdAt" DESC
        Sort Method: quicksort  Memory: 25kB
        ->  Bitmap Heap Scan on chat_messages  (cost=4.16..9.50 rows=2 width=168) (actual rows=0 loops=1)
              Recheck Cond: ("roomId" = 'general'::text)
              ->  Bitmap Index Scan on "chat_messages_roomId_createdAt_idx"  (cost=0.00..4.16 rows=2 width=0) (actual rows=0 loops=1)
                    Index Cond: ("roomId" = 'general'::text)
Planning Time: 0.134 ms
Execution Time: 0.048 ms
```

> Con pocas filas PostgreSQL puede preferir un barrido secuencial porque es más barato; los índices pagan al crecer la tabla. Para forzar la comparación: `SET enable_seqscan = off;`.
