-- encerramento_exercicio_fundacao (ADR-0035 §3, §8; #138 N2).
-- Esquema: EncerramentoExercicio, ReaberturaExercicio e o carimbo do encerramento definitivo.

-- AlterTable
ALTER TABLE "ExercicioContabil" ADD COLUMN     "encerradoDefinitivoEm" TIMESTAMP(3),
ADD COLUMN     "encerradoDefinitivoPorId" TEXT;

-- CreateTable
CREATE TABLE "EncerramentoExercicio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exercicioId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "estimativaImposto" DECIMAL(18,2) NOT NULL,
    "lancamentoResultadosId" TEXT NOT NULL,
    "lancamentoImpostoId" TEXT,
    "lancamentoLiquidoId" TEXT NOT NULL,
    "fotografia" JSONB NOT NULL,
    "totalDebito" DECIMAL(18,2) NOT NULL,
    "totalCredito" DECIMAL(18,2) NOT NULL,
    "anuladoEm" TIMESTAMP(3),
    "encerradoPorId" TEXT NOT NULL,
    "keycloakSub" TEXT NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncerramentoExercicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReaberturaExercicio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exercicioId" TEXT NOT NULL,
    "encerramentoId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "lancamentosEstornados" TEXT[],
    "reabertoPorId" TEXT NOT NULL,
    "keycloakSub" TEXT NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReaberturaExercicio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EncerramentoExercicio_tenantId_exercicioId_idx" ON "EncerramentoExercicio"("tenantId", "exercicioId");

-- CreateIndex
CREATE UNIQUE INDEX "EncerramentoExercicio_tenantId_exercicioId_versao_key" ON "EncerramentoExercicio"("tenantId", "exercicioId", "versao");

-- CreateIndex
CREATE INDEX "ReaberturaExercicio_tenantId_exercicioId_idx" ON "ReaberturaExercicio"("tenantId", "exercicioId");

-- CreateIndex
CREATE INDEX "ReaberturaExercicio_tenantId_createdAt_idx" ON "ReaberturaExercicio"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "EncerramentoExercicio" ADD CONSTRAINT "EncerramentoExercicio_exercicioId_fkey" FOREIGN KEY ("exercicioId") REFERENCES "ExercicioContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReaberturaExercicio" ADD CONSTRAINT "ReaberturaExercicio_exercicioId_fkey" FOREIGN KEY ("exercicioId") REFERENCES "ExercicioContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReaberturaExercicio" ADD CONSTRAINT "ReaberturaExercicio_encerramentoId_fkey" FOREIGN KEY ("encerramentoId") REFERENCES "EncerramentoExercicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Dados (tenants que já existem; os novos recebem-no do plano-contas-pgc.json e
-- do rubricas-fluxo-caixa.json pelo tenant-bootstrap — alterar um é alterar os dois).
-- ---------------------------------------------------------------------------

-- 1. ADR-0035 §3: as cinco contas de resultados já são folhas; levanta-se a bandeira.
UPDATE "ContaPGC" SET "aceitaLancamento" = true, "updatedAt" = now()
WHERE "codigo" IN ('59', '81', '82', '83', '88') AND "aceitaLancamento" = false;

-- 2. DFC (I7: toda a conta que aceita lançamento tem uma rubrica). 81/82/83/88 → OP-00
--    (contas de resultados, representadas pelo resultado líquido); 59 → FIN-02 (capital
--    próprio). Ver docs/handoff/dfc-seed.md, nota de 2026-10-05.
INSERT INTO "MapeamentoContaFluxo" ("id", "tenantId", "contaId", "rubricaId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."tenantId", c."id", r."id", now(), now()
FROM (VALUES ('59', 'FIN-02'), ('81', 'OP-00'), ('82', 'OP-00'), ('83', 'OP-00'), ('88', 'OP-00')) AS m(conta, rubrica)
JOIN "ContaPGC" c ON c."codigo" = m.conta AND c."aceitaLancamento" AND c."ativo"
JOIN "RubricaFluxoCaixa" r
  ON r."tenantId" = c."tenantId" AND r."codigo" = m.rubrica AND r."deletedAt" IS NULL
ON CONFLICT ("tenantId", "contaId") DO NOTHING;

-- 3. O mapeamento mudou → versão nova PENDING com o instantâneo vivo (ADR-0037 E1, V2),
--    na forma canónica da 22c. Só para tenants que já têm versões e cujo último
--    instantâneo ainda não contém as contas novas (idempotente).
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
    JOIN "ContaPGC" c ON c."id" = m."contaId" AND c."codigo" IN ('59', '81', '82', '83', '88')
    WHERE m."tenantId" = t."id"
      AND NOT EXISTS (
        SELECT 1 FROM "VersaoMapeamentoFluxo" v
        WHERE v."tenantId" = t."id"
          AND v."numero" = (SELECT max(v2."numero") FROM "VersaoMapeamentoFluxo" v2 WHERE v2."tenantId" = t."id")
          AND v."instantaneo"->'mapeamentos' @> jsonb_build_array(jsonb_build_object('contaId', m."contaId"))))
ON CONFLICT ("tenantId", "numero") DO NOTHING;
