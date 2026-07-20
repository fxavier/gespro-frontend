-- AlterTable
ALTER TABLE "ItemReconciliacaoBancaria" ADD COLUMN     "itemParId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ItemReconciliacaoBancaria_tenantId_reconciliacaoId_extratoR_key" ON "ItemReconciliacaoBancaria"("tenantId", "reconciliacaoId", "extratoReferencia");

