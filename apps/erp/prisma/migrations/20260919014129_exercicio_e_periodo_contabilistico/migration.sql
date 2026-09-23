-- ADR-0033 §1 — ExercicioContabil, PeriodoContabil e ReaberturaPeriodo.
--
-- `Lancamento.periodoId` é obrigatório no schema mas NÃO pode nascer NOT NULL:
-- há lançamentos gravados. Nasce nulo, é preenchido a partir de `periodoFiscal`,
-- e só depois passa a NOT NULL — os três tempos estão marcados abaixo.
--
-- As fronteiras de exercício e de período são instantes de `Africa/Maputo`
-- convertidos para UTC pelo `AT TIME ZONE` do Postgres, e não por um `+2` escrito
-- à mão: o fuso do facto fiscal é moçambicano (ADR-0033 §2) e a base guarda UTC.

-- CreateEnum
CREATE TYPE "EstadoExercicio" AS ENUM ('ABERTO', 'EM_ENCERRAMENTO', 'ENCERRADO_PROVISORIO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "EstadoPeriodo" AS ENUM ('ABERTO', 'FECHADO');

-- CreateTable
CREATE TABLE "ExercicioContabil" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoExercicio" NOT NULL DEFAULT 'ABERTO',
    "anteriorId" TEXT,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExercicioContabil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodoContabil" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exercicioId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoPeriodo" NOT NULL DEFAULT 'ABERTO',
    "fechadoEm" TIMESTAMP(3),
    "fechadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeriodoContabil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReaberturaPeriodo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "reabertoPorId" TEXT NOT NULL,
    "keycloakSub" TEXT NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReaberturaPeriodo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExercicioContabil_tenantId_estado_idx" ON "ExercicioContabil"("tenantId", "estado");
CREATE INDEX "ExercicioContabil_tenantId_anteriorId_idx" ON "ExercicioContabil"("tenantId", "anteriorId");
CREATE UNIQUE INDEX "ExercicioContabil_tenantId_codigo_key" ON "ExercicioContabil"("tenantId", "codigo");
CREATE INDEX "PeriodoContabil_tenantId_exercicioId_ordem_idx" ON "PeriodoContabil"("tenantId", "exercicioId", "ordem");
CREATE INDEX "PeriodoContabil_tenantId_estado_idx" ON "PeriodoContabil"("tenantId", "estado");
CREATE UNIQUE INDEX "PeriodoContabil_tenantId_codigo_key" ON "PeriodoContabil"("tenantId", "codigo");
CREATE INDEX "ReaberturaPeriodo_tenantId_periodoId_idx" ON "ReaberturaPeriodo"("tenantId", "periodoId");
CREATE INDEX "ReaberturaPeriodo_tenantId_createdAt_idx" ON "ReaberturaPeriodo"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "PeriodoContabil" ADD CONSTRAINT "PeriodoContabil_exercicioId_fkey" FOREIGN KEY ("exercicioId") REFERENCES "ExercicioContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReaberturaPeriodo" ADD CONSTRAINT "ReaberturaPeriodo_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "PeriodoContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- TEMPO 1 — a coluna nasce NULA
-- ---------------------------------------------------------------------------
ALTER TABLE "Lancamento" ADD COLUMN "periodoId" TEXT;

-- ---------------------------------------------------------------------------
-- TEMPO 2 — backfill a partir dos `periodoFiscal` já gravados
-- ---------------------------------------------------------------------------

-- Um exercício por (tenant, ano) presente nos lançamentos. Ficam ABERTO: nunca
-- nada foi encerrado neste produto, e declarar o histórico como fechado seria
-- inventar um acto contabilístico que não houve.
INSERT INTO "ExercicioContabil" ("id", "tenantId", "codigo", "dataInicio", "dataFim", "estado", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  t."tenantId",
  t.ano,
  ((t.ano || '-01-01 00:00:00')::timestamp AT TIME ZONE 'Africa/Maputo') AT TIME ZONE 'UTC',
  ((((t.ano::int + 1)::text || '-01-01 00:00:00')::timestamp) AT TIME ZONE 'Africa/Maputo') AT TIME ZONE 'UTC' - interval '1 millisecond',
  'ABERTO',
  now(),
  now()
FROM (SELECT DISTINCT "tenantId", substring("periodoFiscal" from 1 for 4) AS ano FROM "Lancamento") t
ON CONFLICT ("tenantId", "codigo") DO NOTHING;

-- Encadeia cada exercício ao anterior do mesmo tenant (ADR-0033 §1).
UPDATE "ExercicioContabil" e
SET "anteriorId" = a."id"
FROM "ExercicioContabil" a
WHERE a."tenantId" = e."tenantId"
  AND a."codigo" = (e."codigo"::int - 1)::text;

-- Os treze períodos de cada exercício (1..12 meses + 13 encerramento, ADR-0035 §2).
-- Criam-se todos, e não só os que têm movimento: um exercício com buracos obriga
-- o serviço a distinguir «período que não existe» de «período sem lançamentos»,
-- e essa distinção não tem significado contabilístico nenhum.
INSERT INTO "PeriodoContabil" ("id", "tenantId", "exercicioId", "ordem", "codigo", "dataInicio", "dataFim", "estado", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  e."tenantId",
  e."id",
  m.ordem,
  e."codigo" || '-' || lpad(m.ordem::text, 2, '0'),
  CASE WHEN m.ordem = 13
    THEN e."dataFim"
    ELSE (((e."codigo" || '-' || lpad(m.ordem::text, 2, '0') || '-01 00:00:00')::timestamp) AT TIME ZONE 'Africa/Maputo') AT TIME ZONE 'UTC'
  END,
  CASE WHEN m.ordem = 13
    THEN e."dataFim"
    ELSE (((e."codigo" || '-' || lpad(m.ordem::text, 2, '0') || '-01 00:00:00')::timestamp + interval '1 month') AT TIME ZONE 'Africa/Maputo') AT TIME ZONE 'UTC' - interval '1 millisecond'
  END,
  'ABERTO',
  now(),
  now()
FROM "ExercicioContabil" e
CROSS JOIN generate_series(1, 13) AS m(ordem)
ON CONFLICT ("tenantId", "codigo") DO NOTHING;

-- Liga cada lançamento ao seu período. `periodoFiscal` é a chave natural.
UPDATE "Lancamento" l
SET "periodoId" = p."id"
FROM "PeriodoContabil" p
WHERE p."tenantId" = l."tenantId"
  AND p."codigo" = l."periodoFiscal"
  AND l."periodoId" IS NULL;

-- Guarda explícita: um backfill incompleto tem de falhar por palavras, e não
-- pelo erro opaco do NOT NULL a seguir.
DO $$
DECLARE orfaos bigint;
BEGIN
  SELECT count(*) INTO orfaos FROM "Lancamento" WHERE "periodoId" IS NULL;
  IF orfaos > 0 THEN
    RAISE EXCEPTION 'Backfill incompleto: % lançamento(s) sem período correspondente em PeriodoContabil', orfaos;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- TEMPO 3 — a coluna passa a obrigatória
-- ---------------------------------------------------------------------------
ALTER TABLE "Lancamento" ALTER COLUMN "periodoId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Lancamento_tenantId_periodoId_idx" ON "Lancamento"("tenantId", "periodoId");

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "PeriodoContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
