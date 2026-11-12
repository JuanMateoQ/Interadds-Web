-- Migración inicial de Interadds (Web B1). Cinco módulos, cada uno con sus propias tablas.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CLIENTE', 'PROVEEDOR', 'ADMIN_SISTEMA');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVO', 'BLOQUEADO');
CREATE TYPE "ServiceStatus" AS ENUM ('BORRADOR', 'PUBLICADO', 'PAUSADO');
CREATE TYPE "ContractStatus" AS ENUM ('GENERADO', 'FIRMADO_PARCIAL', 'VIGENTE', 'ANTICIPO_PAGADO', 'CONTENIDO_ENTREGADO', 'CONTENIDO_APROBADO', 'COMPLETADO');
CREATE TYPE "CertStatus" AS ENUM ('ACTIVO', 'REVOCADO');
CREATE TYPE "NoncePurpose" AS ENUM ('CERTIFICADO', 'FIRMA_CONTRATO', 'APROBACION');
CREATE TYPE "EvidenceKind" AS ENUM ('ORIGEN', 'RECEPCION');
CREATE TYPE "EvidenceEvent" AS ENUM ('FIRMA_CLIENTE', 'FIRMA_PROVEEDOR', 'PAGO', 'ENTREGA_CONTENIDO', 'APROBACION_CONTENIDO');
CREATE TYPE "PaymentTranche" AS ENUM ('ANTICIPO', 'SALDO');
CREATE TYPE "PaymentStatus" AS ENUM ('CREADA', 'PENDIENTE', 'CAPTURADA', 'FALLIDA');
CREATE TYPE "RoomKind" AS ENUM ('GENERAL', 'CONTRATO');
CREATE TYPE "DeliveryStatus" AS ENUM ('SUBIDO', 'APROBADO');
CREATE TYPE "NotificationType" AS ENUM ('CONTRATO_PENDIENTE', 'CONTRAPARTE_FIRMO', 'ANTICIPO_RECIBIDO', 'CONTENIDO_SUBIDO', 'CONTENIDO_APROBADO', 'SALDO_PAGADO');

-- ───────── Módulo: Autenticación ─────────
CREATE TABLE "auth_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CLIENTE',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVO',
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "auth_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_provider_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "auth_provider_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_password_resets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_password_resets_pkey" PRIMARY KEY ("id")
);

-- ───────── Módulo: Catálogo y contratos ─────────
CREATE TABLE "contracts_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    CONSTRAINT "contracts_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contracts_services" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "deliveryDays" INTEGER NOT NULL,
    "status" "ServiceStatus" NOT NULL DEFAULT 'BORRADOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contracts_services_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contracts_templates" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contracts_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contracts_contracts" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT,
    "serviceTitle" TEXT NOT NULL,
    "serviceDescription" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "providerEmail" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "anticipoCents" INTEGER NOT NULL,
    "saldoCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "deliveryDays" INTEGER NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'GENERADO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contracts_contracts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contracts_state_history" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "fromStatus" "ContractStatus",
    "toStatus" "ContractStatus" NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contracts_state_history_pkey" PRIMARY KEY ("id")
);

-- ───────── Módulo: Firma digital, CA y evidencias ─────────
CREATE TABLE "signing_certificates" (
    "id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "publicKeySpki" TEXT NOT NULL,
    "pem" TEXT NOT NULL,
    "issuerSerial" TEXT NOT NULL,
    "notBefore" TIMESTAMP(3) NOT NULL,
    "notAfter" TIMESTAMP(3) NOT NULL,
    "status" "CertStatus" NOT NULL DEFAULT 'ACTIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "signing_certificates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "signing_nonces" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "NoncePurpose" NOT NULL,
    "contractId" TEXT,
    "subject" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "signing_nonces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "signing_evidences" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "event" "EvidenceEvent" NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT NOT NULL,
    "certificateId" TEXT,
    "subjectHash" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "signature" TEXT,
    "nonce" TEXT,
    "meta" JSONB,
    "timestampUtc" TIMESTAMP(3) NOT NULL,
    "timestampToken" TEXT NOT NULL,
    "recordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "signing_evidences_pkey" PRIMARY KEY ("id")
);

-- ───────── Módulo: Pagos ─────────
CREATE TABLE "payments_payments" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "payeeId" TEXT NOT NULL,
    "tranche" "PaymentTranche" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREADA',
    "referenceId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "gatewayName" TEXT NOT NULL,
    "paypalOrderId" TEXT,
    "paypalCaptureId" TEXT,
    "nonce" TEXT,
    "receiptNumber" TEXT,
    "receipt" JSONB,
    "integrityHash" TEXT,
    "settlement" TEXT NOT NULL DEFAULT 'PENDIENTE_DE_LIQUIDACION',
    "failureReason" TEXT,
    "orderCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3),
    CONSTRAINT "payments_payments_pkey" PRIMARY KEY ("id")
);

-- ───────── Módulo: Chat, entrega y avisos ─────────
CREATE TABLE "chat_rooms" (
    "id" TEXT NOT NULL,
    "kind" "RoomKind" NOT NULL,
    "contractId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_deliveries" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'SUBIDO',
    "openedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "contractId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_notifications_pkey" PRIMARY KEY ("id")
);

-- ───────── Índices ─────────
CREATE UNIQUE INDEX "auth_users_email_key" ON "auth_users"("email");
CREATE UNIQUE INDEX "auth_provider_profiles_userId_key" ON "auth_provider_profiles"("userId");
CREATE UNIQUE INDEX "auth_sessions_tokenHash_key" ON "auth_sessions"("tokenHash");
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");
CREATE UNIQUE INDEX "auth_password_resets_tokenHash_key" ON "auth_password_resets"("tokenHash");
CREATE INDEX "auth_password_resets_userId_idx" ON "auth_password_resets"("userId");

CREATE UNIQUE INDEX "contracts_categories_name_key" ON "contracts_categories"("name");
CREATE UNIQUE INDEX "contracts_categories_slug_key" ON "contracts_categories"("slug");
CREATE INDEX "contracts_services_status_categoryId_idx" ON "contracts_services"("status", "categoryId");
CREATE INDEX "contracts_services_status_priceCents_idx" ON "contracts_services"("status", "priceCents");
CREATE INDEX "contracts_services_providerId_idx" ON "contracts_services"("providerId");
CREATE INDEX "contracts_services_title_idx" ON "contracts_services"("title");
CREATE UNIQUE INDEX "contracts_templates_version_key" ON "contracts_templates"("version");
CREATE INDEX "contracts_contracts_clientId_idx" ON "contracts_contracts"("clientId");
CREATE INDEX "contracts_contracts_providerId_idx" ON "contracts_contracts"("providerId");
CREATE INDEX "contracts_contracts_status_idx" ON "contracts_contracts"("status");
CREATE INDEX "contracts_contracts_serviceId_idx" ON "contracts_contracts"("serviceId");
CREATE INDEX "contracts_state_history_contractId_idx" ON "contracts_state_history"("contractId");

CREATE UNIQUE INDEX "signing_certificates_serial_key" ON "signing_certificates"("serial");
CREATE INDEX "signing_certificates_userId_idx" ON "signing_certificates"("userId");
CREATE UNIQUE INDEX "signing_nonces_nonce_key" ON "signing_nonces"("nonce");
CREATE INDEX "signing_nonces_userId_purpose_idx" ON "signing_nonces"("userId", "purpose");
CREATE UNIQUE INDEX "signing_evidences_contractId_event_kind_ref_key" ON "signing_evidences"("contractId", "event", "kind", "ref");
CREATE INDEX "signing_evidences_contractId_idx" ON "signing_evidences"("contractId");
CREATE INDEX "signing_evidences_actorId_idx" ON "signing_evidences"("actorId");

CREATE UNIQUE INDEX "payments_payments_referenceId_key" ON "payments_payments"("referenceId");
CREATE UNIQUE INDEX "payments_payments_paypalOrderId_key" ON "payments_payments"("paypalOrderId");
CREATE UNIQUE INDEX "payments_payments_paypalCaptureId_key" ON "payments_payments"("paypalCaptureId");
CREATE UNIQUE INDEX "payments_payments_receiptNumber_key" ON "payments_payments"("receiptNumber");
CREATE INDEX "payments_payments_contractId_idx" ON "payments_payments"("contractId");
CREATE UNIQUE INDEX "payments_payments_contractId_tranche_key" ON "payments_payments"("contractId", "tranche");

CREATE UNIQUE INDEX "chat_rooms_contractId_key" ON "chat_rooms"("contractId");
CREATE INDEX "chat_messages_roomId_createdAt_idx" ON "chat_messages"("roomId", "createdAt");
CREATE INDEX "chat_deliveries_contractId_idx" ON "chat_deliveries"("contractId");
CREATE UNIQUE INDEX "chat_deliveries_contractId_version_key" ON "chat_deliveries"("contractId", "version");
CREATE INDEX "chat_notifications_userId_createdAt_idx" ON "chat_notifications"("userId", "createdAt");
CREATE INDEX "chat_notifications_userId_readAt_idx" ON "chat_notifications"("userId", "readAt");

-- ───────── Claves foráneas (solo dentro de cada módulo) ─────────
ALTER TABLE "auth_provider_profiles" ADD CONSTRAINT "auth_provider_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_password_resets" ADD CONSTRAINT "auth_password_resets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contracts_services" ADD CONSTRAINT "contracts_services_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "contracts_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contracts_contracts" ADD CONSTRAINT "contracts_contracts_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "contracts_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contracts_state_history" ADD CONSTRAINT "contracts_state_history_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "signing_evidences" ADD CONSTRAINT "signing_evidences_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "signing_certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────── Controles a nivel de base de datos (RNF-21, RNF-22) ─────────
-- El texto, el hash, las partes y los montos de un contrato nunca cambian una vez generado,
-- y el estado solo puede quedarse igual o avanzar un paso en el orden del enum.
CREATE OR REPLACE FUNCTION contracts_guard_update() RETURNS trigger AS $$
DECLARE
    steps integer;
BEGIN
    IF NEW."text" IS DISTINCT FROM OLD."text"
       OR NEW."textHash" IS DISTINCT FROM OLD."textHash"
       OR NEW."templateVersion" IS DISTINCT FROM OLD."templateVersion"
       OR NEW."totalCents" IS DISTINCT FROM OLD."totalCents"
       OR NEW."anticipoCents" IS DISTINCT FROM OLD."anticipoCents"
       OR NEW."saldoCents" IS DISTINCT FROM OLD."saldoCents"
       OR NEW."currency" IS DISTINCT FROM OLD."currency"
       OR NEW."deliveryDays" IS DISTINCT FROM OLD."deliveryDays"
       OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
       OR NEW."providerId" IS DISTINCT FROM OLD."providerId" THEN
        RAISE EXCEPTION 'CONTRACT_IMMUTABLE: el contenido del contrato no se puede modificar'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    steps := array_position(enum_range(NULL::"ContractStatus"), NEW."status")
           - array_position(enum_range(NULL::"ContractStatus"), OLD."status");
    IF steps NOT IN (0, 1) THEN
        RAISE EXCEPTION 'INVALID_TRANSITION: el contrato solo avanza un estado a la vez (% -> %)', OLD."status", NEW."status"
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contracts_guard_update_trg
    BEFORE UPDATE ON "contracts_contracts"
    FOR EACH ROW EXECUTE FUNCTION contracts_guard_update();
