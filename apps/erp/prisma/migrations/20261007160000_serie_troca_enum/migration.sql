-- #331: série de documento da troca (Troca.numero deixa de ser `TRC-${Date.now()}`).
-- Sozinho nesta migração: o Postgres não deixa usar um valor de enum na mesma
-- transacção em que é acrescentado (a seguinte semeia as séries com ele).
ALTER TYPE "TipoSerieDocumento" ADD VALUE 'TROCA';
