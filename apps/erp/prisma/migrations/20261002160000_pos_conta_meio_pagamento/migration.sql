-- CreateTable
CREATE TABLE "ContaMeioPagamentoPOS" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "metodo" "MetodoPagamentoTipo" NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContaMeioPagamentoPOS_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContaMeioPagamentoPOS_contaBancariaId_idx" ON "ContaMeioPagamentoPOS"("contaBancariaId");

-- CreateIndex
CREATE UNIQUE INDEX "ContaMeioPagamentoPOS_tenantId_metodo_key" ON "ContaMeioPagamentoPOS"("tenantId", "metodo");

