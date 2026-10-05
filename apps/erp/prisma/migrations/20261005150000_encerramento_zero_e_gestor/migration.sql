-- encerramento_zero_e_gestor (#366).
-- 1. Um exercício sem resultado encerra sem lançamentos: as referências passam a opcionais.
-- AlterTable
ALTER TABLE "EncerramentoExercicio" ALTER COLUMN "lancamentoResultadosId" DROP NOT NULL,
ALTER COLUMN "lancamentoLiquidoId" DROP NOT NULL;


-- 2. O GESTOR recebia financas:exercicio:abrir por omissão (não estava na lista restrita).
--    O seed só acrescenta; aqui tira-se nos tenants que já existem — só dos papéis de sistema
--    (os papéis personalizados são do cliente).
DELETE FROM "RolePermission" rp
USING "Role" r, "Permission" p
WHERE rp."roleId" = r."id"
  AND rp."permissionId" = p."id"
  AND r."nome" = 'GESTOR'
  AND r."isSystem"
  AND p."code" = 'financas:exercicio:abrir';
