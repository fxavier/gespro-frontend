-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EstadoAssinatura" ADD VALUE 'LEITURA';
ALTER TYPE "EstadoAssinatura" ADD VALUE 'FECHADA';

-- AlterTable
ALTER TABLE "Assinatura" ADD COLUMN     "leituraFim" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Assinatura_estado_leituraFim_idx" ON "Assinatura"("estado", "leituraFim");

