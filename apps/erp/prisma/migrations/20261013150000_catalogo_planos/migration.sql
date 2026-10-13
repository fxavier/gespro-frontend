-- catalogo_planos (#524, ADR-0049 §1–§4).
-- O catálogo de planos sai da constante `lib/planos.ts` + enum `PlanoAssinatura` para a tabela
-- global `Plano` (sem tenantId). Escrita à mão: o `migrate diff` faria DROP + ADD da coluna
-- `Assinatura.planoAssinatura` e perderia o plano de todas as assinaturas.

-- 1. Tabela do catálogo.
CREATE TABLE "Plano" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "precoMensalUsd" DECIMAL(12,2) NOT NULL,
    "precoAnualUsd" DECIMAL(12,2) NOT NULL,
    "stripePriceIdMensal" TEXT,
    "stripePriceIdAnual" TEXT,
    "limiteUtilizadores" INTEGER NOT NULL,
    "limiteArmazens" INTEGER NOT NULL,
    "suporte" TEXT NOT NULL,
    "funcionalidades" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "destaque" BOOLEAN NOT NULL DEFAULT false,
    "arquivadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plano_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Plano_codigo_key" ON "Plano"("codigo");
CREATE INDEX "Plano_arquivadoEm_ordem_idx" ON "Plano"("arquivadoEm", "ordem");

-- 2. Os três planos de origem, com os valores de hoje de `lib/planos.ts`. Price IDs vazios: os
--    três continuam a resolver pela env `STRIPE_PRICE_<CODIGO>_<CICLO>` (ADR-0049 §4).
INSERT INTO "Plano" (
  "id", "codigo", "nome", "descricao", "precoMensalUsd", "precoAnualUsd",
  "limiteUtilizadores", "limiteArmazens", "suporte", "funcionalidades",
  "ordem", "destaque", "createdAt", "updatedAt"
) VALUES
  (gen_random_uuid()::text, 'BASICO', 'Básico',
   'Para empresas em arranque que precisam de facturação e stock.', 29.00, 290.00,
   3, 1, 'Email (48h)', ARRAY['Facturação', 'Gestão de stock']::TEXT[],
   10, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'PROFISSIONAL', 'Profissional',
   'Contabilidade PGC-NIRF completa, compras e recursos humanos.', 79.00, 790.00,
   15, 5, 'Email + telefone (24h)',
   ARRAY['Contabilidade PGC-NIRF completa', 'Compras', 'Recursos humanos']::TEXT[],
   20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'EMPRESARIAL', 'Empresarial',
   'Multi-armazém, produção, projectos e apoio dedicado.', 199.00, 1990.00,
   -1, -1, 'Gestor de conta dedicado (4h)',
   ARRAY['Multi-armazém', 'Produção', 'Projectos', 'Apoio dedicado']::TEXT[],
   30, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO NOTHING;

-- 3. Assinatura.planoAssinatura: enum → TEXT, preservando o valor; sem omissão.
ALTER TABLE "Assinatura" ALTER COLUMN "planoAssinatura" DROP DEFAULT;
ALTER TABLE "Assinatura" ALTER COLUMN "planoAssinatura" TYPE TEXT USING "planoAssinatura"::text;

-- 4. A cópia na ConfiguracaoFiscal sai (ADR-0027 §5).
ALTER TABLE "ConfiguracaoFiscal" DROP COLUMN "planoAssinatura";

-- 5. O enum fica sem colunas.
DROP TYPE "PlanoAssinatura";

-- 6. FK Restrict nos dois sentidos para o código do plano.
CREATE INDEX "Assinatura_planoAssinatura_idx" ON "Assinatura"("planoAssinatura");
ALTER TABLE "Assinatura" ADD CONSTRAINT "Assinatura_planoAssinatura_fkey" FOREIGN KEY ("planoAssinatura") REFERENCES "Plano"("codigo") ON DELETE RESTRICT ON UPDATE RESTRICT;
