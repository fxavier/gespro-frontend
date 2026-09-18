-- As 20 consultas mais lentas capturadas pelos cenários (ADR-0018 §5).
-- Ordenado por tempo médio — o total identifica volume, a média identifica dor.
-- Correr depois da campanha; alimenta o EXPLAIN (ANALYZE, BUFFERS) do handoff.
SELECT
  round(mean_exec_time::numeric, 2)  AS media_ms,
  round(total_exec_time::numeric, 0) AS total_ms,
  calls,
  rows / GREATEST(calls, 1)          AS linhas_por_chamada,
  round((shared_blks_hit * 100.0 / GREATEST(shared_blks_hit + shared_blks_read, 1))::numeric, 1) AS cache_hit_pct,
  left(regexp_replace(query, '\s+', ' ', 'g'), 220) AS consulta
FROM pg_stat_statements
WHERE query NOT ILIKE '%pg_stat_statements%'
  AND query NOT ILIKE 'ANALYZE%'
  AND query NOT ILIKE '%generate_series%'   -- exclui o próprio seed
  AND query NOT ILIKE 'CREATE%'
  AND query NOT ILIKE 'ALTER%'
ORDER BY mean_exec_time DESC
LIMIT 20;
