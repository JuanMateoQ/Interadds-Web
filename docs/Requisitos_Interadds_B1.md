# Interadds — Requisitos funcionales y no funcionales (Web B1)

Marketplace de servicios de marketing digital con contrato firmado digitalmente. Este documento explica **qué debe hacer el sistema** (requisitos funcionales, RF) y **con qué calidad lo debe hacer** (requisitos no funcionales, RNF) en el primer bimestre, para la aplicación monolítica.

**Prioridad:** *Alta* = sin esto el flujo principal no funciona o se incumple la guía; *Media* = necesario, pero el flujo principal podría demostrarse sin ello.

## 1. Actores

| Actor | Quién es |
|---|---|
| Visitante | Persona sin sesión iniciada. Solo puede ver el catálogo público. |
| Cliente | Usuario (por ejemplo, el dueño de una PYME) que contrata servicios de marketing. |
| Proveedor | Agencia o freelancer que publica servicios y los entrega. |


## 2. Requisitos funcionales (RF)

### 2.1 Catálogo público

| ID | Requisito | Explicación | Actor | Prioridad |
|---|---|---|---|---|
| RF-01 | Listado de servicios | El catálogo muestra los servicios publicados en páginas de 9. Se puede buscar por título y filtrar por categoría y por rango de precio. | Visitante y usuarios con sesión | Alta |
| RF-02 | Detalle de un servicio | Al abrir un servicio por su identificador se ven su precio, su plazo en días y el proveedor que lo ofrece. | Visitante y usuarios con sesión | Alta |
| RF-03 | Contratar sin sesión | Si un visitante pulsa "Contratar", el sistema le pide registrarse o iniciar sesión y, al terminar, lo devuelve al servicio que había elegido. | Visitante | Media |

### 2.2 Acceso y cuenta

| ID | Requisito | Explicación | Actor | Prioridad |
|---|---|---|---|---|
| RF-04 | Registro | Se crea una cuenta nueva validando los datos en la pantalla y en el servidor. El usuario queda como Cliente, o como Proveedor si lo elige. | Visitante | Alta |
| RF-05 | Inicio de sesión | Las credenciales se comprueban contra la base de datos. La contraseña se guarda con hash y sal, nunca en texto plano. Los errores no revelan si falló el correo o la clave. | Todos | Alta |
| RF-06 | Cierre de sesión | Al cerrar sesión se invalida la sesión activa, de modo que ya no se puede reutilizar. | Usuarios con sesión | Alta |
| RF-07 | Recuperación de clave | El usuario pide recuperar su clave y recibe un enlace con un token de un solo uso y con caducidad. El correo se simula (queda en la consola del servidor). | Todos | Alta |
| RF-08 | Pantalla principal y menú | Tras iniciar sesión se ve una pantalla principal con un menú que cambia según el rol y da acceso a catálogo, contratos y chat. Las pantallas de un rol no se pueden abrir con otro. | Usuarios con sesión | Alta |
| RF-09 | Perfil | Cada usuario ve y edita su perfil. El Proveedor completa además su perfil profesional (nombre comercial, descripción y contacto). | Cliente, Proveedor | Media |

### 2.3 Gestión de servicios (CRUD de la entidad principal)

La entidad principal del negocio es el **servicio**, que tiene título, categoría, descripción, precio, plazo y estado, entre otros atributos.

| ID | Requisito | Explicación | Actor | Prioridad |
|---|---|---|---|---|
| RF-10 | Crear un servicio | El Proveedor crea un servicio con al menos cinco atributos validados en tipo, formato y longitud. | Proveedor | Alta |
| RF-11 | Actualizar un servicio | El Proveedor edita solo los servicios que le pertenecen. | Proveedor | Alta |
| RF-12 | Eliminar un servicio | El Proveedor elimina un servicio propio tras confirmar. Si el servicio ya tiene contratos activos, no se elimina: solo se puede pausar. | Proveedor | Alta |

### 2.4 Contrato

| ID | Requisito | Explicación | Actor | Prioridad |
|---|---|---|---|---|
| RF-13 | Solicitar la contratación | El Cliente elige un servicio publicado y solicita contratarlo. El sistema crea el contrato. | Cliente | Alta |
| RF-14 | Generar el contrato | El sistema arma el texto a partir de una plantilla (partes, servicio, precio, plazo, cláusula de cumplimiento y cláusula de pago 50/50) y calcula la huella SHA-256 del texto final. Desde ese momento el texto ya no se puede modificar. | Sistema | Alta |
| RF-15 | Acceso al contrato | Cliente y Proveedor ven exactamente el mismo contrato. Nadie más puede abrirlo, ni siquiera el administrador. | Cliente, Proveedor | Alta |
| RF-36 | Compartir solo por la plataforma | El contrato se entrega a la contraparte dentro de Interadds. No hay enlaces públicos ni reenvío a terceros, y los correos solo avisan que hay un contrato pendiente, sin su texto ni adjuntos. | Sistema | Media |
| RF-37 | Visor protegido | El contrato se lee en pantalla con una marca de agua con el nombre, el correo y la hora de quien lo abre. El texto no tiene una dirección directa que se pueda copiar y compartir. | Cliente, Proveedor | Media |

### 2.5 Firma digital y evidencias

| ID | Requisito | Explicación | Actor | Prioridad |
|---|---|---|---|---|
| RF-16 | Autoridad certificadora propia | Interadds actúa como entidad certificadora de dos niveles: una CA raíz que solo firma a la CA emisora, y la emisora, que firma el certificado de cada usuario antes de su primera firma, tras comprobar su sesión y su clave. La clave privada del usuario se genera en su navegador y no sale de él. | Cliente, Proveedor | Alta |
| RF-17 | Firmar el contrato | El usuario vuelve a escribir su clave y firma la huella del contrato con su clave privada. El sistema agrega el sello de tiempo y guarda la evidencia. | Cliente, Proveedor | Alta |
| RF-18 | Vigencia del contrato | El contrato pasa a vigente solo cuando ambas partes tienen una firma válida. | Sistema | Alta |
| RF-19 | Verificar evidencias | Cualquiera de las dos partes puede verificar una firma: se comprueban el certificado, la cadena de certificación, la huella y la hora. | Cliente, Proveedor | Alta |

### 2.6 Pagos

| ID | Requisito | Explicación | Actor | Prioridad |
|---|---|---|---|---|
| RF-20 | Pagar el anticipo | El Cliente paga el 50 % del precio solo cuando el contrato está vigente. El monto lo calcula el servidor a partir del contrato; el Cliente lo aprueba en PayPal (Sandbox) y el servidor captura el pago. | Cliente | Alta |
| RF-21 | Aviso y comprobante del anticipo | El Proveedor recibe un aviso y un comprobante del pago, con el identificador de captura de PayPal. | Proveedor | Media |
| RF-22 | Historial de contratos y pagos | Cada usuario ve el historial y el estado de sus propios contratos y pagos. | Cliente, Proveedor | Media |
| RF-28 | Pagar el saldo | Tras aprobar el contenido, el Cliente paga el 50 % restante. El contrato pasa a completado y el Proveedor recibe su comprobante. | Cliente, Proveedor | Alta |

### 2.7 Chat, entrega y notificaciones

| ID | Requisito | Explicación | Actor | Prioridad |
|---|---|---|---|---|
| RF-23 | Sala del contrato | Cada contrato tiene una sala de chat privada. Se habilita solo cuando el anticipo está pagado y solo entran las dos partes, con una conexión autenticada. | Cliente, Proveedor | Alta |
| RF-24 | Mensajes en tiempo real | Los mensajes llegan al instante, sin recargar la página. Se guardan en la base de datos (historial) y se indica qué usuarios están conectados. | Cliente, Proveedor | Alta |
| RF-25 | Sala general | Existe una sala abierta a todos los usuarios con sesión, además de las salas por contrato. | Usuarios con sesión | Media |
| RF-26 | Entrega de contenido | El Proveedor sube el contenido ligado al contrato. El sistema valida el tipo y el tamaño del archivo, guarda su huella y registra la evidencia de entrega. | Proveedor | Alta |
| RF-27 | Aprobación del contenido | El Cliente revisa el contenido entregado y lo aprueba con su firma. La aprobación queda como evidencia. | Cliente | Alta |
| RF-29 | Notificaciones en tiempo real | Cada hito genera un aviso al instante: la contraparte firmó, se recibió el anticipo, se subió el contenido, se aprobó el contenido y se pagó el saldo. | Cliente, Proveedor | Alta |

### 2.8 Ciclo de vida del contrato

El contrato recorre siete estados y solo avanza de uno en uno:

1. **GENERADO:** el Cliente eligió el servicio y se creó el contrato.
2. **FIRMADO_PARCIAL:** firmó una de las dos partes.
3. **VIGENTE:** firmaron ambas partes.
4. **ANTICIPO_PAGADO:** el Cliente pagó el 50 %.
5. **CONTENIDO_ENTREGADO:** el Proveedor subió su entrega.
6. **CONTENIDO_APROBADO:** el Cliente aprobó con su firma.
7. **COMPLETADO:** el Cliente pagó el saldo del 50 %.

## 3. Requisitos no funcionales (RNF)

| ID | Requisito | Qué significa | Cómo se comprueba | Prioridad |
|---|---|---|---|---|
| RNF-01 | Validación | Los datos se validan en la pantalla (campos requeridos, solo números, formato y longitud) y siempre también en el servidor. Los mensajes de error son claros. | Pruebas de validación | Alta |
| RNF-02 | Seguridad web | Rutas protegidas, sesiones seguras en cookie HttpOnly, protección básica contra inyección SQL, XSS y CSRF, y secretos en variables de entorno. | Revisión del código y archivo `.env.example` | Alta |
| RNF-03 | Contraseñas | Se guardan con hash y sal (bcrypt), nunca en texto plano ni cifradas de forma reversible. | Prueba de autenticación | Alta |
| RNF-04 | Seguridad del WebSocket | Autenticación en el handshake, validación y saneamiento de los mensajes, límite de frecuencia y `wss` en el despliegue. | Demo con una conexión sin sesión rechazada | Alta |
| RNF-05 | Navegabilidad | Menú coherente y navegación fluida entre todas las pantallas. | Recorrido en la demo | Media |
| RNF-06 | Rendimiento | Paginación, índices en los campos de búsqueda y chat que se actualiza sin recargar. | Medición de tiempos de consulta (`npm run perf`) | Alta |
| RNF-07 | Calidad | Al menos 5 pruebas automatizadas relevantes (el proyecto tiene 74), que se ejecutan con un solo comando. | Reporte de `npm test` | Alta |
| RNF-08 | Documentación | README con instrucciones, ejemplo de variables de entorno, esquema de base de datos documentado, diagramas y sección "Uso de IA". | README y carpeta `docs/` | Alta |
| RNF-09 | Repositorio | Público, con commits de todos los integrantes, etiqueta `v1.0-b1` y sin credenciales ni datos personales reales. | Historial de Git | Alta |
| RNF-10 | Arquitectura | Monolito con vistas y rutas en el servidor y el servidor WebSocket dentro del mismo proyecto. Cinco módulos con tablas propias, para poder separarlos después. | Diagrama de arquitectura | Alta |
| RNF-21 | Integridad del contrato | El texto del contrato es inmutable una vez generado: se guarda su hash y cualquier cambio invalida las firmas. | Prueba que altera el texto y falla la verificación | Alta |
| RNF-22 | Consistencia | Los estados del contrato y de los pagos siguen solo transiciones válidas. Cada pago es idempotente: una referencia única por contrato y tramo evita que se cobre dos veces. | Pruebas de transiciones y de pago repetido | Alta |
| RNF-24 | Pagos con PayPal | PayPal se llama solo desde el servidor, en modo Sandbox. Las credenciales van en variables de entorno, el sistema no recibe ni guarda datos de tarjeta y, si PayPal no responde en 10 segundos, el pago queda pendiente. La pasarela queda detrás de una interfaz propia para poder cambiarla. | Pago de prueba y prueba de pago repetido | Media |


