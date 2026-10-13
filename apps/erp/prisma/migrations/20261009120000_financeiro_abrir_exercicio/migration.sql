-- financeiro_abrir_exercicio (#143).
-- O FINANCEIRO não podia abrir o exercício contabilístico (só o ADMIN). O seed passa a
-- ligá-la (prisma/seed/rbac.ts); aqui liga-se nos tenants que já existem — só ao papel de
-- sistema (os personalizados são do cliente). Reabrir período continua só do ADMIN.
-- Idempotente.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."nome" = 'FINANCEIRO'
  AND r."isSystem"
  AND p."code" = 'financas:exercicio:abrir'
ON CONFLICT DO NOTHING;
