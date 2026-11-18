# Interadds — Web (monolito modular)

Marketplace de servicios de marketing digital con **contrato digital firmado**: el Cliente elige un servicio, genera el contrato (con huella SHA-256), ambos lo firman con certificados emitidos por la **CA propia de Interadds**, el Cliente paga el 50 % de anticipo con **PayPal Sandbox**, conversan y entregan el contenido por chat en tiempo real, el Cliente aprueba con su firma y paga el 50 % restante.

> Proyecto académico. Los pagos son de **PayPal Sandbox**: no se mueve dinero real.

## La PYME y el problemas
**Caso de estudio:** una plataforma intermediaria (ficticia) que conecta a **pequeñas y medianas empresas** del contexto local con **agencias y freelancers de marketing digital** (SEO, redes sociales, publicidad, diseño y contenido). Los datos de usuarios, servicios y contratos de demostración son inventados.

**Problema:** hoy estos servicios se contratan por mensajería informal: no hay un contrato claro ni verificable, se paga por adelantado sin garantía y, cuando hay desacuerdo, ninguna de las partes puede demostrar qué se acordó, qué se entregó ni cuándo. Esto genera desconfianza, retrasos y pérdidas, sobre todo para negocios pequeños sin área legal.

## Objetivos
**General:** construir una aplicación web monolítica, conectada a una base de datos y con chat en tiempo real, que formalice la contratación de servicios de marketing con contrato digital firmado, pago por etapas y evidencia verificable.

**Específicos (medibles):**
1. Registrar y autenticar usuarios con roles (Cliente, Proveedor), con claves almacenadas como hash y recuperación de clave.
2. Permitir al Proveedor administrar su catálogo (CRUD con validación en servidor) y al Cliente buscarlo y contratar. 
3. Generar un contrato inmutable con huella SHA-256 y firmarlo por ambas partes con certificados de una CA propia (estados `GENERADO` → `VIGENTE`).
4. Cobrar el 50 % de anticipo y el 50 % de saldo con PayPal Sandbox, sin pagos duplicados.
5. Habilitar un chat por contrato por WebSocket autenticado, con entrega y aprobación del contenido.
6. Cubrir el happy path con al menos 5 pruebas automatizadas (hay 74) y medir el rendimiento de las consultas.

## Integrantes y roles
| Integrante | Rol (vertical) | Puntos B1 |
|---|---|---|
| Sebas Ramos | Identidad y acceso (autenticación, sesiones, roles) | 19 |
| Danna Morales | Catálogo y contrato (CRUD, contrato, hash, política de acceso) | 19 |
| Domenica Cardenas | Firma digital, CA y evidencias | 19 |
| Mateo Quisilema | Pagos y plataforma (servidor, base de datos, PayPal, README y etiqueta) | 19 |
| Salma Morales | Chat y entrega (WebSocket, notificaciones, entregas) | 19 |
| Sebas Sarasti | Frontend y presentación (layout, pantallas, demo) | 25 |

## Cronograma De Interadds
| Fecha | Actividad | Responsable |
|---|---|---|
| jue 12 nov | Repositorio, servidor Node con Next.js, Prisma, migración inicial y `.env.example`; hash de claves; autenticación | Mateo · Sebas Ramos |
| vie 13 nov | Autoridad certificadora, contrato, chat y certificados | Domenica · Danna · Salma |
| sáb 14 nov | Rutas de autenticación, catálogo, firma y pantallas de acceso y catálogo | Sebas Ramos · Danna · Domenica · Sebas Sarasti |
| dom 15 nov | Entregas, pagos con PayPal Sandbox, pantallas del contrato y pruebas de firma; vista del contrato | Salma · Mateo · Domenica · Danna · Sebas Sarasti |
| lun 16 nov | Pruebas de pagos, pantalla del chat, prueba E2E, README final y presentación lista | Mateo · Salma · todos |
| mar 17 nov | Ensayo de la presentación y de la defensa; etiqueta `v1.0-b1` | Todo el equipo · Mateo |
| mié 18 nov | Presentación y defensa | Todo el equipo |

**Pila:** Node.js ≥ 20 · TypeScript (ejecutado con `tsx`) · Next.js 15 (App Router) con servidor propio (`src/server.ts`) · Socket.IO en el mismo proceso · PostgreSQL + Prisma (ORM; no se usa TypeORM porque la guía fija «Next.js + Prisma») · zod · bcrypt · WebCrypto (ECDSA P-256).

## Requisitos previos
- Node.js 20 o superior y npm
- PostgreSQL 14 o superior (una base `interadds` y otra `interadds_test`) 

## Guía de Instalación
```bash
npm install
cp .env.example .env            # en Windows (PowerShell): Copy-Item .env.example .env
# Edita .env: DATABASE_URL, TEST_DATABASE_URL y, si usas PayPal, las credenciales Sandbox
npm run setup                   # migra la base, crea la CA de Interadds y carga datos de demostración
npm run dev                     # http://localhost:3000
```
`npm run setup` = `prisma migrate deploy` + `npm run ca:init` (genera la CA raíz y la emisora en `ca-data/` y `ca-offline/`) + `npm run db:seed`.

**Cuentas de demostración** (clave `Demo1234!`, configurable con `SEED_DEMO_PASSWORD`): `cliente@interadds.test`, `cliente2@interadds.test`, `proveedor@interadds.test`, `proveedor2@interadds.test`, `admin@interadds.test`. La semilla deja un contrato en cada uno de los siete estados.

### Pagos
| `PAYMENT_GATEWAY` | Comportamiento |
|---|---|
| `paypal` (por defecto) | PayPal Orders v2 en **Sandbox** (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, y el mismo Client ID en `NEXT_PUBLIC_PAYPAL_CLIENT_ID`). Paga con una cuenta *personal* de Sandbox. |
| `fake` | Pasarela simulada en memoria para desarrollo y pruebas; la pantalla muestra un botón de aprobación simulada. **No arranca con `NODE_ENV=production`.** |

### CA y claves
- La clave privada de la **CA raíz** se escribe en `ca-offline/`: muévela a un medio sin conexión después de `ca:init`.
- La clave de la **CA emisora** se lee de `ca-data/` o de variables base64 (`CA_ISSUING_KEY_B64`, …) si el hosting no tiene disco.
- Ninguna de las dos carpetas se sube a Git (`.gitignore`).
- Las claves de firma de los usuarios nacen en su navegador y **no son exportables**; si el usuario cambia de navegador, se emite un certificado nuevo.

## Pruebas (un comando)
```bash
npm test
```
Corre 74 pruebas con el ejecutor nativo de Node (`node:test`, con `tsx` para TypeScript) sobre la base de `TEST_DATABASE_URL`. **Esa base debe terminar en `_test`** (las pruebas la vacían; el ejecutor se niega si no). Aplica las migraciones y crea una CA temporal por su cuenta. Con `SKIP_MIGRATE=1` omite las migraciones. `npm run typecheck` revisa los tipos de todo el proyecto (`tsc --noEmit`).

| Archivo | Cubre |
|---|---|
| `tests/validation.test.ts` | validación (formato, longitud, solo números), saneamiento de mensajes, archivos, redirecciones, dinero |
| `tests/auth.test.ts` | registro, login, sesión, recuperación de clave, re-autenticación, perfil |
| `tests/catalog.test.ts` | CRUD de servicios, permisos, catálogo público, borrado con confirmación |
| `tests/contracts.test.ts` | hash SHA-256, inmutabilidad (trigger), estados, acceso solo para las dos partes, visor, flujo |
| `tests/signing.test.ts` | CA de dos niveles, prueba de posesión, firma, repetición, nonce vencido, evidencia manipulada |
| `tests/payments.test.ts` | anticipo y saldo, idempotencia, timeout, monto distinto, re-autenticación |
| `tests/chat.test.ts` | WebSocket: sin sesión, sala por contrato, saneamiento, límite de frecuencia, entregas |
| `tests/e2e.test.ts` | happy path completo por los siete estados |
|Rendimiento: `npm run perf` | mide consultas y escribe `docs/rendimiento.md`.|

## Estructura
```
src/server.ts                  Servidor Node: Next.js + Socket.IO en el mismo puerto
prisma/                    schema.prisma, migración inicial (con triggers) y semilla
src/modules/
  auth/                    Autenticación (tablas auth_*)
  contracts/               Catálogo y contrato (contracts_*)
  signing/                 CA, certificados, firma y evidencias (signing_*)
  payments/                PayPal, pagos y aprobación (payments_*)
  chat/                    Socket.IO, entregas y notificaciones (chat_*)
  contractView.ts          Composición para la interfaz (futuro API Gateway)
src/app/                   Páginas y rutas /api (Next.js App Router)
src/components/            Componentes de interfaz
src/lib/                   Utilidades, validación (zod), seguridad y cliente del navegador
tests/                     Pruebas automatizadas
docs/                      Arquitectura, esquema de BD y rendimiento
```
Documentación: [arquitectura](docs/arquitectura.md) · [esquema de base de datos](docs/esquema-base-datos.md) · [rendimiento](docs/rendimiento.md).

## Seguridad en resumen
Sesión aleatoria en cookie `HttpOnly` + `SameSite=Strict` (solo se guarda su hash) · token CSRF y comprobación de `Origin` en toda escritura · bcrypt · errores de login genéricos · re-autenticación para firmar y pagar · nonces de un solo uso · contrato inmutable (hash + trigger) · acceso solo para las dos partes · monto de pago calculado en el servidor · WebSocket con handshake autenticado, saneamiento y límite de frecuencia · secretos solo en variables de entorno.

Para el despliegue: `NODE_ENV=production`, `COOKIE_SECURE=true`, HTTPS delante del servidor (así el chat viaja por `wss`) y `PAYMENT_GATEWAY=paypal`.


## Uso de IA
Este proyecto se desarrolló con apoyo de **Claude (Anthropic)** como asistente de programación, bajo la dirección y revisión del equipo.

- **Qué hizo la IA:** propuso la arquitectura modular, escribió el código de los cinco módulos, la interfaz, las pruebas automatizadas y esta documentación a partir de los requisitos y del reparto del equipo.
- **Qué hizo el equipo:** definió los requisitos y el alcance, revisó el código, ejecutó y comprobó el sistema (pruebas y recorrido en navegador), configuró PayPal Sandbox y la base de datos, y es responsable de entender y defender cada parte.
- **Cómo se verificó el resultado:** 74 pruebas automatizadas (`npm test`) y un recorrido completo del happy path en un navegador real.
- **Datos:** no se enviaron credenciales ni datos personales reales a la IA; las cuentas y contratos de demostración son ficticios.
- **Criterio:** el código generado por IA puede contener errores; ningún cambio se fusiona sin revisión de otra persona del equipo.

## Entrega y etiqueta
Cuando todos los PR estén fusionados y `npm test` pase en `main`:
```bash
git tag -a v1.0-b1 -m "Entrega Web B1"
git push origin v1.0-b1
```
El repositorio debe ser **público**, con commits de todos los integrantes, y **sin** `.env`, claves (`*.pem`, `*.key`) ni datos personales reales.
