-- AlterTable
ALTER TABLE "SerieDocumento" ADD COLUMN     "numeroInicial" INTEGER NOT NULL DEFAULT 1;


-- #149, invariante S1: no máximo uma série activa por (tenant, tipo, ano).
-- Rede de segurança do serviço (que verifica sob tranca). Escrito à mão: o
-- Prisma não modela índices parciais. Verificado a 2026-09-26: zero duplicados.
CREATE UNIQUE INDEX "SerieDocumento_activa_unica" ON "SerieDocumento"("tenantId", "tipo", "ano") WHERE "ativo";
