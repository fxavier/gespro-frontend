-- aplicacao_resultado (ADR-0035 §5, #364).

-- CreateTable
CREATE TABLE "AplicacaoResultado" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exercicioId" TEXT NOT NULL,
    "exercicioDestinoId" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "dataDeliberacao" TIMESTAMP(3) NOT NULL,
    "referenciaActa" TEXT NOT NULL,
    "anuladaEm" TIMESTAMP(3),
    "motivoAnulacao" TEXT,
    "lancamentoAnulacaoId" TEXT,
    "anuladaPorId" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "keycloakSub" TEXT NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AplicacaoResultado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AplicacaoResultado_tenantId_exercicioId_idx" ON "AplicacaoResultado"("tenantId", "exercicioId");

-- CreateIndex
CREATE INDEX "AplicacaoResultado_tenantId_exercicioDestinoId_idx" ON "AplicacaoResultado"("tenantId", "exercicioDestinoId");

-- AddForeignKey
ALTER TABLE "AplicacaoResultado" ADD CONSTRAINT "AplicacaoResultado_exercicioId_fkey" FOREIGN KEY ("exercicioId") REFERENCES "ExercicioContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Dados: 59 (resultados transitados) passa de FIN-02 para OP-00, ao lado da 88 — a
-- aplicação 88 → 59 fica neutra numa só linha da DFC (docs/handoff/dfc-seed.md, #364).
-- Espelho de rubricas-fluxo-caixa.json (tenant-bootstrap) para os tenants existentes.
-- ---------------------------------------------------------------------------
-- Só a omissão semeada (FIN-02) muda: um mapeamento que o ADMIN tenha escolhido fica.
UPDATE "MapeamentoContaFluxo" m
SET "rubricaId" = r_op."id", "updatedAt" = now()
FROM "ContaPGC" c, "RubricaFluxoCaixa" r_op, "RubricaFluxoCaixa" r_fin
WHERE m."contaId" = c."id"
  AND c."codigo" = '59'
  AND r_op."tenantId" = m."tenantId" AND r_op."codigo" = 'OP-00' AND r_op."deletedAt" IS NULL
  AND r_fin."tenantId" = m."tenantId" AND r_fin."codigo" = 'FIN-02'
  AND m."rubricaId" = r_fin."id";

-- O mapeamento mudou → versão nova PENDING com o instantâneo vivo (ADR-0037 E1, V2), na
-- forma canónica da 22c; só onde o último instantâneo ainda tem a 59 noutra rubrica.
INSERT INTO "VersaoMapeamentoFluxo" ("id", "tenantId", "numero", "estado", "instantaneo", "createdAt")
SELECT gen_random_uuid()::text, t."id",
  (SELECT max(v."numero") + 1 FROM "VersaoMapeamentoFluxo" v WHERE v."tenantId" = t."id"),
  'PENDING'::"EstadoVersaoMapeamento",
  jsonb_build_object(
    'rubricas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r."id", 'codigo', r."codigo", 'designacao', r."designacao",
               'atividade', r."atividade", 'sinal', r."sinal", 'ordem', r."ordem",
               'origem', r."origem", 'ativo', r."ativo")
             ORDER BY r."codigo" COLLATE "C", r."id" COLLATE "C")
      FROM "RubricaFluxoCaixa" r WHERE r."tenantId" = t."id" AND r."deletedAt" IS NULL), '[]'::jsonb),
    'mapeamentos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('contaId', m."contaId", 'rubricaId', m."rubricaId")
             ORDER BY m."contaId" COLLATE "C", m."rubricaId" COLLATE "C")
      FROM "MapeamentoContaFluxo" m WHERE m."tenantId" = t."id"), '[]'::jsonb)
  ),
  now()
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "VersaoMapeamentoFluxo" v WHERE v."tenantId" = t."id")
  AND EXISTS (
    SELECT 1 FROM "MapeamentoContaFluxo" m
    JOIN "ContaPGC" c ON c."id" = m."contaId" AND c."codigo" = '59'
    WHERE m."tenantId" = t."id"
      AND NOT EXISTS (
        SELECT 1 FROM "VersaoMapeamentoFluxo" v
        WHERE v."tenantId" = t."id"
          AND v."numero" = (SELECT max(v2."numero") FROM "VersaoMapeamentoFluxo" v2 WHERE v2."tenantId" = t."id")
          AND v."instantaneo"->'mapeamentos' @> jsonb_build_array(jsonb_build_object('contaId', m."contaId", 'rubricaId', m."rubricaId"))))
ON CONFLICT ("tenantId", "numero") DO NOTHING;
