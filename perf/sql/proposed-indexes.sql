-- Índices propostos pela triagem da fase A (ADR-0018 §5) — ESCRITOS À MÃO.
-- NÃO aplicar via prisma migrate dev: tabelas grandes exigem CREATE INDEX
-- CONCURRENTLY (sem lock de escrita), que o Prisma não gera. Fluxo proposto:
--   1. o dono do domínio adiciona o @@index equivalente ao prisma/schema/*;
--   2. o orquestrador cria a migration com ESTE SQL (e marca com
--      `prisma migrate resolve --applied` se aplicado fora de banda);
--   3. em produção, aplicar em janela de baixo tráfego e verificar
--      `pg_stat_progress_create_index`.
-- Todos foram testados na BD de volume (250k partidas, 400k movimentos,
-- 120k vendas, 1M auditoria) — antes/depois em perf/explain/*-{antes,depois}.txt.

-- ── I1. MovimentoStock: listagem por data + paginação keyset ────────────────
-- A listagem (ORDER BY createdAt DESC LIMIT 51 filtrada por tenant) fazia
-- Parallel Seq Scan + top-N sort sobre 404k linhas (~46 ms frio / 232 ms sob
-- carga). Nenhum índice existente começa por (tenantId, createdAt) — os
-- compostos (tenantId, produtoId, createdAt) e (tenantId, tipo, createdAt)
-- não servem a ordenação sem filtro de produto/tipo. O `id` no fim serve o
-- keyset (createdAt, id) proposto para a página funda.
-- Depois: Index Scan Backward, 51 linhas, < 1 ms.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MovimentoStock_tenantId_createdAt_id_idx"
  ON "MovimentoStock" ("tenantId", "createdAt", "id");

-- ── I2. ItemVenda: carga de relação por vendaId ─────────────────────────────
-- O `include: { itens: true }` do Prisma filtra SÓ por "vendaId" (sem
-- tenantId) — o composto (tenantId, vendaId) não é utilizável (coluna líder
-- ausente) → Seq Scan de 244k linhas (614 ms frio / 17,6 ms quente, 2 038
-- chamadas na campanha, dentro do fluxo POS).
-- Depois: Index Scan, < 0,1 ms.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ItemVenda_vendaId_idx"
  ON "ItemVenda" ("vendaId");

-- ── I3. PagamentoVenda: carga de relação por vendaId ────────────────────────
-- Mesmo padrão do I2: `WHERE "vendaId" = $1` → Seq Scan de 122k linhas
-- (443 ms frio / 9,9 ms quente, 2 038 chamadas).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PagamentoVenda_vendaId_idx"
  ON "PagamentoVenda" ("vendaId");

-- ── I4. LinhaFatura: carga de relação por faturaId (+ ordem estável) ────────
-- Mesmo padrão: `WHERE "faturaId" IN (...) ORDER BY "ordemLinha"` → Seq Scan
-- de 122k linhas (556 ms frio / 12,8 ms quente, 2 664 chamadas — emissão de
-- factura e PDF). O `ordemLinha` no índice elimina também o sort.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "LinhaFatura_faturaId_ordemLinha_idx"
  ON "LinhaFatura" ("faturaId", "ordemLinha");

-- ── Lição de modelação (para prisma-conventions) ────────────────────────────
-- A convenção «índices começam por tenantId» é correcta para listagens, mas
-- as cargas de relação do Prisma (include/relação aninhada) filtram apenas
-- pela FK. Toda a relação N:1 consultada via include precisa TAMBÉM do índice
-- simples na FK (@@index([vendaId])), como já se faz nas FKs cross-domínio.

-- ── Varrimentos sequenciais TRIADOS COMO ACEITES (não indexar) ──────────────
-- · Produto (POS, ORDER BY nome, 4k linhas): top-N sort ~3 ms quente; tabela
--   pequena, índice (tenantId, nome) daria ganho marginal — aceite.
-- · SerieDocumento (numeração atómica): 23 linhas; o custo é o lock FOR
--   UPDATE, intencional (numeração sem lacunas) — aceite.
-- · Lancamento em Q01/Q02 (balancete): o hash join com seq scan é óptimo para
--   agregação de ~50 % da tabela; o problema é a consulta (ver handoff), não
--   o índice — aceite.
-- · HistoricoTransacao (export, 6k linhas/cliente): coberto pelo índice
--   existente (tenantId, clienteId, dataTransacao); o problema é o cursor sem
--   LIMIT (sistémico, ver handoff) — aceite.
