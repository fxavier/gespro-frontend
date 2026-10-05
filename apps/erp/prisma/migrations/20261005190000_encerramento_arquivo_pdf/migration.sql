-- encerramento_arquivo_pdf (ADR-0035 §8, #365): chaves dos PDF arquivados depois do commit.

-- AlterTable
ALTER TABLE "EncerramentoExercicio" ADD COLUMN     "arquivadoEm" TIMESTAMP(3),
ADD COLUMN     "balanceteStorageKey" TEXT,
ADD COLUMN     "balancoStorageKey" TEXT,
ADD COLUMN     "dreStorageKey" TEXT;

