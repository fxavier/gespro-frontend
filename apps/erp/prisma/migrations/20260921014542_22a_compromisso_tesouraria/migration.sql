-- CreateEnum
CREATE TYPE "TipoCompromisso" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "RecorrenciaCompromisso" AS ENUM ('UNICA', 'MENSAL', 'TRIMESTRAL', 'ANUAL');

-- CreateTable
CREATE TABLE "CompromissoTesouraria" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "TipoCompromisso" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "dataPrevista" TIMESTAMP(3) NOT NULL,
    "recorrencia" "RecorrenciaCompromisso" NOT NULL DEFAULT 'UNICA',
    "dataFimRecorrencia" TIMESTAMP(3),
    "rubricaId" TEXT,
    "contaContabilId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CompromissoTesouraria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompromissoTesouraria_tenantId_dataPrevista_ativo_idx" ON "CompromissoTesouraria"("tenantId", "dataPrevista", "ativo");

-- CreateIndex
CREATE INDEX "CompromissoTesouraria_tenantId_deletedAt_idx" ON "CompromissoTesouraria"("tenantId", "deletedAt");

