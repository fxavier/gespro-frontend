-- #331: os tenants novos recebem a série TROCA pelo tenant-bootstrap (SERIES_INICIAIS);
-- os que já existem, daqui. Só dados; idempotente (ON CONFLICT DO NOTHING).

-- Série TROCA do ano corrente em Africa/Maputo (e do seguinte, em Dezembro — como bootstrapSeriesDocumento).
INSERT INTO "SerieDocumento"
  ("id", "tenantId", "tipo", "prefixo", "ano", "proximoNumero", "numeroInicial", "formatoNumero", "ativo", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'TROCA'::"TipoSerieDocumento", 'TRC', a.ano, 1, 1,
       '{prefixo}/{ano}/{numero:06}', true, now(), now()
FROM "Tenant" t
CROSS JOIN (
  SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Africa/Maputo'))::int AS ano
  UNION ALL
  SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Africa/Maputo'))::int + 1
  WHERE EXTRACT(MONTH FROM (now() AT TIME ZONE 'Africa/Maputo')) = 12
) a
ON CONFLICT DO NOTHING;
