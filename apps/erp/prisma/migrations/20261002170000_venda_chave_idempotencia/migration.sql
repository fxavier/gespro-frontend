-- AlterTable
ALTER TABLE "Venda" ADD COLUMN     "chaveIdempotencia" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Venda_tenantId_chaveIdempotencia_key" ON "Venda"("tenantId", "chaveIdempotencia");

