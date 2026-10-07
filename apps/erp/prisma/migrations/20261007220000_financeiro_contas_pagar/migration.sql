-- financeiro_contas_pagar (#113).
-- O FINANCEIRO não podia registar pagamentos a fornecedores nem criar/cancelar contas a
-- pagar (só ADMIN e GESTOR). O seed passa a ligá-las (prisma/seed/rbac.ts); aqui liga-se nos
-- tenants que já existem — só ao papel de sistema (os personalizados são do cliente).
-- Idempotente.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."nome" = 'FINANCEIRO'
  AND r."isSystem"
  AND p."code" IN ('compras:pagamento:registar', 'compras:conta-pagar:criar', 'compras:conta-pagar:cancelar')
ON CONFLICT DO NOTHING;
