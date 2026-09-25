-- AlterEnum
ALTER TYPE "TipoContaBancaria" ADD VALUE 'CARTEIRA_MOVEL';

-- AlterEnum
ALTER TYPE "TipoMovimentoCaixa" ADD VALUE 'PAGAMENTO';


-- Conta de movimento 111 Caixa (issue #78, D1): a 11 é agregadora e não aceita
-- lançamentos, por isso ninguém conseguia lançar em caixa. Os tenants futuros
-- recebem-na do plano-contas-pgc.json via tenant-bootstrap; os existentes, daqui.
-- id em uuid, como o bootstrap faz às contas PGC.
INSERT INTO "ContaPGC" ("id", "tenantId", "codigo", "nome", "classe", "tipo", "natureza", "nivel",
                        "contaMaeId", "aceitaLancamento", "ativo", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, m."tenantId", '111', 'Caixa', 'CLASSE_1', 'ATIVO', 'DEVEDORA', 3,
       m."id", true, true, now(), now()
FROM "ContaPGC" m
WHERE m."codigo" = '11'
ON CONFLICT ("tenantId", "codigo") DO NOTHING;
