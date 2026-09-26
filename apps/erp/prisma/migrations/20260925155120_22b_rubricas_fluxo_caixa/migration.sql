-- CreateEnum
CREATE TYPE "AtividadeFluxo" AS ENUM ('OPERACIONAL', 'INVESTIMENTO', 'FINANCIAMENTO', 'CAIXA');

-- CreateEnum
CREATE TYPE "SinalFluxo" AS ENUM ('ENTRADA', 'SAIDA', 'VARIACAO');

-- CreateEnum
CREATE TYPE "OrigemRubrica" AS ENUM ('SISTEMA', 'TENANT');

-- CreateEnum
CREATE TYPE "EstadoVersaoMapeamento" AS ENUM ('PENDING', 'VALIDATED');

-- CreateTable
CREATE TABLE "RubricaFluxoCaixa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "designacao" TEXT NOT NULL,
    "atividade" "AtividadeFluxo" NOT NULL,
    "sinal" "SinalFluxo" NOT NULL,
    "ordem" INTEGER NOT NULL,
    "origem" "OrigemRubrica" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RubricaFluxoCaixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapeamentoContaFluxo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "rubricaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapeamentoContaFluxo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersaoMapeamentoFluxo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" "EstadoVersaoMapeamento" NOT NULL DEFAULT 'PENDING',
    "instantaneo" JSONB NOT NULL,
    "validadoPorId" TEXT,
    "validadoEm" TIMESTAMP(3),
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VersaoMapeamentoFluxo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RubricaFluxoCaixa_tenantId_atividade_ordem_idx" ON "RubricaFluxoCaixa"("tenantId", "atividade", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "RubricaFluxoCaixa_tenantId_codigo_key" ON "RubricaFluxoCaixa"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "MapeamentoContaFluxo_tenantId_rubricaId_idx" ON "MapeamentoContaFluxo"("tenantId", "rubricaId");

-- CreateIndex
CREATE UNIQUE INDEX "MapeamentoContaFluxo_tenantId_contaId_key" ON "MapeamentoContaFluxo"("tenantId", "contaId");

-- CreateIndex
CREATE INDEX "VersaoMapeamentoFluxo_tenantId_estado_idx" ON "VersaoMapeamentoFluxo"("tenantId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "VersaoMapeamentoFluxo_tenantId_numero_key" ON "VersaoMapeamentoFluxo"("tenantId", "numero");

-- AddForeignKey
ALTER TABLE "CompromissoTesouraria" ADD CONSTRAINT "CompromissoTesouraria_rubricaId_fkey" FOREIGN KEY ("rubricaId") REFERENCES "RubricaFluxoCaixa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapeamentoContaFluxo" ADD CONSTRAINT "MapeamentoContaFluxo_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaPGC"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapeamentoContaFluxo" ADD CONSTRAINT "MapeamentoContaFluxo_rubricaId_fkey" FOREIGN KEY ("rubricaId") REFERENCES "RubricaFluxoCaixa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

