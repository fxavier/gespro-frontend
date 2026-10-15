-- acao_auditoria_plataforma_enum (#534, ADR-0049 §5).
-- `AuditoriaPlataforma.acao` passa de texto ao enum, sem perda: os literais gravados são
-- exactamente os valores do tipo. Escrita à mão (o `migrate diff` faria DROP + ADD da coluna).

-- CreateEnum
CREATE TYPE "AcaoAuditoriaPlataforma" AS ENUM ('CRIAR', 'ACTUALIZAR', 'ARQUIVAR', 'DESARQUIVAR', 'APAGAR');

-- AlterTable
ALTER TABLE "AuditoriaPlataforma" ALTER COLUMN "acao" TYPE "AcaoAuditoriaPlataforma" USING "acao"::"AcaoAuditoriaPlataforma";
