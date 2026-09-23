-- DropForeignKey
ALTER TABLE "ItemReconciliacaoBancaria" DROP CONSTRAINT "ItemReconciliacaoBancaria_reconciliacaoId_fkey";

-- DropForeignKey
ALTER TABLE "ReconciliacaoBancaria" DROP CONSTRAINT "ReconciliacaoBancaria_contaBancariaId_fkey";

-- DropTable
DROP TABLE "ItemReconciliacaoBancaria";

-- DropTable
DROP TABLE "ReconciliacaoBancaria";

-- DropEnum
DROP TYPE "StatusReconciliacao";

