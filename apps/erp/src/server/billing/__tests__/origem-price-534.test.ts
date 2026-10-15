/**
 * ORÁCULO — issue #534 (nó E:planos-reparos-form, ADR-0049 §4): de onde vem o Price do Stripe de
 * (plano, ciclo), sem nunca expor o valor.
 *
 * Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; alterar do lado de quem
 * implementa é BLOCKER.
 *
 * Contrato (nome fixado pelo verificador): `origemPriceId(codigo, ciclo)` exportada de
 * `@/server/billing/stripe-client` (server-only), assíncrona, devolve SÓ a origem:
 *   'tabela' — a coluna do ciclo na tabela `Plano` tem valor (ganha à env, como no resolverPriceId);
 *   'env'    — a coluna está vazia/nula (ou o plano não existe) e a env
 *              `STRIPE_PRICE_<CODIGO>_<CICLO>` está definida e não vazia;
 *   null     — nenhum dos dois.
 * Coincide sempre com o `resolverPriceId`: `null` ⇔ `resolverPriceId` recusa com
 * PRICE_NAO_CONFIGURADO. Nunca devolve o valor da env nem o Price.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ planos: new Map<string, Record<string, unknown>>() }));

vi.mock('@/server/db/client', () => {
  const findUnique = vi.fn(async ({ where }: any) => {
    const p = where?.codigo ? h.planos.get(where.codigo) : [...h.planos.values()].find((x) => x.id === where?.id);
    return p ?? null;
  });
  const findFirst = vi.fn(async ({ where }: any) => (where?.codigo ? h.planos.get(where.codigo) ?? null : null));
  const findMany = vi.fn(async () => [...h.planos.values()]);
  const prismaBase = { plano: { findUnique, findFirst, findMany } };
  return { prismaBase, prisma: prismaBase };
});

const COD = 'TPRF_ORIGEM';
const ENV_M = `STRIPE_PRICE_${COD}_MENSAL`;
const ENV_A = `STRIPE_PRICE_${COD}_ANUAL`;
const SEGREDO_M = 'price_env_valor_mensal_534';
const SEGREDO_A = 'price_env_valor_anual_534';

function plano(over: Record<string, unknown> = {}) {
  return { id: 'p-origem', codigo: COD, stripePriceIdMensal: null, stripePriceIdAnual: null, arquivadoEm: null, ...over };
}

async function mod(): Promise<any> {
  const caminho: string = '@/server/billing/stripe-client';
  return import(/* @vite-ignore */ caminho);
}

async function origem(codigo: string, ciclo: 'MENSAL' | 'ANUAL'): Promise<unknown> {
  const m = await mod();
  expect(typeof m.origemPriceId, 'stripe-client tem de exportar origemPriceId').toBe('function');
  return m.origemPriceId(codigo, ciclo);
}

beforeEach(() => {
  h.planos.clear();
  delete process.env[ENV_M];
  delete process.env[ENV_A];
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env[ENV_M];
  delete process.env[ENV_A];
});

describe('#534 — origemPriceId: tabela / env / nenhuma, nunca o valor', () => {
  it('coluna da tabela preenchida → "tabela", mesmo com a env definida', async () => {
    h.planos.set(COD, plano({ stripePriceIdMensal: 'price_tab_m', stripePriceIdAnual: 'price_tab_a' }));
    vi.stubEnv(ENV_M, SEGREDO_M);
    expect(await origem(COD, 'MENSAL')).toBe('tabela');
    expect(await origem(COD, 'ANUAL')).toBe('tabela');
  });

  it('coluna nula e env definida → "env" (e não o valor da env)', async () => {
    h.planos.set(COD, plano());
    vi.stubEnv(ENV_M, SEGREDO_M);
    vi.stubEnv(ENV_A, SEGREDO_A);
    const m = await origem(COD, 'MENSAL');
    const a = await origem(COD, 'ANUAL');
    expect(m).toBe('env');
    expect(a).toBe('env');
    expect(JSON.stringify([m, a])).not.toContain('price_env_valor');
  });

  it('coluna vazia ("") conta como ausente → recorre à env', async () => {
    h.planos.set(COD, plano({ stripePriceIdMensal: '' }));
    vi.stubEnv(ENV_M, SEGREDO_M);
    expect(await origem(COD, 'MENSAL')).toBe('env');
  });

  it('nem tabela nem env → null; env vazia também conta como ausente', async () => {
    h.planos.set(COD, plano());
    expect(await origem(COD, 'MENSAL')).toBeNull();
    vi.stubEnv(ENV_A, '');
    expect(await origem(COD, 'ANUAL')).toBeNull();
  });

  it('cada ciclo lê a sua coluna e a sua env', async () => {
    h.planos.set(COD, plano({ stripePriceIdMensal: 'price_tab_m' }));
    expect(await origem(COD, 'MENSAL')).toBe('tabela');
    expect(await origem(COD, 'ANUAL')).toBeNull();
    vi.stubEnv(ENV_A, SEGREDO_A);
    expect(await origem(COD, 'ANUAL')).toBe('env');
  });

  it('plano inexistente com env definida → "env" (como o resolverPriceId)', async () => {
    vi.stubEnv(ENV_M, SEGREDO_M);
    expect(await origem(COD, 'MENSAL')).toBe('env');
    expect(await origem(COD, 'ANUAL')).toBeNull();
  });

  it('só devolve "tabela" | "env" | null e concorda com o resolverPriceId em todos os cenários', async () => {
    const m = await mod();
    expect(typeof m.origemPriceId).toBe('function');
    const tabelas = [null, '', 'price_tab_x'];
    const envs = [undefined, '', 'price_env_valor_x'];
    for (const t of tabelas) {
      for (const env of envs) {
        h.planos.set(COD, plano({ stripePriceIdMensal: t }));
        delete process.env[ENV_M];
        if (env !== undefined) process.env[ENV_M] = env;

        const o = await m.origemPriceId(COD, 'MENSAL');
        const rotulo = `tabela=${JSON.stringify(t)} env=${JSON.stringify(env)}`;
        expect(['tabela', 'env', null], rotulo).toContain(o);

        let resolvido: string | null = null;
        let codigoErro: string | null = null;
        try {
          resolvido = await m.resolverPriceId(COD, 'MENSAL');
        } catch (e: any) {
          codigoErro = e?.code ?? 'ERRO';
        }
        if (o === null) expect(codigoErro, rotulo).toBe('PRICE_NAO_CONFIGURADO');
        else expect(resolvido, rotulo).toBeTruthy();
        if (o === 'tabela') expect(resolvido, rotulo).toBe(t);
        if (o === 'env') expect(resolvido, rotulo).toBe(env);
      }
    }
  });
});
