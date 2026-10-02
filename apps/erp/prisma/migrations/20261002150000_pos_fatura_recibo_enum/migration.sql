-- ADR-0041 §1: série da Factura-Recibo da venda POS paga no acto.
-- Sozinho nesta migração: o Postgres não deixa usar um valor de enum na mesma
-- transacção em que é acrescentado (a seguinte semeia as séries com ele).
ALTER TYPE "TipoSerieDocumento" ADD VALUE 'FATURA_RECIBO';
