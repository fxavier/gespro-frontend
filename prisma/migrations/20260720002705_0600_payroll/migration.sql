-- CreateEnum
CREATE TYPE "TipoLinhaPayroll" AS ENUM ('PROVENTO', 'DESCONTO');

-- CreateEnum
CREATE TYPE "NaturezaLinhaPayroll" AS ENUM ('BASE', 'SUBSIDIO', 'HORAS_EXTRAS', 'COMISSAO', 'BONUS', 'INSS', 'IRPS', 'FALTA', 'ADIANTAMENTO', 'PENHORA', 'OUTRO');

-- AlterTable
ALTER TABLE "Payroll" ADD COLUMN     "custoTotalEntidade" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "encargoInssEntidade" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "folhaId" TEXT;

-- CreateTable
CREATE TABLE "FolhaPagamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mesReferencia" INTEGER NOT NULL,
    "anoReferencia" INTEGER NOT NULL,
    "status" "StatusPayroll" NOT NULL DEFAULT 'PENDENTE',
    "totalBruto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalInssTrabalhador" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalInssEntidade" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalIrps" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalOutrosDescontos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalLiquido" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalCustoEntidade" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lancamentoId" TEXT,
    "lancamentoPagamentoId" TEXT,
    "processadoPorId" TEXT,
    "dataProcessamento" TIMESTAMP(3),
    "dataPagamento" TIMESTAMP(3),
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FolhaPagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinhaPayroll" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payrollId" TEXT NOT NULL,
    "tipo" "TipoLinhaPayroll" NOT NULL,
    "natureza" "NaturezaLinhaPayroll" NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinhaPayroll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TabelaINSS" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3),
    "taxaTrabalhador" DECIMAL(9,6) NOT NULL,
    "taxaEntidade" DECIMAL(9,6) NOT NULL,
    "tetoIncidencia" DECIMAL(18,2),
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TabelaINSS_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalaoIRPS" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3),
    "ordem" INTEGER NOT NULL,
    "limiteInferior" DECIMAL(18,2) NOT NULL,
    "limiteSuperior" DECIMAL(18,2),
    "taxa" DECIMAL(9,6) NOT NULL,
    "parcelaAbater" DECIMAL(18,2) NOT NULL,
    "numeroDependentes" INTEGER NOT NULL DEFAULT 0,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EscalaoIRPS_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FolhaPagamento_tenantId_status_idx" ON "FolhaPagamento"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FolhaPagamento_tenantId_anoReferencia_mesReferencia_key" ON "FolhaPagamento"("tenantId", "anoReferencia", "mesReferencia");

-- CreateIndex
CREATE INDEX "LinhaPayroll_tenantId_payrollId_idx" ON "LinhaPayroll"("tenantId", "payrollId");

-- CreateIndex
CREATE INDEX "TabelaINSS_tenantId_vigenciaInicio_idx" ON "TabelaINSS"("tenantId", "vigenciaInicio");

-- CreateIndex
CREATE INDEX "EscalaoIRPS_tenantId_vigenciaInicio_ordem_idx" ON "EscalaoIRPS"("tenantId", "vigenciaInicio", "ordem");

-- CreateIndex
CREATE INDEX "Payroll_tenantId_folhaId_idx" ON "Payroll"("tenantId", "folhaId");

-- AddForeignKey
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_folhaId_fkey" FOREIGN KEY ("folhaId") REFERENCES "FolhaPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaPayroll" ADD CONSTRAINT "LinhaPayroll_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "Payroll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

