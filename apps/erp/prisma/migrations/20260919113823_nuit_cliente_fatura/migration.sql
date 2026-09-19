-- O NUIT do cliente congelado na factura, como o lado das compras ja faz com o
-- do fornecedor na ContaPagar.
--
-- Sem isto o mapa de clientes do ADR-0034 §8 junta-se a tabela Cliente e le o
-- NUIT ACTUAL: um NUIT que mude -- correccao de dados, reatribuicao -- faz um
-- mapa reemitido em 2031 mostrar um numero diferente do que foi entregue a AT.
-- E o que o §8 existe para impedir, e a assimetria com o mapa de fornecedores
-- tornava-a indefensavel.
--
-- Nulo para as facturas ja emitidas: nao ha como reconstituir o NUIT que o
-- cliente tinha a data. Nesses casos o mapa recorre a juncao e MARCA a linha
-- como «NUIT actual do cliente, nao o do documento» -- recorrer em silencio
-- seria manter o defeito para os dados antigos e escondê-lo.

-- AlterTable
ALTER TABLE "Fatura" ADD COLUMN     "nuitCliente" TEXT;

