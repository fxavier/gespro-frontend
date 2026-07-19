-- CreateEnum
CREATE TYPE "StatusContagemStock" AS ENUM ('RASCUNHO', 'EM_CONTAGEM', 'RECONCILIADA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusItemContagem" AS ENUM ('PENDENTE', 'CONTADO', 'AJUSTADO', 'JUSTIFICADO');

-- AlterEnum
ALTER TYPE "TipoSerieDocumento" ADD VALUE 'CONTAGEM_STOCK';

-- CreateTable
CREATE TABLE "ContagemStock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "localizacaoId" TEXT,
    "categoriaId" TEXT,
    "cega" BOOLEAN NOT NULL DEFAULT false,
    "status" "StatusContagemStock" NOT NULL DEFAULT 'RASCUNHO',
    "responsavelId" TEXT NOT NULL,
    "aprovadoPorId" TEXT,
    "dataAbertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataConclusao" TIMESTAMP(3),
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContagemStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemContagemStock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contagemId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "localizacaoId" TEXT NOT NULL,
    "saldoSistema" DECIMAL(18,6) NOT NULL,
    "quantidadeContada" DECIMAL(18,6),
    "diferenca" DECIMAL(18,6),
    "status" "StatusItemContagem" NOT NULL DEFAULT 'PENDENTE',
    "justificativa" TEXT,
    "movimentoStockId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemContagemStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContagemStock_tenantId_status_idx" ON "ContagemStock"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ContagemStock_tenantId_localizacaoId_status_idx" ON "ContagemStock"("tenantId", "localizacaoId", "status");

-- CreateIndex
CREATE INDEX "ContagemStock_tenantId_createdAt_idx" ON "ContagemStock"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContagemStock_tenantId_numero_key" ON "ContagemStock"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "ItemContagemStock_tenantId_contagemId_status_idx" ON "ItemContagemStock"("tenantId", "contagemId", "status");

-- CreateIndex
CREATE INDEX "ItemContagemStock_tenantId_produtoId_idx" ON "ItemContagemStock"("tenantId", "produtoId");

-- CreateIndex
CREATE INDEX "ItemContagemStock_tenantId_contagemId_idx" ON "ItemContagemStock"("tenantId", "contagemId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemContagemStock_tenantId_contagemId_produtoId_localizacao_key" ON "ItemContagemStock"("tenantId", "contagemId", "produtoId", "localizacaoId");

-- AddForeignKey
ALTER TABLE "ItemContagemStock" ADD CONSTRAINT "ItemContagemStock_contagemId_fkey" FOREIGN KEY ("contagemId") REFERENCES "ContagemStock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

