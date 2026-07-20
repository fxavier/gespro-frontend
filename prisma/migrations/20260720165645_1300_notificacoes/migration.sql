-- CreateEnum
CREATE TYPE "TipoNotificacao" AS ENUM ('DOCUMENTO_EXPIRADO', 'DOCUMENTO_PROXIMO_EXPIRAR', 'MANUTENCAO_PENDENTE', 'RESET_PASSWORD', 'CONVITE_UTILIZADOR', 'ALERTA_SISTEMA');

-- CreateEnum
CREATE TYPE "CanalNotificacao" AS ENUM ('IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "EstadoEnvio" AS ENUM ('PENDENTE', 'ENVIADO', 'FALHA');

-- CreateTable
CREATE TABLE "Notificacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" "TipoNotificacao" NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "canal" "CanalNotificacao" NOT NULL DEFAULT 'IN_APP',
    "entidadeTipo" TEXT,
    "entidadeId" TEXT,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "lidaEm" TIMESTAMP(3),
    "estadoEnvio" "EstadoEnvio" NOT NULL DEFAULT 'PENDENTE',
    "enviadoEm" TIMESTAMP(3),
    "erroEnvio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreferenciaNotificacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" "TipoNotificacao" NOT NULL,
    "canais" "CanalNotificacao"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreferenciaNotificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notificacao_tenantId_userId_lida_idx" ON "Notificacao"("tenantId", "userId", "lida");

-- CreateIndex
CREATE INDEX "Notificacao_tenantId_userId_createdAt_idx" ON "Notificacao"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notificacao_tenantId_tipo_entidadeId_idx" ON "Notificacao"("tenantId", "tipo", "entidadeId");

-- CreateIndex
CREATE INDEX "PreferenciaNotificacao_tenantId_userId_idx" ON "PreferenciaNotificacao"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PreferenciaNotificacao_userId_tipo_key" ON "PreferenciaNotificacao"("userId", "tipo");

