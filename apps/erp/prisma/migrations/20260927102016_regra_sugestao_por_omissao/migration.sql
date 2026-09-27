-- Issue #140: a regra de sugestão por omissão passou para o tenant-bootstrap
-- (bootstrapRegrasSugestao). Os tenants que já existem e não têm nenhuma regra
-- recebem-na aqui, nas mesmas condições: 6981 folha e activa no plano do tenant.
-- Só dados; idempotente (NOT EXISTS por tenant).
INSERT INTO "RegraSugestaoLancamento"
  ("id", "tenantId", "contaBancariaId", "padrao", "natureza", "contaContrapartidaId", "descricao", "prioridade", "ativo", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."tenantId", NULL, 'COMISSAO|ENCARGO|TAXA|IMPOSTO DE SELO|MANUTENCAO',
       'CREDITO'::"TipoPartida", c."id", 'Comissões e encargos bancários', 100, true, now(), now()
FROM "ContaPGC" c
WHERE c."codigo" = '6981' AND c."aceitaLancamento" AND c."ativo"
  AND NOT EXISTS (SELECT 1 FROM "RegraSugestaoLancamento" r WHERE r."tenantId" = c."tenantId");
