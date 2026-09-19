-- Calendário contabilístico configurável por tenant.
--
-- Os cinco defaults são exactamente o comportamento de hoje: abertura automática
-- ligada, a 1 de Dezembro — a mesma data que o crontab tinha fixa e global. Com
-- `NOT NULL DEFAULT`, os tenants existentes recebem-nos sem backfill: quem nunca
-- tocar no ecrã continua a ver o sistema comportar-se como antes.
--
-- `fechoPeriodoAutomatico` nasce FALSO e sem nada que o leia. A sétima
-- pré-condição de fecho do ADR-0033 §6 — apuramento do IVA feito — só existe na
-- Fase 2 (ADR-0034). Um automatismo de fecho hoje passar-lhe-ia por cima em
-- silêncio, que é o erro que o ADR-0033 abre a condenar. A coluna guarda a
-- preferência; o cron entra quando a pré-condição existir.

-- AlterTable
ALTER TABLE "ConfiguracaoFiscal" ADD COLUMN     "aberturaExercicioAutomatica" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "diaAberturaExercicio" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "diasAposFimDoMesParaFechoAutomatico" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "fechoPeriodoAutomatico" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mesAberturaExercicio" INTEGER NOT NULL DEFAULT 12;

