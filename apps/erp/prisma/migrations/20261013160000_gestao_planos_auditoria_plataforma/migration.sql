-- gestao_planos_auditoria_plataforma (#526, ADR-0049 §4–§5).
-- 1. Trilho de auditoria GLOBAL da plataforma (sem tenantId).
-- 2. Price IDs únicos por coluna (nulos não colidem). Antes do índice, um Price vazio passa a
--    NULL — o serviço grava '' / só espaços como NULL, e duas linhas com '' colidiriam.

UPDATE "Plano" SET "stripePriceIdMensal" = NULL WHERE btrim("stripePriceIdMensal") = '';
UPDATE "Plano" SET "stripePriceIdAnual" = NULL WHERE btrim("stripePriceIdAnual") = '';

-- CreateTable
CREATE TABLE "AuditoriaPlataforma" (
    "id" TEXT NOT NULL,
    "keycloakSub" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "antes" JSONB,
    "depois" JSONB,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditoriaPlataforma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditoriaPlataforma_entidade_codigo_createdAt_idx" ON "AuditoriaPlataforma"("entidade", "codigo", "createdAt");

-- CreateIndex
CREATE INDEX "AuditoriaPlataforma_createdAt_idx" ON "AuditoriaPlataforma"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Plano_stripePriceIdMensal_key" ON "Plano"("stripePriceIdMensal");

-- CreateIndex
CREATE UNIQUE INDEX "Plano_stripePriceIdAnual_key" ON "Plano"("stripePriceIdAnual");

