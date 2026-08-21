-- Limpa o pg_stat_statements antes de uma campanha, para que o top-20
-- reflicta apenas as consultas capturadas pelos cenários (ADR-0018 §5).
-- Requer: CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
--         (e shared_preload_libraries=pg_stat_statements no servidor)
SELECT pg_stat_statements_reset();
