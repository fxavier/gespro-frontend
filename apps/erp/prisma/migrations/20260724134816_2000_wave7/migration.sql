-- AlterTable
ALTER TABLE "DocumentoAtivo" ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "storageKey" TEXT,
ADD COLUMN     "tamanhoBytes" INTEGER;

-- AlterTable
ALTER TABLE "DocumentoFornecedor" ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "storageKey" TEXT,
ADD COLUMN     "tamanhoBytes" INTEGER;

-- AlterTable
ALTER TABLE "DocumentoMotorista" ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "storageKey" TEXT,
ADD COLUMN     "tamanhoBytes" INTEGER;

-- AlterTable
ALTER TABLE "DocumentoViatura" ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "storageKey" TEXT,
ADD COLUMN     "tamanhoBytes" INTEGER;

