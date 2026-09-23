-- A base tributável vem dos documentos; o imposto vem do razão. É no apuramento
-- que as duas fontes se encontram pela primeira e única vez, e por isso é aqui
-- — e em mais lado nenhum do sistema — que se pode verificar se concordam.
--
-- `taxaAplicada` guarda a taxa usada; `divergenciaBase` guarda o que sobra de
-- `base x taxa - imposto do razao`. Fora da tolerancia de arredondamento, a
-- divergencia significa documento sem lancamento, lancamento manual sem
-- documento, ou taxa mal gravada. Grava-se e mostra-se no mapa como aviso, em
-- vez de recusar o apuramento: o numero declarado sai do razao de qualquer
-- forma, e recusar por causa de uma coluna informativa impediria apurar um
-- periodo contabilisticamente certo. O que nao se faz e deixa-la desaparecer.

-- AlterTable
ALTER TABLE "LinhaApuramentoIva" ADD COLUMN     "divergenciaBase" DECIMAL(18,2),
ADD COLUMN     "taxaAplicada" DECIMAL(9,6);

