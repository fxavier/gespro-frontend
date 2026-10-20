-- #566 — ContaPagar guarda o lançamento de reconhecimento e o motivo do cancelamento.
ALTER TABLE "ContaPagar" ADD COLUMN "lancamentoId" TEXT,
ADD COLUMN "motivoCancelamento" TEXT;

CREATE INDEX "ContaPagar_lancamentoId_idx" ON "ContaPagar"("lancamentoId");

-- Backfill: o reconhecimento é o lançamento que `lancarReconhecimentoDivida` grava com
-- origem COMPRA, documentoOrigemTipo 'ContaPagar' e documentoOrigemId = id da conta.
-- Os pagamentos apontam para o Pagamento (origem PAGAMENTO) e os estornos para o
-- Lancamento original (documentoOrigemTipo 'Lancamento'), por isso não casam.
-- DISTINCT ON garante um só por conta, o mais antigo, mesmo que houvesse repetidos.
UPDATE "ContaPagar" cp
SET "lancamentoId" = r.id
FROM (
  SELECT DISTINCT ON (l."tenantId", l."documentoOrigemId") l.id, l."tenantId", l."documentoOrigemId"
  FROM "Lancamento" l
  WHERE l."origem" = 'COMPRA'
    AND l."documentoOrigemTipo" = 'ContaPagar'
    AND l."lancamentoEstornoId" IS NULL
  ORDER BY l."tenantId", l."documentoOrigemId", l."createdAt" ASC, l.id ASC
) r
WHERE r."tenantId" = cp."tenantId"
  AND r."documentoOrigemId" = cp.id
  AND cp."lancamentoId" IS NULL;
