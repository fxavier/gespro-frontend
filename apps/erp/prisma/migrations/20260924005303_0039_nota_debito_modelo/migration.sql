-- CreateEnum
CREATE TYPE "TipoDocumentoContaPagar" AS ENUM ('FACTURA', 'NOTA_DEBITO', 'NOTA_CREDITO');

-- CreateEnum
CREATE TYPE "NaturezaNotaDebito" AS ENUM ('ACERTO_PRECO', 'JUROS_MORA', 'DESPESAS_REPERCUTIDAS', 'PENALIZACAO', 'OUTRO');

-- AlterTable
ALTER TABLE "ContaPagar" ADD COLUMN     "contaPagarOrigemId" TEXT,
ADD COLUMN     "motivo" TEXT,
ADD COLUMN     "tipoDocumento" "TipoDocumentoContaPagar" NOT NULL DEFAULT 'FACTURA';

-- AlterTable
ALTER TABLE "LinhaFatura" ADD COLUMN     "motivoIsencao" TEXT;

-- AlterTable
ALTER TABLE "LinhaNotaCredito" ADD COLUMN     "motivoIsencao" TEXT;

-- AlterTable
ALTER TABLE "LinhaNotaDebito" ADD COLUMN     "motivoIsencao" TEXT;

-- AlterTable
ALTER TABLE "NotaCredito" ADD COLUMN     "motivoCancelamento" TEXT;

-- AlterTable
ALTER TABLE "NotaDebito" ADD COLUMN     "contaCreditoId" TEXT,
ADD COLUMN     "motivoCancelamento" TEXT,
ADD COLUMN     "natureza" "NaturezaNotaDebito" NOT NULL DEFAULT 'ACERTO_PRECO';

-- CreateTable
CREATE TABLE "ContaNaturezaNotaDebito" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "natureza" "NaturezaNotaDebito" NOT NULL,
    "contaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContaNaturezaNotaDebito_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContaNaturezaNotaDebito_tenantId_natureza_key" ON "ContaNaturezaNotaDebito"("tenantId", "natureza");

-- CreateIndex
CREATE INDEX "ContaPagar_tenantId_tipoDocumento_idx" ON "ContaPagar"("tenantId", "tipoDocumento");

-- CreateIndex
CREATE INDEX "ContaPagar_contaPagarOrigemId_idx" ON "ContaPagar"("contaPagarOrigemId");


-- ADR-0039 §1 — omissão da conta de crédito por natureza nos tenants que JÁ existem
-- (os novos recebem-na de `bootstrapContasNaturezaNotaDebito`, no provisionamento).
-- Mesmos códigos que `CONTA_PADRAO_NATUREZA_ND` (src/lib/nota-debito.ts). Um tenant sem
-- a conta no plano fica sem a linha: a natureza passa a exigir escolha no acto, e não
-- se inventa uma conta.
INSERT INTO "ContaNaturezaNotaDebito" ("id", "tenantId", "natureza", "contaId", "updatedAt")
SELECT gen_random_uuid()::text, c."tenantId", m.natureza::"NaturezaNotaDebito", c."id", CURRENT_TIMESTAMP
FROM "ContaPGC" c
JOIN (VALUES ('ACERTO_PRECO', '711'), ('JUROS_MORA', '781'), ('PENALIZACAO', '769')) AS m(natureza, codigo)
  ON m.codigo = c."codigo"
WHERE c."aceitaLancamento" = true AND c."ativo" = true
ON CONFLICT ("tenantId", "natureza") DO NOTHING;
