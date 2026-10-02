-- ADR-0041 §1, §2: os tenants novos recebem a série FATURA_RECIBO e o cliente técnico
-- Consumidor Final pelo tenant-bootstrap (SERIES_INICIAIS, bootstrapConsumidorFinal);
-- os que já existem, daqui. Só dados; idempotente (ON CONFLICT DO NOTHING).
-- Valores do cliente = CLIENTE_CONSUMIDOR_FINAL (src/lib/consumidor-final.ts): alterar um é alterar os dois.

-- Série FR do ano corrente em Africa/Maputo (e do seguinte, em Dezembro — como bootstrapSeriesDocumento).
INSERT INTO "SerieDocumento"
  ("id", "tenantId", "tipo", "prefixo", "ano", "proximoNumero", "numeroInicial", "formatoNumero", "ativo", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'FATURA_RECIBO'::"TipoSerieDocumento", 'FR', a.ano, 1, 1,
       '{prefixo}/{ano}/{numero:06}', true, now(), now()
FROM "Tenant" t
CROSS JOIN (
  SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Africa/Maputo'))::int AS ano
  UNION ALL
  SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Africa/Maputo'))::int + 1
  WHERE EXTRACT(MONTH FROM (now() AT TIME ZONE 'Africa/Maputo')) = 12
) a
ON CONFLICT DO NOTHING;

-- Cliente técnico Consumidor Final.
INSERT INTO "Cliente"
  ("id", "tenantId", "codigo", "nome", "tipo", "nuit", "email", "telefone", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'CF-000000', 'Consumidor Final', 'FISICA'::"TipoCliente", '999999999', '', '', now(), now()
FROM "Tenant" t
ON CONFLICT DO NOTHING;
