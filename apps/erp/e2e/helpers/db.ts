/**
 * Acesso directo à base a partir dos E2E (#373) — um só sítio para a URL e para a limpeza.
 *
 * `urlBaseDados` era copiado spec a spec (20, 36, …). `limparTenant` é a limpeza de um tenant
 * criado por um E2E (ex.: o registo do 36): apaga TODAS as linhas com esse `tenantId`, as duas
 * tabelas de junção que não o têm (`UserRole`, `RolePermission`) e por fim o `Tenant`.
 *
 * A lista de tabelas vem do `information_schema` (toda a tabela com coluna `tenantId`), não de
 * uma lista à mão: um modelo novo entra sozinho. A ordem das FKs também não está escrita: cada
 * passagem apaga o que puder e as tabelas ainda referenciadas (violação de FK, 23503) ficam para
 * a passagem seguinte, dentro de um SAVEPOINT. Tudo numa transacção — ou sai o tenant inteiro, ou
 * não sai nada.
 *
 * Recusa o `demo` e os tenants de carga (`perf-*`): limpar um tenant partilhado por engano
 * custaria o seed inteiro.
 *
 * Não toca no Keycloak: a identidade do realm fica (e-mail único por corrida).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client, type ClientBase } from 'pg';

export function urlBaseDados(): string {
  for (const f of [path.join(process.cwd(), '.env'), path.join(process.cwd(), 'apps/erp/.env')]) {
    if (fs.existsSync(f)) {
      try {
        process.loadEnvFile(f);
      } catch {
        // já carregado — usa o que estiver em process.env
      }
      break;
    }
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não está definida — verifique apps/erp/.env');
  return url;
}

/** Abre um cliente `pg`, corre `fn` e fecha-o sempre. */
export async function comBaseDados<T>(fn: (c: ClientBase) => Promise<T>, url = urlBaseDados()): Promise<T> {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** O `tenantId` do utilizador com este e-mail, ou `null` se não existir (registo não chegou a criar). */
export async function tenantIdDoUtilizador(email: string, url = urlBaseDados()): Promise<string | null> {
  return comBaseDados(async (c) => {
    const r = await c.query<{ tenantId: string }>(`SELECT "tenantId" FROM "User" WHERE email = $1`, [email]);
    if (r.rows.length > 1) throw new Error(`STOP: ${r.rows.length} utilizadores com o e-mail ${email}`);
    return r.rows[0]?.tenantId ?? null;
  }, url);
}

const SLUGS_PROTEGIDOS = /^(demo|perf-.*)$/;

async function tabelasComTenant(c: ClientBase): Promise<string[]> {
  const r = await c.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND column_name = 'tenantId'
      ORDER BY table_name`,
  );
  return r.rows.map((l) => l.table_name);
}

/**
 * Linhas que ainda restam do tenant, por tabela (só as > 0); `Tenant` conta a própria linha.
 * `{}` quer dizer limpo.
 */
export async function residuoDoTenant(tenantId: string, url = urlBaseDados()): Promise<Record<string, number>> {
  return comBaseDados(async (c) => {
    const sobras: Record<string, number> = {};
    for (const t of await tabelasComTenant(c)) {
      const r = await c.query<{ n: string }>(`SELECT count(*) AS n FROM "${t}" WHERE "tenantId" = $1`, [tenantId]);
      const n = Number(r.rows[0].n);
      if (n > 0) sobras[t] = n;
    }
    const tn = await c.query<{ n: string }>(`SELECT count(*) AS n FROM "Tenant" WHERE id = $1`, [tenantId]);
    if (Number(tn.rows[0].n) > 0) sobras.Tenant = Number(tn.rows[0].n);
    return sobras;
  }, url);
}

/**
 * Apaga o tenant e tudo o que é dele. Idempotente: um tenant que já não existe não é erro.
 * Devolve o número de linhas apagadas (o `Tenant` incluído).
 */
export async function limparTenant(tenantId: string, url = urlBaseDados()): Promise<number> {
  return comBaseDados(async (c) => {
    await c.query('BEGIN');
    try {
      const t = await c.query<{ slug: string }>(`SELECT slug FROM "Tenant" WHERE id = $1 FOR UPDATE`, [tenantId]);
      const slug = t.rows[0]?.slug;
      if (slug !== undefined && SLUGS_PROTEGIDOS.test(slug)) {
        throw new Error(`limparTenant recusa o tenant partilhado «${slug}»`);
      }

      let apagadas = 0;
      apagadas +=
        (
          await c.query(
            `DELETE FROM "UserRole" WHERE "userId" IN (SELECT id FROM "User" WHERE "tenantId" = $1)`,
            [tenantId],
          )
        ).rowCount ?? 0;
      apagadas +=
        (
          await c.query(
            `DELETE FROM "RolePermission" WHERE "roleId" IN (SELECT id FROM "Role" WHERE "tenantId" = $1)`,
            [tenantId],
          )
        ).rowCount ?? 0;

      let pendentes = await tabelasComTenant(c);
      while (pendentes.length > 0) {
        const bloqueadas: string[] = [];
        let erroFk: unknown = null;
        for (const tabela of pendentes) {
          await c.query('SAVEPOINT limpar_tenant');
          try {
            const r = await c.query(`DELETE FROM "${tabela}" WHERE "tenantId" = $1`, [tenantId]);
            apagadas += r.rowCount ?? 0;
            await c.query('RELEASE SAVEPOINT limpar_tenant');
          } catch (e) {
            await c.query('ROLLBACK TO SAVEPOINT limpar_tenant');
            if ((e as { code?: string }).code !== '23503') throw e;
            bloqueadas.push(tabela);
            erroFk = e;
          }
        }
        if (bloqueadas.length === pendentes.length) {
          throw new Error(
            `limparTenant sem progresso — ainda referenciadas: ${bloqueadas.join(', ')} (${(erroFk as Error)?.message})`,
          );
        }
        pendentes = bloqueadas;
      }

      apagadas += (await c.query(`DELETE FROM "Tenant" WHERE id = $1`, [tenantId])).rowCount ?? 0;
      await c.query('COMMIT');
      return apagadas;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    }
  }, url);
}
