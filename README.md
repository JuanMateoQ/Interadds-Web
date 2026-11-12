# Interadds — Web B1 (monolito modular)

Marketplace de servicios de marketing digital con **contrato digital firmado**: el Cliente elige un servicio, genera el contrato (con huella SHA-256), ambos lo firman con certificados emitidos por la **CA propia de Interadds**, el Cliente paga el 50 % de anticipo con **PayPal Sandbox**, conversan y entregan el contenido por chat en tiempo real, el Cliente aprueba con su firma y paga el 50 % restante.

> Proyecto académico (Aplicaciones Web Avanzadas · Bimestre 1). Los pagos son de **PayPal Sandbox**: no se mueve dinero real.

## La PYME y el problema
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
6. Cubrir el camino feliz con al menos 5 pruebas automatizadas (hay 74) y medir el rendimiento de las consultas.

## Integrantes y roles
| Integrante | Rol (vertical) | Puntos B1 |
|---|---|---|
| Sebas Ramos | Identidad y acceso (autenticación, sesiones, roles) | 19 |
| Danna Morales | Catálogo y contrato (CRUD, contrato, hash, política de acceso) | 19 |
| Domenica Cardenas | Firma digital, CA y evidencias | 19 |
| Mateo Quisilema | Pagos y plataforma (servidor, base de datos, PayPal, README y etiqueta) | 19 |
| Salma Morales | Chat y entrega (WebSocket, notificaciones, entregas) | 19 |
| Sebas Sarasti | Frontend y presentación (layout, pantallas, demo) | 25 |

## Cronograma (Web B1: presentación el miércoles 18 de noviembre)
| Fecha | Actividad | Responsable |
|---|---|---|
| jue 12 nov | Repositorio, servidor Node con Next.js, Prisma, migración inicial y `.env.example`; hash de claves; autenticación | Mateo · Sebas Ramos |
| vie 13 nov | Autoridad certificadora, contrato, chat y certificados | Domenica · Danna · Salma |
| sáb 14 nov | Rutas de autenticación, catálogo, firma y pantallas de acceso y catálogo | Sebas Ramos · Danna · Domenica · Sebas Sarasti |
| dom 15 nov | Entregas, pagos con PayPal Sandbox, pantallas del contrato y pruebas de firma; vista del contrato | Salma · Mateo · Domenica · Danna · Sebas Sarasti |
| lun 16 nov | Pruebas de pagos, pantalla del chat, prueba E2E, README final y presentación lista | Mateo · Salma · todos |
| mar 17 nov | Ensayo de la presentación y de la defensa; etiqueta `v1.0-b1` | Todo el equipo · Mateo |
| mié 18 nov | Presentación y defensa | Todo el equipo |

*La subida del código sigue el plan de 22 commits ordenados (carpeta `PLAN_DE_COMMITS`), con rama y Pull Request por paso.*

**Pila:** Node.js ≥ 20 · TypeScript (ejecutado con `tsx`) · Next.js 15 (App Router) con servidor propio (`src/server.ts`) · Socket.IO en el mismo proceso · PostgreSQL + Prisma (ORM; no se usa TypeORM porque la guía fija «Next.js + Prisma») · zod · bcrypt · WebCrypto (ECDSA P-256).

## Estado
Este es el README inicial del repositorio (28 oct). La guía de ejecución, las variables de entorno, las pruebas, la estructura y la sección «Uso de IA» se completan en el commit final de Mateo (20 nov).
