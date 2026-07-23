-- CreateEnum
CREATE TYPE "EstadoAssinatura" AS ENUM ('TRIAL', 'ATIVA', 'SUSPENSA', 'CANCELADA', 'EXPIRADO');

-- CreateEnum
CREATE TYPE "CicloFaturacao" AS ENUM ('MENSAL', 'ANUAL');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerificado" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailVerificadoEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Assinatura" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planoAssinatura" "PlanoAssinatura" NOT NULL DEFAULT 'BASICO',
    "ciclo" "CicloFaturacao",
    "estado" "EstadoAssinatura" NOT NULL DEFAULT 'TRIAL',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "trialInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialFim" TIMESTAMP(3) NOT NULL,
    "dataAtivacao" TIMESTAMP(3),
    "dataCancelamento" TIMESTAMP(3),
    "motivoCancelamento" TEXT,
    "tentativasFalhadas" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assinatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoWebhookStripe" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "processadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,
    "erro" TEXT,

    CONSTRAINT "EventoWebhookStripe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenHandoff" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenVerificacaoEmail" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenVerificacaoEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChaveIdempotencia" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'EM_CURSO',
    "respostaJson" JSONB,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChaveIdempotencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Assinatura_tenantId_key" ON "Assinatura"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Assinatura_stripeCustomerId_key" ON "Assinatura"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Assinatura_stripeSubscriptionId_key" ON "Assinatura"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Assinatura_tenantId_idx" ON "Assinatura"("tenantId");

-- CreateIndex
CREATE INDEX "Assinatura_estado_trialFim_idx" ON "Assinatura"("estado", "trialFim");

-- CreateIndex
CREATE UNIQUE INDEX "EventoWebhookStripe_stripeEventId_key" ON "EventoWebhookStripe"("stripeEventId");

-- CreateIndex
CREATE INDEX "EventoWebhookStripe_tipo_processadoEm_idx" ON "EventoWebhookStripe"("tipo", "processadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "TokenHandoff_jti_key" ON "TokenHandoff"("jti");

-- CreateIndex
CREATE INDEX "TokenHandoff_tenantId_idx" ON "TokenHandoff"("tenantId");

-- CreateIndex
CREATE INDEX "TokenHandoff_expiraEm_idx" ON "TokenHandoff"("expiraEm");

-- CreateIndex
CREATE UNIQUE INDEX "TokenVerificacaoEmail_token_key" ON "TokenVerificacaoEmail"("token");

-- CreateIndex
CREATE INDEX "TokenVerificacaoEmail_tenantId_userId_idx" ON "TokenVerificacaoEmail"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "TokenVerificacaoEmail_expiraEm_idx" ON "TokenVerificacaoEmail"("expiraEm");

-- CreateIndex
CREATE UNIQUE INDEX "ChaveIdempotencia_chave_key" ON "ChaveIdempotencia"("chave");

-- CreateIndex
CREATE INDEX "ChaveIdempotencia_endpoint_createdAt_idx" ON "ChaveIdempotencia"("endpoint", "createdAt");

