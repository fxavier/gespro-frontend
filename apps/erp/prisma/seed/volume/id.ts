/**
 * IDs determinísticos com forma de cuid — 'c' + 24 hex do md5 da chave natural.
 *
 * Porquê: (1) idempotência — re-executar o seed produz os mesmos IDs e o
 * `ON CONFLICT DO NOTHING` torna-o re-executável; (2) os geradores set-based em
 * SQL conseguem calcular FKs sem round-trips (`md5()` existe no Postgres);
 * (3) passam na validação `z.string().cuid()` das actions, o que permite aos
 * cenários k6 usar IDs do manifesto.
 */
import { createHash } from 'node:crypto';

export function cuidLike(key: string): string {
  return `c${createHash('md5').update(key).digest('hex').slice(0, 24)}`;
}

/**
 * Fragmento SQL que calcula `cuidLike(prefixo || expr)` no servidor.
 * `prefix` é literal controlado pelo gerador (nunca input externo).
 */
export function sqlCuid(prefixLiteral: string, exprSql: string): string {
  return `('c' || substr(md5('${prefixLiteral}' || ${exprSql}), 1, 24))`;
}

/** Chave natural namespaced por tenant. */
export function chave(slug: string, entidade: string, n: number | string): string {
  return `perf:${slug}:${entidade}:${n}`;
}
