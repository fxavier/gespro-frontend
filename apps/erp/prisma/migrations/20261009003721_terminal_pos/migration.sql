-- AlterTable
ALTER TABLE "SessaoCaixa" ADD COLUMN     "terminalId" TEXT;

-- CreateTable
CREATE TABLE "TerminalPOS" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TerminalPOS_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TerminalPOS_tenantId_ativo_idx" ON "TerminalPOS"("tenantId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "TerminalPOS_tenantId_codigo_key" ON "TerminalPOS"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "SessaoCaixa_tenantId_terminalId_status_idx" ON "SessaoCaixa"("tenantId", "terminalId", "status");

