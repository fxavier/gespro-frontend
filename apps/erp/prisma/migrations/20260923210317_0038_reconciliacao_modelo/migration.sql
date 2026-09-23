
-- CreateEnum
CREATE TYPE "EstadoMovimentoReconciliacao" AS ENUM ('PENDENTE', 'RECONCILIADO', 'EM_TRANSITO', 'BANCO_SEM_CONTABILIZACAO', 'CONTABILIDADE_SEM_BANCO', 'DIFERENCA_VALOR', 'DIVERGENCIA', 'RECONCILIADO_MANUALMENTE', 'IGNORADO');

-- CreateEnum
CREATE TYPE "TipoCorrespondencia" AS ENUM ('EXACTO', 'DIFERENCA_TEMPORAL', 'TOLERANCIA_VALOR', 'AGREGADO', 'MANUAL');

-- CreateEnum
CREATE TYPE "RegraCorrespondencia" AS ENUM ('REFERENCIA_EXACTA', 'REFERENCIA_NORMALIZADA', 'DOCUMENTO', 'VALOR_NATUREZA_DATA', 'VALOR_TOLERANCIA', 'DESCRICAO', 'MANUAL');

-- CreateEnum
CREATE TYPE "OrigemExtracto" AS ENUM ('CSV', 'XLSX', 'MT940', 'CAMT053', 'API', 'MANUAL');

-- CreateEnum
CREATE TYPE "EstadoPeriodoReconciliacao" AS ENUM ('ABERTO', 'EM_RECONCILIACAO', 'RECONCILIADO', 'CANCELADO');

-- AlterTable
ALTER TABLE "ContaBancaria" ADD COLUMN     "autoReconciliacao" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "limiarConfianca" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "maxMovimentosAgregacao" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "permitirAgregacao" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permitirMatchPorDescricao" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permitirMatchPorReferencia" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "permitirMatchPorValor" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "toleranciaDias" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "toleranciaValor" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ImportacaoExtracto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "origem" "OrigemExtracto" NOT NULL,
    "nomeFicheiro" TEXT,
    "hashFicheiro" TEXT NOT NULL,
    "totalLinhas" INTEGER NOT NULL DEFAULT 0,
    "criados" INTEGER NOT NULL DEFAULT 0,
    "ignorados" INTEGER NOT NULL DEFAULT 0,
    "periodoInicio" TIMESTAMP(3),
    "periodoFim" TIMESTAMP(3),
    "importadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportacaoExtracto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoBancario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "importacaoId" TEXT,
    "dataMovimento" TIMESTAMP(3) NOT NULL,
    "dataValor" TIMESTAMP(3),
    "referencia" TEXT,
    "referenciaNormalizada" TEXT,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "natureza" "TipoPartida" NOT NULL,
    "saldoAposMovimento" DECIMAL(18,2),
    "origem" "OrigemExtracto" NOT NULL,
    "chaveIdempotencia" TEXT NOT NULL,
    "estado" "EstadoMovimentoReconciliacao" NOT NULL DEFAULT 'PENDENTE',
    "correspondenciaAtivaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MovimentoBancario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoContabilistico" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "partidaId" TEXT NOT NULL,
    "dataContabilistica" TIMESTAMP(3) NOT NULL,
    "documento" TEXT,
    "referencia" TEXT,
    "referenciaNormalizada" TEXT,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "natureza" "TipoPartida" NOT NULL,
    "estado" "EstadoMovimentoReconciliacao" NOT NULL DEFAULT 'PENDENTE',
    "correspondenciaAtivaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MovimentoContabilistico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrespondenciaBancaria" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "tipo" "TipoCorrespondencia" NOT NULL,
    "regra" "RegraCorrespondencia" NOT NULL,
    "confianca" INTEGER NOT NULL DEFAULT 0,
    "automatica" BOOLEAN NOT NULL DEFAULT true,
    "valorBanco" DECIMAL(18,2) NOT NULL,
    "valorContabilistico" DECIMAL(18,2) NOT NULL,
    "diferencaValor" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "diferencaDias" INTEGER NOT NULL DEFAULT 0,
    "justificacao" TEXT,
    "confirmadaPorId" TEXT,
    "confirmadaEm" TIMESTAMP(3),
    "revertida" BOOLEAN NOT NULL DEFAULT false,
    "revertidaPorId" TEXT,
    "revertidaEm" TIMESTAMP(3),
    "periodoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorrespondenciaBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinhaCorrespondenciaBanco" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "correspondenciaId" TEXT NOT NULL,
    "movimentoBancarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinhaCorrespondenciaBanco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinhaCorrespondenciaContabilidade" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "correspondenciaId" TEXT NOT NULL,
    "movimentoContabilisticoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinhaCorrespondenciaContabilidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodoReconciliacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoPeriodoReconciliacao" NOT NULL DEFAULT 'ABERTO',
    "saldoInicialBanco" DECIMAL(18,2) NOT NULL,
    "saldoFinalBanco" DECIMAL(18,2) NOT NULL,
    "saldoInicialContabil" DECIMAL(18,2) NOT NULL,
    "saldoFinalContabil" DECIMAL(18,2) NOT NULL,
    "totalMovimentosBanco" INTEGER NOT NULL DEFAULT 0,
    "totalMovimentosContabilisticos" INTEGER NOT NULL DEFAULT 0,
    "totalReconciliados" INTEGER NOT NULL DEFAULT 0,
    "valorEmTransito" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "valorBancoSemContabilizacao" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "valorDiferencas" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "saldoReconciliado" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "diferencaResidual" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "justificacao" TEXT,
    "responsavelId" TEXT NOT NULL,
    "fechadoPorId" TEXT,
    "fechadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeriodoReconciliacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportacaoExtracto_tenantId_contaBancariaId_createdAt_idx" ON "ImportacaoExtracto"("tenantId", "contaBancariaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportacaoExtracto_tenantId_contaBancariaId_hashFicheiro_key" ON "ImportacaoExtracto"("tenantId", "contaBancariaId", "hashFicheiro");

-- CreateIndex
CREATE INDEX "MovimentoBancario_tenantId_contaBancariaId_estado_natureza__idx" ON "MovimentoBancario"("tenantId", "contaBancariaId", "estado", "natureza", "valor", "dataMovimento");

-- CreateIndex
CREATE INDEX "MovimentoBancario_tenantId_contaBancariaId_referenciaNormal_idx" ON "MovimentoBancario"("tenantId", "contaBancariaId", "referenciaNormalizada");

-- CreateIndex
CREATE INDEX "MovimentoBancario_tenantId_contaBancariaId_dataMovimento_idx" ON "MovimentoBancario"("tenantId", "contaBancariaId", "dataMovimento");

-- CreateIndex
CREATE INDEX "MovimentoBancario_tenantId_correspondenciaAtivaId_idx" ON "MovimentoBancario"("tenantId", "correspondenciaAtivaId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimentoBancario_tenantId_contaBancariaId_chaveIdempotenci_key" ON "MovimentoBancario"("tenantId", "contaBancariaId", "chaveIdempotencia");

-- CreateIndex
CREATE INDEX "MovimentoContabilistico_tenantId_contaBancariaId_estado_nat_idx" ON "MovimentoContabilistico"("tenantId", "contaBancariaId", "estado", "natureza", "valor", "dataContabilistica");

-- CreateIndex
CREATE INDEX "MovimentoContabilistico_tenantId_contaBancariaId_referencia_idx" ON "MovimentoContabilistico"("tenantId", "contaBancariaId", "referenciaNormalizada");

-- CreateIndex
CREATE INDEX "MovimentoContabilistico_tenantId_contaBancariaId_dataContab_idx" ON "MovimentoContabilistico"("tenantId", "contaBancariaId", "dataContabilistica");

-- CreateIndex
CREATE INDEX "MovimentoContabilistico_tenantId_correspondenciaAtivaId_idx" ON "MovimentoContabilistico"("tenantId", "correspondenciaAtivaId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimentoContabilistico_tenantId_partidaId_key" ON "MovimentoContabilistico"("tenantId", "partidaId");

-- CreateIndex
CREATE INDEX "CorrespondenciaBancaria_tenantId_contaBancariaId_revertida_idx" ON "CorrespondenciaBancaria"("tenantId", "contaBancariaId", "revertida");

-- CreateIndex
CREATE INDEX "CorrespondenciaBancaria_tenantId_contaBancariaId_createdAt_idx" ON "CorrespondenciaBancaria"("tenantId", "contaBancariaId", "createdAt");

-- CreateIndex
CREATE INDEX "CorrespondenciaBancaria_tenantId_periodoId_idx" ON "CorrespondenciaBancaria"("tenantId", "periodoId");

-- CreateIndex
CREATE INDEX "LinhaCorrespondenciaBanco_tenantId_movimentoBancarioId_idx" ON "LinhaCorrespondenciaBanco"("tenantId", "movimentoBancarioId");

-- CreateIndex
CREATE UNIQUE INDEX "LinhaCorrespondenciaBanco_tenantId_correspondenciaId_movime_key" ON "LinhaCorrespondenciaBanco"("tenantId", "correspondenciaId", "movimentoBancarioId");

-- CreateIndex
CREATE INDEX "LinhaCorrespondenciaContabilidade_tenantId_movimentoContabi_idx" ON "LinhaCorrespondenciaContabilidade"("tenantId", "movimentoContabilisticoId");

-- CreateIndex
CREATE UNIQUE INDEX "LinhaCorrespondenciaContabilidade_tenantId_correspondenciaI_key" ON "LinhaCorrespondenciaContabilidade"("tenantId", "correspondenciaId", "movimentoContabilisticoId");

-- CreateIndex
CREATE INDEX "PeriodoReconciliacao_tenantId_contaBancariaId_estado_idx" ON "PeriodoReconciliacao"("tenantId", "contaBancariaId", "estado");

-- CreateIndex
CREATE INDEX "PeriodoReconciliacao_tenantId_estado_idx" ON "PeriodoReconciliacao"("tenantId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodoReconciliacao_tenantId_contaBancariaId_dataInicio_da_key" ON "PeriodoReconciliacao"("tenantId", "contaBancariaId", "dataInicio", "dataFim");

-- AddForeignKey
ALTER TABLE "ImportacaoExtracto" ADD CONSTRAINT "ImportacaoExtracto_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoBancario" ADD CONSTRAINT "MovimentoBancario_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoBancario" ADD CONSTRAINT "MovimentoBancario_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "ImportacaoExtracto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoContabilistico" ADD CONSTRAINT "MovimentoContabilistico_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrespondenciaBancaria" ADD CONSTRAINT "CorrespondenciaBancaria_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrespondenciaBancaria" ADD CONSTRAINT "CorrespondenciaBancaria_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "PeriodoReconciliacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaCorrespondenciaBanco" ADD CONSTRAINT "LinhaCorrespondenciaBanco_correspondenciaId_fkey" FOREIGN KEY ("correspondenciaId") REFERENCES "CorrespondenciaBancaria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaCorrespondenciaBanco" ADD CONSTRAINT "LinhaCorrespondenciaBanco_movimentoBancarioId_fkey" FOREIGN KEY ("movimentoBancarioId") REFERENCES "MovimentoBancario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaCorrespondenciaContabilidade" ADD CONSTRAINT "LinhaCorrespondenciaContabilidade_correspondenciaId_fkey" FOREIGN KEY ("correspondenciaId") REFERENCES "CorrespondenciaBancaria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaCorrespondenciaContabilidade" ADD CONSTRAINT "LinhaCorrespondenciaContabilidade_movimentoContabilisticoI_fkey" FOREIGN KEY ("movimentoContabilisticoId") REFERENCES "MovimentoContabilistico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodoReconciliacao" ADD CONSTRAINT "PeriodoReconciliacao_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

