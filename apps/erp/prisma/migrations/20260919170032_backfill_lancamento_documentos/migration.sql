-- Religa os documentos fiscais ao lançamento que já os representa no razão.
--
-- `emitirFatura`, `emitirNotaCredito` e `emitirNotaDebito` criavam o lançamento
-- e deitavam fora o valor devolvido: a coluna `lancamentoId` existia e nunca era
-- preenchida. No tenant de demonstração: 110 facturas, 0 ligadas, e 110
-- lançamentos de origem `Fatura` no razão — os movimentos certos, sem o elo.
--
-- Não era cosmético. A quarta pré-condição do ADR-0033 §6 («todo o documento
-- fiscal emitido tem lançamento») lê exactamente esta coluna, logo falhava
-- sempre: nenhum período com facturas podia ser apurado nem fechado, e nenhum
-- exercício poderia vir a ser encerrado. Os testes passavam todos.
--
-- A ligação é reconstituível porque o lançamento guarda a sua origem, e é isso
-- que este backfill faz. `IS NULL` garante que nada já correcto é sobrescrito.

UPDATE "Fatura" f
SET "lancamentoId" = l.id
FROM "Lancamento" l
WHERE l."documentoOrigemId" = f.id
  AND l."documentoOrigemTipo" = 'Fatura'
  AND l."tenantId" = f."tenantId"
  AND f."lancamentoId" IS NULL;

UPDATE "NotaCredito" nc
SET "lancamentoId" = l.id
FROM "Lancamento" l
WHERE l."documentoOrigemId" = nc.id
  AND l."documentoOrigemTipo" = 'NotaCredito'
  AND l."tenantId" = nc."tenantId"
  AND nc."lancamentoId" IS NULL;

UPDATE "NotaDebito" nd
SET "lancamentoId" = l.id
FROM "Lancamento" l
WHERE l."documentoOrigemId" = nd.id
  AND l."documentoOrigemTipo" = 'NotaDebito'
  AND l."tenantId" = nd."tenantId"
  AND nd."lancamentoId" IS NULL;
