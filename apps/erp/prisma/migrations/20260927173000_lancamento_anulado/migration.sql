-- AlterEnum
ALTER TYPE "StatusLancamento" ADD VALUE 'ANULADO';

-- AlterTable
ALTER TABLE "Lancamento" ADD COLUMN     "motivoAnulacao" TEXT;

