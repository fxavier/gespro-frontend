-- CreateEnum
CREATE TYPE "TipoBeneficio" AS ENUM ('SEGURO_SAUDE', 'SEGURO_VIDA', 'SUBSIDIO_ALIMENTACAO', 'SUBSIDIO_TRANSPORTE', 'SUBSIDIO_HABITACAO', 'SUBSIDIO_COMUNICACOES', 'PLANO_PENSOES', 'OUTRO');

-- CreateEnum
CREATE TYPE "PeriodicidadeBeneficio" AS ENUM ('MENSAL', 'TRIMESTRAL', 'ANUAL', 'PONTUAL');

-- CreateEnum
CREATE TYPE "StatusBeneficioColaborador" AS ENUM ('ACTIVO', 'SUSPENSO', 'TERMINADO');

-- CreateTable
CREATE TABLE "Beneficio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoBeneficio" NOT NULL,
    "descricao" TEXT,
    "fornecedor" TEXT,
    "custoTotal" DECIMAL(18,2) NOT NULL,
    "comparticipacaoEmpresa" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "descontoColaborador" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "periodicidade" "PeriodicidadeBeneficio" NOT NULL,
    "tributavel" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "departamentosElegiveis" TEXT[],
    "cargosElegiveis" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Beneficio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeneficioColaborador" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "beneficioId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3),
    "comparticipacaoEmpresa" DECIMAL(18,2) NOT NULL,
    "descontoColaborador" DECIMAL(18,2) NOT NULL,
    "status" "StatusBeneficioColaborador" NOT NULL DEFAULT 'ACTIVO',
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BeneficioColaborador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Beneficio_tenantId_tipo_idx" ON "Beneficio"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "Beneficio_tenantId_ativo_idx" ON "Beneficio"("tenantId", "ativo");

-- CreateIndex
CREATE INDEX "BeneficioColaborador_tenantId_colaboradorId_status_idx" ON "BeneficioColaborador"("tenantId", "colaboradorId", "status");

-- CreateIndex
CREATE INDEX "BeneficioColaborador_tenantId_beneficioId_idx" ON "BeneficioColaborador"("tenantId", "beneficioId");

-- CreateIndex
CREATE INDEX "BeneficioColaborador_tenantId_colaboradorId_beneficioId_idx" ON "BeneficioColaborador"("tenantId", "colaboradorId", "beneficioId");

-- AddForeignKey
ALTER TABLE "BeneficioColaborador" ADD CONSTRAINT "BeneficioColaborador_beneficioId_fkey" FOREIGN KEY ("beneficioId") REFERENCES "Beneficio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficioColaborador" ADD CONSTRAINT "BeneficioColaborador_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

