# Trazabilidad del equipo — Interadds Web B1 (monolito, presentación 18 nov)

Este documento sirve para tres cosas: **(1)** saber qué le toca defender a cada persona, **(2)** encontrar en segundos el archivo exacto de cada requisito (RF, RNF, RS) y **(3)** ensayar la defensa individual y simular el flujo de ramas y *pull requests* (RNF-09).

> **Cómo leerlo.** Cada tarjeta trae: vertical y puntos de Web B1 → requisitos que cubre → entregables con sus archivos → qué explicar en la defensa (funciones y componentes) → guía de Git/PR. Los puntos entre paréntesis son los del reparto del equipo (1 punto = medio día).

## 0. Alcance y salvedades (léelo antes de defender)

| Tema | Estado |
|---|---|
| Alcance B1 | 31 RF (RF-01..29, RF-36, RF-37), 13 RNF (RNF-01..10, 21, 22, 24) y los componentes del Criterio Común marcados «Web B1» |
| **Conteo de componentes CC** | El enunciado habla de **25**, pero la tabla de requisitos marca **26** como «Web B1»: RS-01, 02, 03, 04, 07, 08, 09, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 26, 27, 37, 38, 41, 42, 44, 45 y 46. Este documento mapea los 26; conviene confirmar con el docente cuál sobra. |
| RS-14 y el cifrado en reposo | RS-14 menciona «AES-256-GCM del contrato en reposo», pero ese cifrado es el RS-21, que es **solo de Desarrollo Seguro (S5)**. No se implementó; RS-14 queda cubierto con SHA-256 del contrato, firma/verificación ECDSA P-256 y hash de claves con bcrypt. Las entregas se guardan sin cifrar en `UPLOAD_DIR`. |
| Hash de claves | Se usa **bcryptjs** (algoritmo bcrypt en JavaScript puro) para evitar compilar módulos nativos en Windows. Cumple RNF-03 / RS-12. |
| Fuera de alcance (no existe en el código) | Microservicios, API Gateway, JWT asimétrico, Saga, Circuit Breaker, Docker, Prometheus/Grafana, GitHub Actions, webhooks de PayPal, bloqueo por intentos (RS-05), política de clave RS-06, rotación de claves, auditoría (RS-31..35), cierre por inactividad (RS-36), panel de administración, moderación, reseñas, reembolsos y disputas |
| Pagos | Solo **PayPal Sandbox** (Orders v2). La pasarela simulada (`PAYMENT_GATEWAY=fake`) existe para desarrollo y pruebas, y **se niega a arrancar en producción**. El pago al Proveedor queda como «pendiente de liquidación». |
| Contrato | Solo avanza en este orden: Generado → Firmado por una parte → Vigente → Anticipo pagado → Contenido entregado → Contenido aprobado → Completado |

## 1. Mapa de módulos (quién es dueño de qué carpeta)

| Dueño | Vertical | Carpetas |
|---|---|---|
| Sebas Ramos | Identidad y acceso | `src/modules/auth/`, `src/lib/validation/auth.ts`, `src/lib/security/`, `src/middleware.ts`, `src/app/api/auth/`, `src/app/api/profile/`, `tests/auth.test.ts`, `tests/validation.test.ts`, `scripts/run-tests.ts` |
| Danna Morales | Catálogo y contrato | `src/modules/contracts/`, `src/modules/contractView.ts`, `src/lib/validation/catalog.ts`, `src/app/api/{services,categories,provider,contracts}/` (rutas base), `tests/catalog.test.ts`, `tests/contracts.test.ts` |
| Domenica Cardenas | Firma digital, CA y evidencias | `src/modules/signing/`, `src/app/api/signing/`, `src/app/api/contracts/[id]/{sign,evidences}/`, `scripts/ca-init.ts`, `src/dev/browserSim.ts`, `docs/esquema-base-datos.md`, `tests/signing.test.ts` |
| Mateo Quisilema | Pagos y plataforma | `src/server.ts`, `prisma/`, `.env.example`, `README.md`, `src/modules/payments/`, `src/app/api/contracts/[id]/{payments,approve}/`, `src/lib/{env,db,money,http}.js`, `scripts/measure-performance.ts`, `docs/rendimiento.md`, `tests/payments.test.ts`, `tests/helpers.ts` |
| Salma Morales | Chat y entrega | `src/modules/chat/`, `src/app/api/{notifications,contracts/[id]/deliveries}/`, `tests/chat.test.ts` |
| Sebas Sarasti | Frontend y presentación | `src/app/**/page.tsx` y `layout.tsx`, `src/components/`, `src/lib/client/`, `src/app/globals.css`, `docs/arquitectura.md`, `docs/guion-demo.md`, `tests/e2e.test.ts` (guion del recorrido) |

Regla de fronteras: **ningún módulo consulta tablas de otro**; se llaman por funciones públicas (por eso el paso a servicios del Bimestre 2 es mover carpetas).

---

## 2. Tarjetas por persona

### 2.1 Sebas Ramos — Identidad y acceso · Web B1: **19 pts**

**Requisitos:** RF-03 (regreso al servicio, con Sarasti), RF-04, RF-05, RF-06, RF-07, RF-08 (servidor, con Sarasti), RF-09 · RNF-01 (esquemas), RNF-02 (sesiones/CSRF), RNF-03 (bcrypt), RNF-07 (ejecutor) · RS-01, 02, 03, 04, 07 (tokens de recuperación), 08, 09, 12, 15 (aleatorios seguros), 37, 38, 41, 42 (caducidad del token).

| Entregable (pts) | Archivos exactos | Requisito |
|---|---|---|
| Registro con validación en cliente y servidor, elección de rol, regreso al servicio (3) | `src/lib/validation/auth.ts` (`registerSchema`, `validateForm`), `src/modules/auth/service.ts` (`register`), `src/app/api/auth/register/route.ts`, `src/lib/http.ts` (`safeNext`) | RF-03, 04, RNF-01, RS-41 |
| Login con hash y sal, sesión segura, logout, rutas protegidas y middleware de roles (4) | `src/lib/security/passwords.ts`, `src/modules/auth/service.ts` (`login`, `logout`), `src/modules/auth/session.ts`, `src/modules/auth/guard.ts` (`requireAuth`), `src/middleware.ts`, `src/lib/serverAuth.ts` (`requirePage`) | RF-05, 06, RNF-02, 03, RS-02, 04, 09, 12, 37, 38 |
| Recuperación de clave con token único y caducidad (3) | `service.ts` (`requestPasswordReset`, `resetPassword`), `src/lib/mailer.ts`, `src/app/api/auth/{forgot,reset}/route.ts` | RF-07, RS-03, 07, 42 |
| Perfil propio (1) | `service.ts` (`getProfile`, `updateProfile`), `src/app/api/profile/route.ts` | RF-09 |
| Roles y atributos por defecto con usuarios de prueba por rol (2) | `prisma/schema.prisma` (`Role`, `UserStatus`), `src/app/api/auth/me/route.ts`, `prisma/seed.ts` | RS-08, 41 |
| Pruebas de autenticación y validación (3) | `tests/auth.test.ts` (10 pruebas), `tests/validation.test.ts` (13) | RNF-07 |
| Ejecutor de pruebas en un comando y regla de revisión de PR (2) | `scripts/run-tests.ts` (`npm test`), sección «Regla de revisión» de este documento | RNF-07, 09 |
| Datos ficticios para la demo (1) | `prisma/seed.ts` | — |

**Qué explicar en la defensa**
- *`login`*: busca el usuario, **siempre** compara contra un hash (`dummyHash` si el correo no existe) para que el tiempo no delate cuentas, y responde con el mismo error genérico `INVALID_CREDENTIALS` (RS-04). Crea una sesión: token aleatorio en cookie `HttpOnly` + `SameSite=Strict`; en la base solo se guarda su **SHA-256** (`auth_sessions.tokenHash`), así que una fuga de la tabla no permite secuestrar sesiones.
- *`requireAuth`* (`guard.ts`): 1) cookie válida y no revocada, 2) en escrituras exige `X-CSRF-Token` igual al de la sesión y `Origin` permitido, 3) valida el rol. Es el único camino para las rutas privadas (`routeKit.authed`).
- *Recuperación*: `resetPassword` usa un `updateMany ... where usedAt is null and expiresAt > now` dentro de una transacción: así el token se consume **de forma atómica** (dos peticiones simultáneas no pueden usarlo dos veces) y revoca todas las sesiones del usuario.
- *Esquemas zod compartidos*: el mismo `registerSchema` se importa en `AuthForm.tsx` (navegador) y en `service.ts` (servidor) → RNF-01 sin duplicar reglas.
- *Middleware vs. servidor*: `src/middleware.ts` solo mira que exista la cookie (rápido, redirige); la sesión **real** y el rol se validan en `requirePage` y en la API. Preguntable: «¿por qué no confías en el middleware?» → porque una cookie falsa pasa el middleware pero no `validateSessionToken`.
- Pruebas que demuestran todo: «token de un solo uso», «mismo mensaje exista o no el correo», «logout revoca la sesión», «clave con bcrypt».

**Git / PR (simulación):**
```bash
git checkout -b feat/auth-registro-login
git add src/lib/validation/auth.ts src/modules/auth src/app/api/auth src/middleware.ts src/lib/serverAuth.ts
git commit -m "feat(auth): registro, login con bcrypt, sesión HttpOnly y middleware de roles"
git checkout -b feat/auth-recuperacion-perfil
git add src/app/api/profile tests/auth.test.ts tests/validation.test.ts scripts/run-tests.ts
git commit -m "feat(auth): recuperación de clave de un solo uso, perfil y ejecutor de pruebas"
git push -u origin feat/auth-recuperacion-perfil   # abrir PR → revisor: Mateo
```
PR: título `feat(auth): identidad y acceso (RF-04..09, RS-01..04, 12, 37, 38, 41, 42)`; descripción con checklist de requisitos y el resultado de `npm test`.

---

### 2.2 Danna Morales — Catálogo y contrato · Web B1: **19 pts**

**Requisitos:** RF-01, 02, 10, 11, 12, 13, 14, 15, 22 (contratos), 37 (servidor) · RNF-01 (esquema de servicio), RNF-06 (paginación e índices), RNF-21 (hash), RNF-22 (estados) · RS-14 (SHA-256 del contrato), 18, 19, 20, 44 y 45 (con Salma).

| Entregable (pts) | Archivos exactos | Requisito |
|---|---|---|
| Modelos Prisma de servicio, categoría y contrato con estados, plantilla e índices (4) | `prisma/schema.prisma` (`Service`, `Category`, `ContractTemplate`, `Contract`, `ContractStateChange`), `prisma/migrations/20261101000000_init/migration.sql` (índices y trigger `contracts_guard_update`) | RNF-21, 22, RNF-06 |
| CRUD con confirmación y detalle por id (4) | `src/modules/contracts/catalog.ts` (`createService`, `updateService`, `deleteService`, `getPublished`), `src/lib/validation/catalog.ts`, `src/app/api/provider/services/**`, `src/app/api/services/[id]/route.ts` | RF-02, 10, 11, 12 |
| Listado paginado con búsqueda y filtros (3) | `catalog.ts` (`listPublished`), `src/app/api/services/route.ts`, `src/app/api/categories/route.ts` | RF-01, RNF-06 |
| Solicitar la contratación y generar el contrato con su hash (3) | `src/modules/contracts/service.ts` (`requestContract`), `template.ts` (`renderContract`), `src/modules/signing/hash.ts` (`hashContractText`), `src/app/api/contracts/route.ts` | RF-13, 14, RNF-21, RS-14 |
| Ruta segura del contrato: solo las dos partes, estados, historial y regla de compartir solo por la plataforma (3) | `policy.ts` (`ROLE_POLICY`, `assertParty`), `stateMachine.ts`, `integrity.ts`, `service.ts` (`getContractDetail`, `viewContract`), `src/modules/chat/flowPolicy.ts` (con Salma), `src/modules/contractView.ts`, `src/app/api/contracts/[id]/{route.ts,view/route.ts}` | RF-15, 22, 37, RS-18, 19, 20, 44, 45 |
| Pruebas del CRUD y del contrato (2) | `tests/catalog.test.ts` (5), `tests/contracts.test.ts` (9) | RNF-07 |

**Qué explicar en la defensa**
- *`requestContract`*: valida que el servicio esté **publicado** y no sea del propio cliente; si ya hay un contrato abierto del mismo servicio lo devuelve (evita duplicados por doble clic); toma los datos de la plantilla activa, calcula `splitFiftyFifty` (el centavo sobrante va al saldo), renderiza el texto y calcula **SHA-256**; guarda contrato + primera fila de historial en una transacción.
- *Inmutabilidad en dos capas*: la aplicación no tiene ninguna función que edite el texto, **y** el trigger `contracts_guard_update` rechaza `UPDATE` de texto, hash, montos y partes, y cualquier cambio de estado que no sea el siguiente. Prueba: «la base rechaza cambiar texto, hash o montos» y «saltos o retrocesos de estado».
- *RS-20*: `assertContractIntegrity` vuelve a calcular el hash antes de mostrar, firmar o pagar; si alguien manipula la base directamente, lanza `INTEGRITY_VIOLATION` (prueba que desactiva el trigger solo para simular el ataque).
- *RS-19*: `assertParty` devuelve **404** (no 403) a quien no es parte, para no revelar que el contrato existe. El Administrador del sistema tampoco lo abre.
- *RF-12*: `deleteService` cuenta contratos no completados; si hay, **pausa** en vez de borrar.
- *RNF-06*: índices `(status, categoryId)`, `(status, priceCents)` y `title`; paginación con `skip/take` y total.
- *Regla de flujo (RS-44/45)*: `evaluateFlow` permite solo `channel='platform'`, lector parte del contrato y sesión válida; niega enlaces públicos, correo con texto/adjunto y reenvío.

**Git / PR:**
```bash
git checkout -b feat/catalogo-contrato
git add prisma/schema.prisma prisma/migrations src/lib/validation/catalog.ts src/modules/contracts src/app/api/services src/app/api/categories src/app/api/provider
git commit -m "feat(contratos): catálogo, CRUD de servicios y plantilla de contrato con hash"
git checkout -b feat/contrato-ruta-segura
git add src/modules/contractView.ts src/app/api/contracts tests/catalog.test.ts tests/contracts.test.ts
git commit -m "feat(contratos): estados, historial, acceso solo para las dos partes y trigger de inmutabilidad"
git push -u origin feat/contrato-ruta-segura   # PR → revisor: Domenica
```

---

### 2.3 Domenica Cardenas — Firma digital, CA y evidencias · Web B1: **19 pts**

**Requisitos:** RF-16, 17, 18, 19 · RNF-08 (esquema de BD documentado) · RS-10, 11, 14 (ECDSA), 15, 16, 17, 26 (re-autenticar al firmar), 27, 42 (certificados caducan) y 46.

| Entregable (pts) | Archivos exactos | Requisito |
|---|---|---|
| CA interna de dos niveles, política de certificación, emisión desde CSR y almacenamiento (5) | `src/modules/signing/ca.ts` (`initCA`, `loadCA`, `signWithCA`), `scripts/ca-init.ts` (`npm run ca:init`), `src/modules/signing/certificates.ts` (`createChallenge`, `issueCertificate`, `verifyCertificateChain`), `src/app/api/signing/{challenge,certificates}/route.ts` | RF-16, RS-10, 11, 46, 42 |
| Par de claves en el navegador y solicitud de certificado (3) | `src/lib/client/webcrypto.ts` (`ensureCertificate`, `signPayload`), `src/dev/browserSim.ts` (equivalente para pruebas) | RF-16, RS-10 |
| Firma con re-autenticación, nonce, validación, sello de tiempo y evidencias de origen y recepción (5) | `signing.ts` (`prepare`, `verifySubmission`, `buildSigningPayload`), `contractSigning.ts` (`prepareContractSignature`, `signContract`), `evidence.ts` (`recordOrigin`, `recordReceipt`), `src/app/api/contracts/[id]/sign/**` | RF-17, 18, RS-15, 16, 17, 26 |
| Verificación de evidencias (2) | `verify.ts` (`verifyEvidence`, `verifyContract`, `bothContractSignaturesValid`), `src/app/api/contracts/[id]/evidences/route.ts` | RF-19, RS-27 |
| Pruebas de firma (2) | `tests/signing.test.ts` (10) | RNF-07 |
| Esquema de base de datos documentado (2) | `docs/esquema-base-datos.md` | RNF-08 |

**Qué explicar en la defensa**
- *Cadena de confianza*: la **raíz** (clave guardada en `ca-offline/`, fuera del servidor) firma solo a la **emisora**; la emisora firma los certificados de usuario y los sellos de tiempo. `verifyCertificateChain` comprueba leaf→emisora→raíz y la vigencia con el verificador X.509 nativo de Node.
- *Por qué el servidor no puede firmar por el usuario (no repudio)*: la clave privada ECDSA P-256 se genera en el navegador con `extractable=false` y vive en IndexedDB. Al servidor solo llegan la clave pública y una **prueba de posesión** (firma sobre `interadds-cert-v1\nuserId\nnonce\nclavePública`).
- *Flujo de firma*: 1) `prepareContractSignature` exige la clave (RS-26) y entrega `nonce` (un solo uso, TTL 5 min) + `payload` = `interadds-sign-v1\nFIRMA_CONTRATO\ncontractId\nhash\nnonce`; 2) el navegador firma el payload; 3) `verifySubmission` marca el nonce consumido con un `updateMany` condicional (anti-repetición), verifica la cadena y la firma ECDSA; 4) `recordOrigin` guarda la evidencia con **sello de tiempo firmado por la CA** y `recordHash`; 5) `recordReceipt` deja constancia de recepción a la contraparte.
- *RF-18*: la primera firma pasa a «Firmado por una parte»; la segunda, tras `bothContractSignaturesValid`, a «Vigente». Todo dentro de una transacción.
- *Unicidad*: `(contractId, event, kind, ref)` único → imposible firmar dos veces.
- *Verificación*: cinco chequeos por evidencia (`recordHash`, `timestamp`, `certificateChain`, `signature`, `contractHash`/`contentHash`). Prueba: manipular el payload invalida `recordHash`.
- Problema real que resolviste (menciónalo): la verificación con la librería X.509 en el bundle de Next fallaba por mezclar proveedores WebCrypto; se cambió por `crypto.X509Certificate` de Node.

**Git / PR:**
```bash
git checkout -b feat/ca-dos-niveles
git add src/modules/signing/ca.ts src/modules/signing/certificates.ts scripts/ca-init.ts src/app/api/signing src/lib/client/webcrypto.ts
git commit -m "feat(firma): CA de dos niveles, emisión de certificados con prueba de posesión"
git checkout -b feat/firma-evidencias
git add src/modules/signing src/app/api/contracts/[id]/sign src/app/api/contracts/[id]/evidences src/dev tests/signing.test.ts docs/esquema-base-datos.md
git commit -m "feat(firma): firma con nonce y re-autenticación, sello de tiempo y verificación de evidencias"
git push -u origin feat/firma-evidencias   # PR → revisor: Mateo
```

---

### 2.4 Mateo Quisilema — Pagos y plataforma · Web B1: **19 pts**

**Requisitos:** RF-20, 21, 22 (pagos), 27 (desbloqueo del saldo), 28 · RNF-02 (`.env.example`), RNF-06 (medición), RNF-08, RNF-09, RNF-10, RNF-22 (idempotencia), RNF-24 (PayPal Sandbox, tiempos de espera) · RS-07 (referencias generadas), 11 (secretos en entorno), 17 (recibo), 26 (re-autenticar al pagar).

| Entregable (pts) | Archivos exactos | Requisito |
|---|---|---|
| Repositorio, ramas y PR, Next.js con servidor Node propio, Prisma y migración inicial, `.env.example` (5) | `src/server.ts`, `package.json`, `next.config.js`, `prisma/schema.prisma`, `prisma/migrations/**`, `.env.example`, `.gitignore`, `src/lib/{env,db}.js` | RNF-02, 09, 10, RS-11 |
| README, «Uso de IA» y etiqueta `v1.0-b1` (3) | `README.md` | RNF-08, 09 |
| Pagos con PayPal: modelo, crear y capturar órdenes desde el servidor, 50 % + 50 % con idempotencia, comprobación de monto y moneda, recibos y pruebas (8) | `src/modules/payments/{paypal,gateway,fakeGateway,stateMachine,service}.js`, `src/lib/money.ts`, `src/app/api/contracts/[id]/payments/**`, `tests/payments.test.ts` (14), `tests/helpers.ts` | RF-20, 21, 22, 28, RNF-22, 24, RS-07, 17, 26 |
| Aprobación del contenido y desbloqueo del saldo (2) | `src/modules/payments/approval.ts`, `src/app/api/contracts/[id]/approve/**` | RF-27 |
| Medición de rendimiento (1) | `scripts/measure-performance.ts` (`npm run perf`), `docs/rendimiento.md` | RNF-06 |

**Qué explicar en la defensa**
- *`createOrder`*: 1) `policy.assertCan('payment:create')`, solo el Cliente de **ese** contrato; 2) `assertContractIntegrity`; 3) `reauthenticate` (RS-26); 4) el **monto sale del contrato** (`anticipoCents`/`saldoCents`), el navegador nunca lo envía; 5) estado requerido (`VIGENTE` para anticipo, `CONTENIDO_APROBADO` para saldo); 6) referencia propia `INT-{contractId}-{tramo}` y `PayPal-Request-Id = referencia:intento`; 7) fila `CREADA` con `nonce`.
- *`captureOrder`*: exige el nonce, llama a la pasarela, y comprueba **monto, moneda y referencia** contra el contrato (si no coinciden → `FALLIDA` + `AMOUNT_MISMATCH`). En una transacción: `updateMany` condicional a `CREADA/PENDIENTE` (ganador único), avanza el contrato, guarda evidencias de origen y recepción y, si es el anticipo, abre la sala de chat. Repetir la captura devuelve el recibo existente sin cobrar (**RNF-22**).
- *RNF-24*: timeout de 10 s; si PayPal no responde el pago queda `PENDIENTE` (no se pierde ni se duplica) y el reintento reutiliza la **misma fila** (único `(contractId, tranche)`).
- *Liquidación*: el recibo dice `PENDIENTE_DE_LIQUIDACION`: en B1 no se transfiere al Proveedor.
- *Seguridad de la pasarela simulada*: `getGateway` lanza error si `PAYMENT_GATEWAY=fake` con `NODE_ENV=production`.
- *`src/server.ts`*: `next({ httpServer })` y `attachSocketServer(httpServer)` en el mismo puerto → monolito (RNF-10).
- *Medición*: `npm run perf` → p50/p95 de catálogo y chat y planes `EXPLAIN` (`docs/rendimiento.md`).

**Git / PR:**
```bash
git checkout -b chore/plataforma-base
git add src/server.ts package.json next.config.js prisma .env.example .gitignore src/lib/env.ts src/lib/db.ts
git commit -m "chore: servidor Node con Next.js y Socket.IO, Prisma, migración inicial y .env.example"
git checkout -b feat/pagos-paypal
git add src/modules/payments src/lib/money.ts src/app/api/contracts/[id]/payments src/app/api/contracts/[id]/approve tests/payments.test.ts tests/helpers.ts
git commit -m "feat(pagos): órdenes PayPal Sandbox, anticipo y saldo 50 % idempotentes, recibos"
git checkout -b docs/readme-v1
git add README.md scripts/measure-performance.ts docs/rendimiento.md
git commit -m "docs: README con Uso de IA y medición de rendimiento"
git tag -a v1.0-b1 -m "Entrega Web B1"     # solo después de que los PR estén fusionados en main
git push origin main v1.0-b1
```

---

### 2.5 Salma Morales — Chat y entrega · Web B1: **19 pts**

**Requisitos:** RF-23, 24, 25, 26, 29 · RNF-04 (WebSocket seguro), RNF-06 (chat sin recargar) · RS-16 y 17 (evidencias de entrega), 19 (sala solo de las dos partes), 44 y 45 (flujo, con Danna).

| Entregable (pts) | Archivos exactos | Requisito |
|---|---|---|
| Servidor Socket.IO dentro del proyecto con handshake autenticado (4) | `src/modules/chat/socket.js` (`attachSocketServer`, middleware `io.use`), `src/server.ts` | RF-23, RNF-04 |
| Sala por contrato habilitada solo con el anticipo, historial y usuarios conectados (4) | `rooms.ts` (`checkContractRoomAccess`, `openContractRoom`, `history`), `socket.js` (`presence`) | RF-23, 24, RS-19 |
| Sala general (1) | `rooms.ts` (`ensureGeneralRoom`) | RF-25 |
| Validación y saneamiento de mensajes, prueba del chat y demo de seguridad del WebSocket (3) | `sanitize.ts`, `tests/chat.test.ts` (10) | RNF-04, RNF-01 |
| Subir contenido con tipo y tamaño validados (3) | `deliveries.ts` (`validateFile`, `saveDelivery`, `openDelivery`), `src/app/api/contracts/[id]/deliveries/**` | RF-26, RS-16, 17 |
| Notificación en tiempo real de cada hito (3) | `notifications.ts` (`notify`, `emitToUser`), `src/app/api/notifications/**` | RF-29 |
| Política de flujo en la sala, la entrega y los avisos (1) | `flowPolicy.ts` (`composePendingContractEmail`, `leaksContractText`) | RS-44, 45 |

**Qué explicar en la defensa**
- *Handshake autenticado*: `io.use` lee la cookie `HttpOnly`, la valida con `validateSessionToken` y rechaza con `unauthorized`; además `allowRequest` revisa `Origin`. Demo: `tests/chat.test.ts` → «sin sesión el handshake se rechaza».
- *Sala del contrato*: `checkContractRoomAccess` exige ser parte **y** estado ≥ `ANTICIPO_PAGADO`; se vuelve a comprobar **en cada mensaje** y la sesión también (si se cerró sesión, el servidor corta el socket).
- *Saneamiento* (`sanitizeMessage`): normaliza, quita caracteres de control y marcas bidi, elimina etiquetas HTML de forma iterativa (resiste `<scr<script>ipt>`) y limita a 1000 caracteres; el cliente además muestra siempre **texto** (React escapa).
- *Límite de frecuencia*: 10 mensajes por 10 s por conexión (`RATE_LIMIT`).
- *Entrega*: `validateFile` revisa tipo permitido, **extensión coherente, firma real del archivo (magic bytes)** y tamaño; calcula SHA-256, versiona (v1, v2…), guarda en `UPLOAD_DIR` con nombre aleatorio y registra evidencia de origen; la primera apertura del Cliente genera su constancia de recepción.
- *Notificaciones*: se guardan en `chat_notifications` y se emiten a `user:{id}`; el texto **nunca** incluye el contrato (RS-44).

**Git / PR:**
```bash
git checkout -b feat/chat-socketio
git add src/modules/chat/socket.js src/modules/chat/rooms.ts src/modules/chat/sanitize.ts tests/chat.test.ts
git commit -m "feat(chat): Socket.IO con handshake autenticado, sala por contrato y sala general"
git checkout -b feat/entrega-notificaciones
git add src/modules/chat/deliveries.ts src/modules/chat/notifications.ts src/modules/chat/flowPolicy.ts src/app/api/notifications src/app/api/contracts/[id]/deliveries
git commit -m "feat(chat): entrega de contenido validada, notificaciones en tiempo real y política de flujo"
git push -u origin feat/entrega-notificaciones   # PR → revisor: Danna
```

---

### 2.6 Sebas Sarasti — Frontend y presentación · Web B1: **25 pts**

**Requisitos:** RF-03, RF-08, RF-37 (visor), y la interfaz de todos los RF · RNF-01 (validación en cliente), RNF-05 (navegabilidad), RNF-10 (diagrama).

| Entregable (pts) | Archivos exactos | Requisito |
|---|---|---|
| Layout, menú por rol y pantalla principal (4) | `src/app/layout.tsx`, `src/components/NavBar.tsx`, `src/app/inicio/page.tsx`, `src/app/globals.css`, `src/app/proveedor/layout.tsx` | RF-08, RNF-05, RS-38 |
| Componentes de formulario y validación en cliente (4) | `src/components/{Field,AuthForm,ServiceForm}.js`, `src/app/{login,registro,recuperar,perfil}/**`, `src/app/proveedor/servicios/**` | RNF-01, RF-04, 07, 09, 10..12 |
| Pantallas de contrato, firma y pago con los botones de PayPal (5) | `src/components/{ContractWorkspace,SignPanel,PaypalButton,EvidencePanel}.js`, `src/app/contratos/**`, `src/lib/client/{api,webcrypto}.js` | RF-14..22, 27, 28 |
| Visor protegido con marca de agua (2) | `src/app/contratos/[id]/visor/page.tsx` (+ `.viewer`/`.watermark` en `globals.css`) | RF-37, RS-45 |
| Interfaz del chat, la entrega y las notificaciones (3) | `src/components/{ChatRoom,ChatTabs,DeliveryPanel}.js`, campana en `NavBar.tsx`, `src/app/chat/page.tsx` | RF-23..26, 29 |
| Navegación coherente y mensajes de error claros (2) | `src/app/{error,not-found}.js`, estados `role="alert"` en los formularios | RNF-05 |
| Diagrama de arquitectura del monolito (2) | `docs/arquitectura.md` | RNF-10 |
| Presentación de 15 minutos, guión y ensayo (3) | `docs/guion-demo.md` | — |

**Qué explicar en la defensa**
- *Cliente HTTP* (`lib/client/api.ts`): envía la cookie, pide el token CSRF a `/api/auth/me` una vez y lo adjunta como `X-CSRF-Token` en cada escritura; los errores del servidor se vuelven `ApiClientError` con `details` por campo.
- *`webcrypto.ts`*: `generateKey(ECDSA P-256, extractable=false)`; guarda el `CryptoKey` en IndexedDB (clonado estructurado, nunca exportable); `ensureCertificate` pide reto → firma la prueba de posesión → recibe el certificado.
- *`SignPanel`*: reutilizable para firmar y aprobar (`kind`): clave → `prepare` → `signPayload` → envío. *`PaypalButton`*: pide la clave, crea la orden en el servidor (sin enviar monto) y, con PayPal real, monta los botones del SDK con `createOrder: () => order.orderId` y `onApprove → capture`; con la pasarela simulada muestra un botón que aprueba y captura.
- *Visor*: el texto llega por **POST** autenticado; marca de agua con nombre, correo y hora del lector repetida en cuadrícula; disuasivos: bloqueo de copiar/cortar/menú contextual/atajos, `user-select:none`, desenfoque al perder el foco y CSS de impresión. Aclara en la defensa que son **medidas de disuasión**, no una garantía (una captura de pantalla sigue siendo posible; por eso la marca de agua identifica al lector).
- *`ChatRoom`*: Socket.IO (`room:join`, `message:send`, `message:new`, `presence:update`); muestra texto escapado; indica estado de conexión.
- *Recorrido verificado en navegador real*: registro → catálogo → contratar → firmar (ambos) → anticipo → entrega → aprobar → saldo → verificar evidencia → chat → visor.

**Git / PR:**
```bash
git checkout -b feat/ui-layout-formularios
git add src/app/layout.tsx src/app/globals.css src/components/NavBar.tsx src/components/Field.tsx src/components/AuthForm.tsx src/components/ServiceForm.tsx src/app/login src/app/registro src/app/recuperar src/app/perfil src/app/inicio src/app/proveedor src/app/catalogo src/app/servicios src/lib/client/api.ts
git commit -m "feat(ui): layout, menú por rol, formularios con validación compartida y catálogo"
git checkout -b feat/ui-contrato-firma-pago-chat
git add src/components src/app/contratos src/app/chat src/lib/client/webcrypto.ts docs/arquitectura.md docs/guion-demo.md
git commit -m "feat(ui): contrato, firma, pago con PayPal, visor protegido, chat y notificaciones"
git push -u origin feat/ui-contrato-firma-pago-chat   # PR → revisor: Sebas Ramos
```

---

## 3. Matriz de requisitos → archivo principal

### RF (31)
| RF | Dueño | Archivo principal |
|---|---|---|
| 01, 02 | Danna | `src/modules/contracts/catalog.ts` (`listPublished`, `getPublished`) |
| 03 | Ramos + Sarasti | `src/app/servicios/[id]/page.tsx`, `src/lib/http.ts` (`safeNext`) |
| 04, 05, 06 | Ramos | `src/modules/auth/service.ts` |
| 07 | Ramos | `src/modules/auth/service.ts` (`requestPasswordReset`, `resetPassword`) |
| 08 | Sarasti + Ramos | `src/components/NavBar.tsx`, `src/app/inicio/page.tsx`, `src/middleware.ts` |
| 09 | Ramos | `src/modules/auth/service.ts` (`updateProfile`) |
| 10, 11, 12 | Danna | `src/modules/contracts/catalog.ts` |
| 13, 14 | Danna | `src/modules/contracts/service.ts` (`requestContract`), `template.ts` |
| 15 | Danna | `policy.ts` (`assertParty`), `service.ts` (`getContractDetail`) |
| 16 | Domenica | `src/modules/signing/ca.ts`, `certificates.ts` |
| 17, 18 | Domenica | `src/modules/signing/contractSigning.ts` |
| 19 | Domenica | `src/modules/signing/verify.ts` |
| 20, 21, 28 | Mateo | `src/modules/payments/service.ts` |
| 22 | Danna + Mateo | `contracts/service.ts` (`listContracts`), `payments/service.ts` (`listPayments`) |
| 23, 24 | Salma | `src/modules/chat/{socket,rooms}.js` |
| 25 | Salma | `rooms.ts` (`ensureGeneralRoom`) |
| 26 | Salma | `deliveries.ts` |
| 27 | Mateo | `src/modules/payments/approval.ts` |
| 29 | Salma | `notifications.ts` |
| 36 | Salma + Danna | `flowPolicy.ts` (`composePendingContractEmail`) — el aviso de contrato pendiente sale sin texto ni adjuntos |
| 37 | Danna + Sarasti | `contracts/service.ts` (`viewContract`), `src/app/contratos/[id]/visor/page.tsx` |

### RNF (13)
| RNF | Cómo se cumple | Archivo / evidencia |
|---|---|---|
| 01 Validación | Mismos esquemas zod en cliente y servidor | `src/lib/validation/*.js`, `AuthForm.tsx`, `tests/validation.test.ts` |
| 02 Seguridad web | Rutas protegidas, sesión HttpOnly, CSRF + Origin, secretos en entorno, Prisma parametrizado | `guard.ts`, `middleware.ts`, `.env.example` |
| 03 Claves | bcrypt con sal | `src/lib/security/passwords.ts`, `tests/auth.test.ts` |
| 04 WebSocket | Handshake autenticado, saneamiento, límite de frecuencia, `Origin`; `wss` en el despliegue (`COOKIE_SECURE=true` + proxy TLS) | `socket.js`, `tests/chat.test.ts` |
| 05 Navegabilidad | Menú por rol coherente | `NavBar.tsx` |
| 06 Rendimiento | Paginación, índices, chat sin recargar, medición | `docs/rendimiento.md`, `schema.prisma` |
| 07 Calidad | 74 pruebas automatizadas, un comando | `npm test` |
| 08 Documentación | README, `.env.example`, esquema de BD, «Uso de IA» | `README.md`, `docs/` |
| 09 Repositorio | Ramas por vertical, PR con revisión, etiqueta `v1.0-b1` | sección 4 de este documento |
| 10 Arquitectura | Monolito con cinco módulos y tablas propias | `docs/arquitectura.md`, `src/server.ts` |
| 21 Integridad del contrato | SHA-256 fijo + trigger de inmutabilidad + verificación | `integrity.ts`, migración |
| 22 Estados e idempotencia | Máquina de siete estados, trigger, pagos idempotentes | `stateMachine.ts`, `payments/service.ts` |
| 24 PayPal Sandbox | Orders v2, timeout, `PayPal-Request-Id`, pendientes | `payments/paypal.ts` |

### Componentes del Criterio Común «Web B1» (26)
| RS | Componente | Dónde |
|---|---|---|
| 01 FIA_UID.1 | Identificar antes de acciones privadas; catálogo público | `middleware.ts`, `guard.ts` |
| 02 FIA_UAU.1 | Autenticar antes de contratar, firmar, pagar o chatear | `guard.ts` (`requireAuth`), `socket.js` (`io.use`) |
| 03 FIA_UAU.4 | Token de recuperación de un solo uso | `auth/service.ts` (`resetPassword`) |
| 04 FIA_UAU.7 | Error genérico | `auth/service.ts` (`login`) |
| 07 FIA_SOS.2 | Secretos generados por el sistema | `security/random.ts`, `payments/service.ts` (nonce, referencia) |
| 08 FIA_ATD.1 | Atributos: rol, estado, certificado vigente | `app/api/auth/me/route.ts` |
| 09 FIA_USB.1 | Sesión ligada a usuario y rol | `auth/session.ts` |
| 10 FCS_CKM.1 | Generación de claves de CA y usuarios (ECDSA P-256) | `signing/ca.ts`, `webcrypto.ts` |
| 11 FCS_CKM.3 | Claves y credenciales PayPal solo en entorno | `src/lib/env.ts`, `.env.example` |
| 12 FCS_CKM.5 | bcrypt | `security/passwords.ts` |
| 14 FCS_COP.1 | SHA-256, ECDSA, hash de claves (**sin AES en reposo**, ver §0) | `signing/hash.ts`, `signing.ts` |
| 15 FCS_RNG.1 | Generador seguro | `security/random.ts` |
| 16 FCO_NRO.2 | Evidencia de origen | `signing/evidence.ts` (`recordOrigin`) |
| 17 FCO_NRR.2 | Evidencia de recibo | `evidence.ts` (`recordReceipt`) |
| 18 FDP_ACC.1 | Política por rol | `contracts/policy.ts` (`ROLE_POLICY`) |
| 19 FDP_ACF.1 | Solo las dos partes | `policy.ts` (`assertParty`), `rooms.ts` |
| 20 FDP_SDI.1 | Detectar cambios por hash | `contracts/integrity.ts`, `payments/service.ts` (`verifyPaymentIntegrity`), `evidence.ts` |
| 26 FIA_UAU.6 | Re-autenticar al firmar y pagar | `auth/service.ts` (`reauthenticate`) |
| 27 FDP_DAU.2 | Evidencia verificable | `signing/verify.ts` |
| 37 FTA_SSL.4 | Cerrar sesión | `auth/service.ts` (`logout`), `closeSessionSockets` |
| 38 FMT_SMR.1 | Roles | `prisma/schema.prisma` (`Role`), `policy.ts` |
| 41 FMT_MSA.3 | Registro nuevo = Cliente | `auth/service.ts` (`register`) |
| 42 FMT_SAE.1 | Caducidad de token, sesión y certificado | `auth/service.ts`, `session.ts`, `certificates.ts` |
| 44 FDP_IFC.1 | Flujo del contrato solo por la plataforma | `chat/flowPolicy.ts` |
| 45 FDP_IFF.1 | Reglas permitir/negar | `flowPolicy.ts` (`evaluateFlow`) |
| 46 FCS_CKM.2 | La CA entrega el certificado a cada usuario | `certificates.ts` (`issueCertificate`) |

---

## 4. Guía de Git y pull requests (RNF-09)

**Reglas del equipo**
1. `main` está protegida: nadie hace *push* directo; todo entra por *pull request*.
2. Una rama por entregable: `feat/…`, `fix/…`, `docs/…`, `chore/…`. Commits pequeños en imperativo con prefijo (`feat(pagos): …`).
3. **Regla de revisión de PR**: un PR necesita (a) `npm test` en verde adjunto, (b) **al menos una aprobación de otra persona** (rotación sugerida: Ramos→Mateo, Danna→Domenica, Domenica→Mateo, Mateo→Salma, Salma→Danna, Sarasti→Ramos), (c) checklist de requisitos tocados y (d) sin `.env`, claves ni datos personales reales.
4. Se fusiona con *squash and merge* o *merge commit* (el historial debe mostrar a todos).
5. La etiqueta `v1.0-b1` la crea Mateo **después** de fusionar todos los PR y con las pruebas en verde.

**Secuencia sugerida para simular la entrega** (en este orden, porque hay dependencias):
1. Mateo — `chore/plataforma-base`
2. Ramos — `feat/auth-registro-login`, luego `feat/auth-recuperacion-perfil`
3. Danna — `feat/catalogo-contrato`, luego `feat/contrato-ruta-segura`
4. Domenica — `feat/ca-dos-niveles`, luego `feat/firma-evidencias`
5. Mateo — `feat/pagos-paypal`
6. Salma — `feat/chat-socketio`, luego `feat/entrega-notificaciones`
7. Sarasti — `feat/ui-layout-formularios`, luego `feat/ui-contrato-firma-pago-chat`
8. Mateo — `docs/readme-v1`, luego `git tag -a v1.0-b1 -m "Entrega Web B1"` y `git push origin v1.0-b1`

**Plantilla de descripción de PR**
```
## Qué cambia
(1–3 líneas)
## Requisitos
RF-… RNF-… RS-…
## Cómo probarlo
npm test  →  74 pruebas en verde   |   pasos manuales: …
## Revisión
- [ ] Sin .env, claves ni datos reales   - [ ] Pruebas nuevas o actualizadas   - [ ] Docs al día
```

**Antes del primer commit**: `git init`, verificar `git status` — `.gitignore` ya excluye `.env`, `ca-data/`, `ca-offline/`, `storage/`, `node_modules/` y `.next/`. Comprobar con `git ls-files | grep -E "\.env$|\.pem$|\.key$"` que no devuelva nada.

## 5. Preguntas frecuentes de defensa (cualquiera puede recibirlas)

1. **¿Por qué la clave privada nunca llega al servidor y qué consigue eso?** No repudio: la plataforma no puede firmar por el usuario.
2. **¿Qué pasa si PayPal tarda más de 10 s?** El pago queda `PENDIENTE`, no se duplica y el reintento reutiliza la misma fila.
3. **¿Qué impide editar el texto de un contrato firmado?** Hash SHA-256 + trigger en la base + verificación antes de mostrar, firmar y pagar.
4. **¿Cómo evitas el doble cobro?** Único `(contrato, tramo)`, `PayPal-Request-Id`, captura condicionada con `updateMany` y respuesta idempotente.
5. **¿Cómo sabes que un mensaje del chat no ejecuta código?** Se sanea en el servidor y React lo muestra como texto.
6. **¿Por qué 404 y no 403 al abrir un contrato ajeno?** Para no revelar que existe.
7. **¿Qué quedó fuera y por qué?** Todo lo marcado «Solo DS» o de B2 (ver §0).
