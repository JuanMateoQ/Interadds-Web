# Guion de demo (15 minutos)

**Antes de empezar** (5 min antes): `npm run setup` (si no está hecho), `npm run dev`, abrir `http://localhost:3000` en **dos ventanas distintas** (o una normal y una de incógnito): una para el Cliente y otra para el Proveedor. Cuentas de demostración (clave `Demo1234!`): `cliente@interadds.test`, `cliente2@interadds.test`, `proveedor@interadds.test`, `proveedor2@interadds.test`, `admin@interadds.test`. Con `PAYMENT_GATEWAY=paypal` hacen falta las cuentas Sandbox de PayPal; con `fake`, el botón de pago es simulado.

| Min | Qué se muestra | Qué decir | Requisitos |
|---|---|---|---|
| 0–1 | Arquitectura (`docs/arquitectura.md`) | Un monolito, cinco módulos con tablas propias, Socket.IO dentro | RNF-10 |
| 1–2 | Catálogo como visitante: búsqueda, filtro, paginación; detalle | Es público; «Contratar» sin sesión pide ingresar y vuelve al servicio | RF-01..03 |
| 2–3 | Registro con errores de validación; crear cuenta Cliente; login | Mismos esquemas zod en cliente y servidor; clave con bcrypt | RF-04, 05, RNF-01, 03 |
| 3–4 | Menú por rol; intentar abrir `/proveedor/servicios` como Cliente | El rol se valida en servidor, no solo se oculta el menú | RNF-05, RS-38 |
| 4–6 | Cliente contrata → se genera el contrato; abrir el visor | Hash SHA-256 fijo; marca de agua con nombre, correo y hora; sin URL directa | RF-13..15, 37, RNF-21 |
| 6–8 | Cliente firma (pide la clave); Proveedor firma; estado **Vigente**; «Verificar evidencia» | La clave privada nace y se queda en el navegador; CA propia de dos niveles | RF-16..19, RS-26 |
| 8–10 | Cliente paga el anticipo 50 % con PayPal; el Proveedor recibe aviso en la campana | Monto calculado en el servidor, idempotente, recibo con id de captura | RF-20..22, 29 |
| 10–12 | Chat del contrato en las dos ventanas; intento de conexión sin sesión (consola o `tests/chat.test.ts`); mensaje con `<script>` | Handshake autenticado, sanitización, sala solo con anticipo | RF-23..25, RNF-04 |
| 12–13 | Proveedor sube archivo (probar un `.exe` y un PNG falso); Cliente lo abre | Tipo, extensión, firma real y tamaño validados | RF-26 |
| 13–14 | Cliente aprueba con su firma y paga el saldo → **Completado** | La aprobación es evidencia firmada y desbloquea el saldo | RF-27, 28 |
| 14–15 | `npm test` (74 pruebas) y `docs/rendimiento.md` | Un comando; contrato, firma y pago cubiertos | RNF-06, 07 |

**Plan B**: si PayPal Sandbox falla, `PAYMENT_GATEWAY=fake` y reiniciar; si algo se rompe en medio, `npm run db:seed` deja contratos en los siete estados para continuar desde cualquiera.
