-- ADR-0034 §1 — o bloco fiscal do documento do fornecedor na ContaPagar.
--
-- É o que faz nascer o IVA dedutível: até aqui o GestPro liquidava IVA e nunca o
-- apurava, porque o lado das compras só lançava na liquidação (D 421 / C 121) e
-- as contas 4432x do plano nunca eram tocadas.
--
-- Todas as colunas nascem NULAS, e é deliberado: o IVA dedutível do passado NÃO
-- é reconstituível — não há, nos dados já gravados, documento com base e
-- imposto. Um valor por omissão aqui fingiria um direito à dedução que nenhum
-- documento suporta. O primeiro apuramento de cada tenant parte de saldos de
-- abertura de IVA lançados à mão, e isso é dito no ecrã, não escondido.

-- CreateEnum
CREATE TYPE "TipoAquisicaoIva" AS ENUM ('INVENTARIOS', 'ATIVOS', 'OUTROS_BENS_SERVICOS');

-- AlterTable
ALTER TABLE "ContaPagar" ADD COLUMN     "baseIva" DECIMAL(18,2),
ADD COLUMN     "dataDocumento" TIMESTAMP(3),
ADD COLUMN     "nuitFornecedor" TEXT,
ADD COLUMN     "numeroDocumento" TEXT,
ADD COLUMN     "taxaIva" DECIMAL(9,6),
ADD COLUMN     "tipoAquisicao" "TipoAquisicaoIva",
ADD COLUMN     "valorIva" DECIMAL(18,2);

