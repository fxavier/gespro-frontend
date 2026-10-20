-- #567 — recepção parcial: dívida por recepção, fecho em falta e CP única por recepção.
--
-- 1. Estado novo do pedido, terminal a partir de RECEBIDO_PARCIAL. Não é usado neste ficheiro
--    (um valor acabado de criar por ALTER TYPE … ADD VALUE não se usa na mesma transacção),
--    por isso basta uma migração.
ALTER TYPE "StatusPedidoCompra" ADD VALUE 'FECHADO_EM_FALTA' BEFORE 'CANCELADO';

-- 2. Motivo do fecho em falta.
ALTER TABLE "PedidoCompra" ADD COLUMN "motivoFecho" TEXT;

-- 3. Uma conta a pagar por recepção: FK única para a recepção que a gerou.
--    Nulo nas contas manuais e nas históricas (criadas no RECEBIDO_TOTAL antes do #567).
ALTER TABLE "ContaPagar" ADD COLUMN "recebimentoCompraId" TEXT;

CREATE UNIQUE INDEX "ContaPagar_recebimentoCompraId_key" ON "ContaPagar"("recebimentoCompraId");

ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_recebimentoCompraId_fkey" FOREIGN KEY ("recebimentoCompraId") REFERENCES "RecebimentoCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;
