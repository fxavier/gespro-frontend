-- operador_sem_admin_leitura (#76).
-- O OPERADOR recebia admin:ver_utilizadores e admin:ver_auditoria pelo sufixo de leitura
-- (isReadOnly em prisma/seed/rbac.ts). O seed só acrescenta; aqui tiram-se nos tenants que
-- já existem — só do papel de sistema (os papéis personalizados são do cliente).
DELETE FROM "RolePermission" rp
USING "Role" r, "Permission" p
WHERE rp."roleId" = r."id"
  AND rp."permissionId" = p."id"
  AND r."nome" = 'OPERADOR'
  AND r."isSystem"
  AND p."code" IN ('admin:ver_utilizadores', 'admin:ver_auditoria');
