-- rbac_inventario_ativos (#124).
-- O OPERADOR recebia inventario:admin pelo startsWith('inventario:') do seed e não tinha
-- ativos:write; o GESTOR não tinha inventario:admin. O seed passa a dar inventario:admin a
-- ADMIN/GESTOR e ativos:write ao OPERADOR (prisma/seed/rbac.ts); aqui corrige-se os tenants
-- que já existem — só nos papéis de sistema (os personalizados são do cliente).
-- Idempotente.
DELETE FROM "RolePermission" rp
USING "Role" r, "Permission" p
WHERE rp."roleId" = r."id"
  AND rp."permissionId" = p."id"
  AND r."nome" = 'OPERADOR'
  AND r."isSystem"
  AND p."code" = 'inventario:admin';

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."nome" = 'OPERADOR'
  AND r."isSystem"
  AND p."code" = 'ativos:write'
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."nome" = 'GESTOR'
  AND r."isSystem"
  AND p."code" = 'inventario:admin'
ON CONFLICT DO NOTHING;
