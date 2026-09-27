-- CreateEnum
CREATE TYPE "FormaLiquidacaoNC" AS ENUM ('DEVOLUCAO', 'COMPENSACAO');

-- AlterTable
ALTER TABLE "CotacaoComercial" ADD COLUMN     "motivoCancelamento" TEXT;

-- AlterTable
ALTER TABLE "NotaCredito" ADD COLUMN     "dataLiquidacao" TIMESTAMP(3),
ADD COLUMN     "formaLiquidacao" "FormaLiquidacaoNC",
ADD COLUMN     "lancamentoEstornoId" TEXT,
ADD COLUMN     "lancamentoLiquidacaoId" TEXT;

-- AlterTable
ALTER TABLE "Proforma" ADD COLUMN     "motivoCancelamento" TEXT;

