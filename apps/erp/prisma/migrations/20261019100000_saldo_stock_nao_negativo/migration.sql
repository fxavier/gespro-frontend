-- #556 — o stock nunca fica negativo nem com mais reservado do que existe.
--
-- Escrita à mão: o Prisma não declara CHECK, logo o `migrate diff` não o vê (nem como deriva).
--
-- Antes de criar a restrição, conta as linhas que já a violam. Se houver alguma, a migração
-- pára com uma mensagem clara em vez de falhar no ALTER TABLE com um erro genérico: os saldos
-- inválidos têm de ser corrigidos por quem conhece o stock físico (contagem de inventário),
-- nunca por esta migração.
DO $$
DECLARE
  invalidas integer;
BEGIN
  SELECT count(*) INTO invalidas
  FROM "SaldoStock"
  WHERE "saldo" < 0 OR "saldoReservado" < 0 OR "saldoReservado" > "saldo";

  IF invalidas > 0 THEN
    RAISE EXCEPTION 'Migração saldo_stock_nao_negativo (#556): % linha(s) de "SaldoStock" com saldo negativo, reservado negativo ou reservado acima do saldo.', invalidas
      USING HINT = 'Lista-as com: SELECT "tenantId", "produtoId", "varianteProdutoId", "localizacaoId", "saldo", "saldoReservado" FROM "SaldoStock" WHERE "saldo" < 0 OR "saldoReservado" < 0 OR "saldoReservado" > "saldo"; corrige-as por contagem de inventário (ajuste de stock) e volta a correr prisma migrate deploy.';
  END IF;
END $$;

ALTER TABLE "SaldoStock"
  ADD CONSTRAINT saldo_stock_nao_negativo
  CHECK ("saldo" >= 0 AND "saldoReservado" >= 0 AND "saldoReservado" <= "saldo");
