-- operador_sem_financas_exportar (#299).
-- O OPERADOR recebia financas:exportar pelo sufixo `:exportar` (isReadOnly em
-- prisma/seed/rbac.ts) e exportava balancete, balanço, DRE, DFC e os documentos do
-- encerramento. O seed só acrescenta; aqui tira-se nos tenants que já existem — só do papel
-- de sistema (os papéis personalizados são do cliente). Idempotente.
DELETE FROM "RolePermission" rp
USING "Role" r, "Permission" p
WHERE rp."roleId" = r."id"
  AND rp."permissionId" = p."id"
  AND r."nome" = 'OPERADOR'
  AND r."isSystem"
  AND p."code" = 'financas:exportar';
