-- assinatura_tenants_anteriores (#429).
-- Os tenants anteriores à spec 19 (o `demo` incluído) não têm `Assinatura`. O `auth` e os
-- limites do plano tratam-nos como abertos e sem limites, mas `listarTenantsComAcesso`
-- (crons `transporte-alertas` e `abrir-exercicio`) só parte das assinaturas — e ignorava-os.
-- Recebem a Assinatura que preserva o acesso actual: ATIVA (estadoDeAcesso = aberto) no plano
-- EMPRESARIAL (limites -1 em lib/planos.ts: limiteDoPlano devolve null, como sem Assinatura).
-- Sem Stripe nem leituraFim; os crons de subscrição só movem TRIAL/LEITURA vencidas.
-- O seed (prisma/seed/plataforma.ts) cria a mesma para o demo.
-- Assinaturas já existentes não mudam. Idempotente.
INSERT INTO "Assinatura" (
  "id", "tenantId", "planoAssinatura", "estado",
  "trialInicio", "trialFim", "dataAtivacao", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text, t."id", 'EMPRESARIAL', 'ATIVA',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE NOT EXISTS (SELECT 1 FROM "Assinatura" a WHERE a."tenantId" = t."id")
ON CONFLICT DO NOTHING;
