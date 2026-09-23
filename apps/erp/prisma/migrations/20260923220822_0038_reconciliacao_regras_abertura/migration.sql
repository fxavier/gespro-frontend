-- AlterTable
ALTER TABLE "PeriodoReconciliacao" ADD COLUMN     "diferencaAbertura" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RegraSugestaoLancamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contaBancariaId" TEXT,
    "padrao" TEXT NOT NULL,
    "natureza" "TipoPartida" NOT NULL,
    "contaContrapartidaId" TEXT NOT NULL,
    "descricao" TEXT,
    "prioridade" INTEGER NOT NULL DEFAULT 100,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegraSugestaoLancamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegraSugestaoLancamento_tenantId_ativo_prioridade_idx" ON "RegraSugestaoLancamento"("tenantId", "ativo", "prioridade");

