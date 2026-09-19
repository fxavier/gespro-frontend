-- ADR-0034 §2, §7 e §9 — o apuramento periódico do IVA.
--
-- Até aqui o GestPro liquidava IVA e nunca o apurava: 44331 crescia
-- indefinidamente do lado credor, o balanço nunca mostrava «IVA a pagar», e o
-- cliente preenchia a Declaração Periódica à mão a partir de um mapa que o
-- produto não emitia.
--
-- `ApuramentoIva` é APPEND-ONLY. Corrige-se por versão nova (estorno do
-- lançamento + `versao + 1`), nunca por UPDATE dos valores — é o mesmo
-- princípio dos documentos fiscais emitidos. O `@@unique(tenantId, periodoId,
-- versao)` é o que o garante do lado da base.
--
-- As linhas guardam o código E O NOME da conta à data, e não uma FK para
-- ContaPGC: o nome é mutável, e um mapa reemitido em 2031 sobre o período de
-- 2026 tem de devolver o que a declaração entregue ao Estado dizia. É a mesma
-- razão pela qual o ADR-0033 §8.2 manda fotografar o balancete no fecho.
--
-- `baseImponivel` é nulo para 4434x, 4435, 4437 e 4438: essas contas não têm
-- base tributável. Para as outras, a base vem dos documentos de origem e é
-- congelada aqui — o IMPOSTO continua a sair do razão, que é o que a AT examina.

-- CreateEnum
CREATE TYPE "EstadoApuramentoIva" AS ENUM ('APURADO', 'ESTORNADO', 'DECLARADO');

-- CreateTable
CREATE TABLE "ApuramentoIva" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "estado" "EstadoApuramentoIva" NOT NULL DEFAULT 'APURADO',
    "lancamentoId" TEXT,
    "totalIvaLiquidado" DECIMAL(18,2) NOT NULL,
    "totalIvaDedutivel" DECIMAL(18,2) NOT NULL,
    "totalRegularizacoes" DECIMAL(18,2) NOT NULL,
    "saldoApuramento" DECIMAL(18,2) NOT NULL,
    "creditoReportado" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "declaradoPorId" TEXT,
    "declaradoEm" TIMESTAMP(3),
    "referenciaEntrega" TEXT,
    "apuradoPorId" TEXT NOT NULL,
    "keycloakSub" TEXT NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApuramentoIva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinhaApuramentoIva" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "apuramentoId" TEXT NOT NULL,
    "contaCodigo" TEXT NOT NULL,
    "contaNome" TEXT NOT NULL,
    "tipoMovimento" "TipoPartida" NOT NULL,
    "baseImponivel" DECIMAL(18,2),
    "valorImposto" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "LinhaApuramentoIva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApuramentoIva_tenantId_periodoId_idx" ON "ApuramentoIva"("tenantId", "periodoId");

-- CreateIndex
CREATE INDEX "ApuramentoIva_tenantId_estado_idx" ON "ApuramentoIva"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "ApuramentoIva_tenantId_createdAt_idx" ON "ApuramentoIva"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApuramentoIva_tenantId_periodoId_versao_key" ON "ApuramentoIva"("tenantId", "periodoId", "versao");

-- CreateIndex
CREATE INDEX "LinhaApuramentoIva_tenantId_apuramentoId_idx" ON "LinhaApuramentoIva"("tenantId", "apuramentoId");

-- AddForeignKey
ALTER TABLE "ApuramentoIva" ADD CONSTRAINT "ApuramentoIva_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "PeriodoContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaApuramentoIva" ADD CONSTRAINT "LinhaApuramentoIva_apuramentoId_fkey" FOREIGN KEY ("apuramentoId") REFERENCES "ApuramentoIva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

