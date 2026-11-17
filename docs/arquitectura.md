# Arquitectura del monolito (RNF-10)

Interadds Web B1 es **un solo proceso Node.js**: `src/server.ts` crea el servidor HTTP, le monta Next.js (vistas y rutas API en el servidor) y le monta el servidor Socket.IO. Dentro hay **cinco módulos**, cada uno con sus propias tablas; los módulos solo se llaman entre sí por funciones públicas. En el Bimestre 2 pasar a servicios es **mover carpetas**: cada módulo ya tiene su código, sus tablas y su frontera.

```mermaid
flowchart TB
  subgraph Navegador
    UI["Interfaz React (Next.js)\nlayout · menú por rol · formularios · visor · chat"]
    WC["WebCrypto + IndexedDB\npar ECDSA P-256 NO exportable"]
    PP["Botones PayPal (SDK)"]
  end
  subgraph Monolito["Proceso Node.js único (src/server.ts)"]
    direction TB
    NX["Next.js: páginas (servidor) + rutas /api/*\nmiddleware: sesión · rol · CSRF · Origin"]
    SIO["Socket.IO (mismo puerto)\nhandshake autenticado"]
    subgraph Modulos["Módulos con tablas propias"]
      A["Autenticación\nauth_*"]
      C["Contratos\ncontracts_*"]
      S["Firma + CA\nsigning_*"]
      P["Pagos\npayments_*"]
      H["Chat y entrega\nchat_*"]
    end
    CV["contractView.ts\n(composición: futuro API Gateway)"]
  end
  DB[("PostgreSQL\ntriggers de inmutabilidad")]
  PAYPAL["PayPal Sandbox\nOrders v2"]
  FS[("UPLOAD_DIR\nentregas")]
  UI -->|HTTP + cookie HttpOnly + X-CSRF-Token| NX
  UI <-->|WebSocket + cookie| SIO
  WC --- UI
  PP --> PAYPAL
  NX --> A & C & S & P & H
  SIO --> H
  CV --> C & S & P & H
  NX --> CV
  P -->|crear / capturar orden (servidor)| PAYPAL
  A & C & S & P & H --> DB
  H --> FS
```

## Módulos y fronteras

| Módulo | Carpeta | Tablas | Expone a los demás |
|---|---|---|---|
| Autenticación | `src/modules/auth` | `auth_users`, `auth_provider_profiles`, `auth_sessions`, `auth_password_resets` | `getPublicUsers`, `reauthenticate`, `validateSessionToken` |
| Contratos | `src/modules/contracts` | `contracts_categories`, `_services`, `_templates`, `_contracts`, `_state_history` | `contracts/api.ts` (`getContractForParty`, `advanceStatus`), `policy.ts` |
| Firma y CA | `src/modules/signing` | `signing_certificates`, `signing_nonces`, `signing_evidences` | `contractSigning`, `evidence.recordOrigin/recordReceipt`, `verify` |
| Pagos | `src/modules/payments` | `payments_payments` | `getPaymentService()`, `approval.ts` |
| Chat y entrega | `src/modules/chat` | `chat_rooms`, `chat_messages`, `chat_deliveries`, `chat_notifications` | `notify`, `openContractRoom`, `saveDelivery` |

Regla de oro: **ningún módulo consulta tablas de otro**. Los datos de otro dominio se piden por su función pública (por ejemplo, Contratos pide nombres a `auth.getPublicUsers`). Las claves entre módulos (`clientId`, `contractId`) son texto sin llave foránea entre prefijos distintos, como serán entre bases separadas.

## Flujo del happy path

```mermaid
sequenceDiagram
  actor V as Visitante / Cliente
  participant N as Next.js + API
  participant C as Contratos
  participant F as Firma + CA
  participant P as Pagos
  participant H as Chat
  participant PP as PayPal Sandbox
  V->>N: catálogo (público) → «Contratar»
  N->>C: generar contrato + SHA-256 (inmutable)
  Note over C: GENERADO
  V->>N: firma (clave + nonce)
  N->>F: valida ECDSA, cadena de la CA, evidencia + sello
  Note over C: FIRMADO_PARCIAL → VIGENTE (2 firmas)
  V->>N: pagar anticipo 50 % (clave)
  N->>P: monto desde el contrato, referencia INT-{id}-ANTICIPO
  P->>PP: crear y capturar orden
  P->>C: ANTICIPO_PAGADO
  P->>H: abrir sala del contrato + avisar
  H-->>V: chat en tiempo real; Proveedor sube contenido
  Note over C: CONTENIDO_ENTREGADO
  V->>N: aprobar con firma
  F->>C: CONTENIDO_APROBADO
  V->>N: pagar saldo 50 %
  P->>C: COMPLETADO
```

## Decisiones

- **Sesión en cookie, no JWT**: B1 usa una sesión aleatoria (solo se guarda su hash) en cookie `HttpOnly` + `SameSite=Strict`, más token CSRF y comprobación de `Origin`. El JWT asimétrico es del Bimestre 2.
- **La clave privada nunca viaja**: se genera en el navegador (no exportable); al servidor solo llegan la clave pública, la prueba de posesión y las firmas.
- **CA propia de dos niveles**: raíz (clave fuera de línea en `ca-offline/`) y emisora (en archivo o variable base64).
- **Reglas en la base de datos**: un trigger impide editar el texto, el hash, los montos o las partes del contrato y solo permite avanzar el estado de uno en uno.
- **Pagos idempotentes**: único `(contrato, tramo)`, referencia propia, `PayPal-Request-Id`, monto calculado en el servidor y comprobado al capturar.
- **Sin cifrado en reposo** (RS-21 es de Desarrollo Seguro): el contrato se protege con hash SHA-256 y firmas; las entregas se guardan en `UPLOAD_DIR` sin cifrar.
