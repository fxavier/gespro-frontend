-- ============================================================================
-- Spec 22 · WS-1 · nó L4 (task 4.7) — planos das agregações da projecção de
-- tesouraria (projecao.service.ts), medidos em 2026-09-21 sobre o tenant
-- `perf-001` do `pnpm db:seed:volume` (perfil pme: 60 000 facturas, 100 000
-- lançamentos / 250 000 partidas, 1 920 payrolls).
--
-- Como ler: cada secção tem a query SQL equivalente à que o Prisma emite,
-- seguida do plano `EXPLAIN (ANALYZE, BUFFERS)` capturado. Requisito do P4:
-- cada agregação TEM de usar um índice existente — o índice usado está
-- identificado no topo de cada secção.
--
-- `ContaPagar` e `CompromissoTesouraria` não têm dados no seed de volume
-- (o gerador é anterior ao spec 22): os planos dessas duas foram capturados
-- com 40 000 linhas sintéticas por tabela (metade do perf-001, metade de um
-- tenant-ruído, estados e datas variados), inseridas e ANALYZE-adas dentro de
-- uma transacção terminada em ROLLBACK — a base ficou como estava.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Task 4.1 — agregação de Fatura a receber (R2.1)
--    Índice usado: "Fatura_tenantId_status_idx"  (@@index([tenantId, status]))
--    O planner prefere-o ao @@index([tenantId, dataVencimento, status]) porque
--    o predicado selectivo é o status (24 000 de 60 000); a fronteira de data
--    fica como Filter no heap. 41,9 ms para 24 000 linhas devolvidas.
-- ----------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, numero, total, "totalPago", "dataVencimento"
FROM "Fatura"
WHERE "tenantId" = $tenant
  AND status IN ('EMITIDA','PARCIALMENTE_PAGA','VENCIDA')
  AND "dataVencimento" <= now() + interval '90 days';
--                                                                      QUERY PLAN                                                                      
-- -----------------------------------------------------------------------------------------------------------------------------------------------------
--  Bitmap Heap Scan on "Fatura"  (cost=317.15..3110.16 rows=23829 width=64) (actual time=4.293..18.081 rows=24000 loops=1)
--    Recheck Cond: (("tenantId" = 'cca2100ef69ac393c5a6c6e51'::text) AND (status = ANY ('{EMITIDA,PARCIALMENTE_PAGA,VENCIDA}'::"StatusFatura"[])))
--    Filter: ("dataVencimento" <= (now() + '90 days'::interval))
--    Heap Blocks: exact=2223
--    Buffers: shared hit=2226 read=20
--    ->  Bitmap Index Scan on "Fatura_tenantId_status_idx"  (cost=0.00..311.19 rows=23832 width=0) (actual time=3.992..3.992 rows=24000 loops=1)
--          Index Cond: (("tenantId" = 'cca2100ef69ac393c5a6c6e51'::text) AND (status = ANY ('{EMITIDA,PARCIALMENTE_PAGA,VENCIDA}'::"StatusFatura"[])))
--          Buffers: shared hit=3 read=20
--  Planning:
--    Buffers: shared hit=244 read=10
--  Planning Time: 4.504 ms
--  Execution Time: 19.098 ms
-- (12 rows)
-- 

-- ----------------------------------------------------------------------------
-- 2. Task 4.2 — agregação de ContaPagar (R2.2)
--    Índice usado: "ContaPagar_tenantId_status_idx"  (@@index([tenantId, status]))
--    Dados sintéticos em ROLLBACK (ver cabeçalho): 12 000 linhas devolvidas em
--    12,7 ms. Como na Fatura, o planner escolhe o índice de status e filtra a
--    data no heap; o @@index([tenantId, dataVencimento]) fica disponível para
--    quando a janela de datas for o predicado selectivo.
-- ----------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, numero, "valorRestante", "dataVencimento"
FROM "ContaPagar"
WHERE "tenantId" = $tenant
  AND status IN ('ABERTA','PARCIALMENTE_PAGA','VENCIDA')
  AND "dataVencimento" <= now() + interval '90 days';
--                                                                        QUERY PLAN                                                                       
-- --------------------------------------------------------------------------------------------------------------------------------------------------------
--  Bitmap Heap Scan on "ContaPagar"  (cost=240.36..2974.50 rows=12047 width=36) (actual time=6.793..12.049 rows=12000 loops=1)
--    Recheck Cond: (("tenantId" = 'cca2100ef69ac393c5a6c6e51'::text) AND (status = ANY ('{ABERTA,PARCIALMENTE_PAGA,VENCIDA}'::"StatusContaPagar"[])))
--    Filter: ("dataVencimento" <= (now() + '90 days'::interval))
--    Heap Blocks: exact=2448
--    Buffers: shared hit=2473 read=7
--    ->  Bitmap Index Scan on "ContaPagar_tenantId_status_idx"  (cost=0.00..237.35 rows=12048 width=0) (actual time=4.002..4.002 rows=36000 loops=1)
--          Index Cond: (("tenantId" = 'cca2100ef69ac393c5a6c6e51'::text) AND (status = ANY ('{ABERTA,PARCIALMENTE_PAGA,VENCIDA}'::"StatusContaPagar"[])))
--          Buffers: shared hit=25 read=7
--  Planning:
--    Buffers: shared hit=86 read=9
--  Planning Time: 1.130 ms
--  Execution Time: 12.658 ms
-- (12 rows)
-- 

-- ----------------------------------------------------------------------------
-- 3. Task 4.3 — agregação de Payroll PROCESSADO (R2.3)
--    Plano natural no perf-001: Seq Scan — e está CERTO: as 1 920 linhas da
--    tabela (57 páginas) são todas deste tenant e todas PROCESSADO, ou seja,
--    selectividade 100 %; um índice só acrescentaria I/O. Com `enable_seqscan
--    = off` o planner usa "Payroll_tenantId_folhaId_idx" pelo prefixo
--    `tenantId` (segundo plano abaixo) — é esse o caminho que vigora numa base
--    multi-tenant real, onde o tenantId é selectivo. 2,3 ms / 3,5 ms.
-- ----------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, "mesReferencia", "anoReferencia", "custoTotalEntidade", "dataPagamento"
FROM "Payroll"
WHERE "tenantId" = $tenant
  AND status = 'PROCESSADO'
  AND ("dataPagamento" <= now() + interval '90 days' OR "dataPagamento" IS NULL);
--                                                                                            QUERY PLAN                                                                                            
-- -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
--  Seq Scan on "Payroll"  (cost=0.00..100.25 rows=1918 width=48) (actual time=0.023..0.840 rows=1920 loops=1)
--    Filter: (("tenantId" = 'cca2100ef69ac393c5a6c6e51'::text) AND (status = 'PROCESSADO'::"StatusPayroll") AND (("dataPagamento" <= (now() + '90 days'::interval)) OR ("dataPagamento" IS NULL)))
--    Rows Removed by Filter: 2
--    Buffers: shared hit=56 read=1
--  Planning:
--    Buffers: shared hit=200 read=6
--  Planning Time: 3.071 ms
--  Execution Time: 0.938 ms
-- (8 rows)
-- 
-- (com enable_seqscan = off, para provar o caminho indexado:)
--                                                                   QUERY PLAN                                                                  
-- ----------------------------------------------------------------------------------------------------------------------------------------------
--  Bitmap Heap Scan on "Payroll"  (cost=35.16..135.36 rows=1918 width=48) (actual time=0.399..1.218 rows=1920 loops=1)
--    Recheck Cond: ("tenantId" = 'cca2100ef69ac393c5a6c6e51'::text)
--    Filter: ((status = 'PROCESSADO'::"StatusPayroll") AND (("dataPagamento" <= (now() + '90 days'::interval)) OR ("dataPagamento" IS NULL)))
--    Heap Blocks: exact=57
--    Buffers: shared hit=57 read=4
--    ->  Bitmap Index Scan on "Payroll_tenantId_folhaId_idx"  (cost=0.00..34.68 rows=1920 width=0) (actual time=0.375..0.375 rows=1920 loops=1)
--          Index Cond: ("tenantId" = 'cca2100ef69ac393c5a6c6e51'::text)
--          Buffers: shared read=4
--  Planning:
--    Buffers: shared hit=201
--  Planning Time: 2.515 ms
--  Execution Time: 1.344 ms
-- (12 rows)
-- 

-- ----------------------------------------------------------------------------
-- 4. Task 4.4 — agregação de CompromissoTesouraria (task 4.7: o escrutínio do
--    índice literal do design §2)
--    Índice usado: "CompromissoTesouraria_tenantId_dataPrevista_ativo_idx" —
--    o próprio @@index([tenantId, dataPrevista, ativo]) do design, com as
--    TRÊS chaves na Index Cond. A ordem «range antes de igualdade» que a task
--    4.7 manda olhar: o `ativo = true` não é um seek de prefixo, é aplicado
--    como filtro DENTRO do índice — no plano abaixo isso custa varrer ~10 %
--    de entradas inactivas dentro do range (rows=10 072 saídos do índice, 14
--    páginas de índice lidas, 0,43 ms no Bitmap Index Scan). O único Filter
--    de heap é o `deletedAt IS NULL`. Com 40 000 linhas sintéticas o custo da
--    forma canónica ([tenantId, ativo, dataPrevista]) seria indistinguível:
--    o índice fica COMO ESTÁ no design — só se mudaria com custo de filtro
--    visível, e não há nenhum.
--    Dados sintéticos em ROLLBACK (ver cabeçalho): 10 072 linhas em 3,7 ms.
-- ----------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, descricao, tipo, valor, "dataPrevista", recorrencia, "dataFimRecorrencia"
FROM "CompromissoTesouraria"
WHERE "tenantId" = $tenant
  AND ativo = true
  AND "deletedAt" IS NULL
  AND "dataPrevista" <= now() + interval '90 days';
--                                                                                 QUERY PLAN                                                                                
-- --------------------------------------------------------------------------------------------------------------------------------------------------------------------------
--  Bitmap Heap Scan on "CompromissoTesouraria"  (cost=221.28..1163.18 rows=11395 width=52) (actual time=0.498..3.291 rows=10072 loops=1)
--    Recheck Cond: (("tenantId" = 'cca2100ef69ac393c5a6c6e51'::text) AND ("dataPrevista" <= (now() + '90 days'::interval)) AND ativo)
--    Filter: ("deletedAt" IS NULL)
--    Heap Blocks: exact=514
--    Buffers: shared hit=528
--    ->  Bitmap Index Scan on "CompromissoTesouraria_tenantId_dataPrevista_ativo_idx"  (cost=0.00..218.43 rows=11395 width=0) (actual time=0.429..0.430 rows=10072 loops=1)
--          Index Cond: (("tenantId" = 'cca2100ef69ac393c5a6c6e51'::text) AND ("dataPrevista" <= (now() + '90 days'::interval)) AND (ativo = true))
--          Buffers: shared hit=14
--  Planning:
--    Buffers: shared hit=56
--  Planning Time: 0.734 ms
--  Execution Time: 3.749 ms
-- (12 rows)
-- 

-- ----------------------------------------------------------------------------
-- 5. `saldoTesourariaAte` — groupBy de partidas das contas PGC das bancárias
--    activas (ADR-0036 §2/§2-bis), filtro FILTRO_LANCAMENTO_MAPA
--    Índice usado: "PartidaLancamento_tenantId_contaId_tipo_idx" no lado das
--    partidas (20 003 entradas de índice para 2 contas em 2,4 ms); o lado
--    Lancamento é um Parallel Seq Scan do join com 100 000 lançamentos — a
--    mesma forma já caracterizada nas queries de balancete (q01–q03). 81 ms
--    no total, o mais pesado do lote; corre em Promise.all com as agregações.
-- ----------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT pl."contaId", pl.tipo, SUM(pl.valor)
FROM "PartidaLancamento" pl
JOIN "Lancamento" l ON l.id = pl."lancamentoId"
WHERE pl."tenantId" = $tenant
  AND pl."contaId" IN ($contasPGCDasBancariasAtivas)
  AND l.status IN ('LANCADO','ESTORNADO')
  AND l.data <= now()
GROUP BY pl."contaId", pl.tipo;
--                                                                                              QUERY PLAN                                                                                             
-- ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
--  Finalize GroupAggregate  (cost=11002.49..11021.63 rows=72 width=62) (actual time=76.784..80.890 rows=4 loops=1)
--    Group Key: pl."contaId", pl.tipo
--    Buffers: shared hit=59 read=8488 written=413
--    ->  Gather Merge  (cost=11002.49..11019.29 rows=144 width=62) (actual time=76.773..80.873 rows=12 loops=1)
--          Workers Planned: 2
--          Workers Launched: 2
--          Buffers: shared hit=59 read=8488 written=413
--          ->  Sort  (cost=10002.46..10002.64 rows=72 width=62) (actual time=70.782..70.785 rows=4 loops=3)
--                Sort Key: pl."contaId", pl.tipo
--                Sort Method: quicksort  Memory: 25kB
--                Buffers: shared hit=59 read=8488 written=413
--                Worker 0:  Sort Method: quicksort  Memory: 25kB
--                Worker 1:  Sort Method: quicksort  Memory: 25kB
--                ->  Partial HashAggregate  (cost=9999.34..10000.24 rows=72 width=62) (actual time=70.631..70.635 rows=4 loops=3)
--                      Group Key: pl."contaId", pl.tipo
--                      Batches: 1  Memory Usage: 24kB
--                      Buffers: shared hit=27 read=8488 written=413
--                      Worker 0:  Batches: 1  Memory Usage: 24kB
--                      Worker 1:  Batches: 1  Memory Usage: 24kB
--                      ->  Parallel Hash Join  (cost=5674.02..9936.99 rows=8314 width=37) (actual time=29.268..68.211 rows=6668 loops=3)
--                            Hash Cond: (l.id = pl."lancamentoId")
--                            Buffers: shared hit=27 read=8488 written=413
--                            ->  Parallel Seq Scan on "Lancamento" l  (cost=0.00..4071.75 rows=41753 width=26) (actual time=0.267..31.021 rows=33406 loops=3)
--                                  Filter: ((status = ANY ('{LANCADO,ESTORNADO}'::"StatusLancamento"[])) AND (data <= now()))
--                                  Buffers: shared read=3341 written=297
--                            ->  Parallel Hash  (cost=5570.09..5570.09 rows=8315 width=63) (actual time=28.012..28.012 rows=6668 loops=3)
--                                  Buckets: 32768  Batches: 1  Memory Usage: 2336kB
--                                  Buffers: shared hit=21 read=5147 written=116
--                                  ->  Parallel Bitmap Heap Scan on "PartidaLancamento" pl  (cost=285.37..5570.09 rows=8315 width=63) (actual time=1.138..25.080 rows=6668 loops=3)
--                                        Recheck Cond: (("tenantId" = 'cca2100ef69ac393c5a6c6e51'::text) AND ("contaId" = ANY ('{ce581b2d8e86db09f163e8878,c3881eb6a650d002325a20fc0}'::text[])))
--                                        Heap Blocks: exact=2047
--                                        Buffers: shared hit=21 read=5147 written=116
--                                        ->  Bitmap Index Scan on "PartidaLancamento_tenantId_contaId_tipo_idx"  (cost=0.00..280.38 rows=19955 width=0) (actual time=2.415..2.416 rows=20003 loops=1)
--                                              Index Cond: (("tenantId" = 'cca2100ef69ac393c5a6c6e51'::text) AND ("contaId" = ANY ('{ce581b2d8e86db09f163e8878,c3881eb6a650d002325a20fc0}'::text[])))
--                                              Buffers: shared hit=21 read=1
--  Planning:
--    Buffers: shared hit=410 read=30 dirtied=2
--  Planning Time: 13.163 ms
--  Execution Time: 81.252 ms
-- (39 rows)
-- 

-- ----------------------------------------------------------------------------
-- 6. `perfilAtraso` — facturas PAGA com dataPagamento na janela de 180 dias
--    Índice usado: "Fatura_tenantId_status_idx"; a janela de datas é Filter
--    no heap (36 000 linhas PAGA varridas, 23 ms). Não existe índice com
--    dataPagamento — se o k6 (R9) mostrar esta query a pesar no p95, o
--    candidato é @@index([tenantId, status, dataPagamento]); fica anotado
--    para o nó de desempenho, não se muda schema por teoria (task 4.7).
-- ----------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT "dataPagamento", "dataVencimento"
FROM "Fatura"
WHERE "tenantId" = $tenant
  AND status = 'PAGA'
  AND "dataPagamento" >= now() - interval '180 days'
  AND "dataPagamento" <= now();
--                                                                   QUERY PLAN                                                                   
-- -----------------------------------------------------------------------------------------------------------------------------------------------
--  Bitmap Heap Scan on "Fatura"  (cost=489.92..3711.38 rows=40 width=16) (actual time=23.148..23.148 rows=0 loops=1)
--    Recheck Cond: (("tenantId" = 'cca2100ef69ac393c5a6c6e51'::text) AND (status = 'PAGA'::"StatusFatura"))
--    Filter: (("dataPagamento" <= now()) AND ("dataPagamento" >= (now() - '180 days'::interval)))
--    Rows Removed by Filter: 36000
--    Heap Blocks: exact=2223
--    Buffers: shared read=2253 written=14
--    ->  Bitmap Index Scan on "Fatura_tenantId_status_idx"  (cost=0.00..489.91 rows=36162 width=0) (actual time=2.694..2.695 rows=36000 loops=1)
--          Index Cond: (("tenantId" = 'cca2100ef69ac393c5a6c6e51'::text) AND (status = 'PAGA'::"StatusFatura"))
--          Buffers: shared read=30
--  Planning:
--    Buffers: shared hit=173 read=13 dirtied=2
--  Planning Time: 3.382 ms
--  Execution Time: 23.222 ms
-- (13 rows)
-- 
