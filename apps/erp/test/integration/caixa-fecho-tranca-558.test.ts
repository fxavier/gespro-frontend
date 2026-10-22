/**
 * Oráculo #558 — fecho de caixa sem tranca.
 *
 * Defeito: `fecharSessao`/`cancelarSessao` liam a sessão sem tranca e faziam `update` incondicional;
 * `registarMovimentoCaixa` filtrava `status: 'ABERTA'` sem `FOR SHARE`; sangria e reforço nem
 * corriam numa transacção. Um movimento por confirmar ficava fora da diferença apurada e acabava
 * numa sessão FECHADA; um duplo «Fechar» gravava dois movimentos FECHAMENTO.
 *
 * Contrato:
 *   a. Dois fechos concorrentes → um só FECHAMENTO; o segundo recusa com TRANSICAO_INVALIDA.
 *   b. Fecho concorrente com `registarMovimentoCaixa` → o movimento conta na diferença (ou é
 *      recusado); nunca fica movimento posterior ao fecho numa sessão FECHADA.
 *   c. Cancelar e fechar em paralelo → um só vence.
 *   d. Sangria com o fecho a decorrer → SESSAO_CAIXA_FECHADA, nenhum movimento escrito.
 *
 * As corridas são deterministas: uma tx do teste segura a linha (ou o movimento por confirmar),
 * espera por `pg_stat_activity` até ver o(s) concorrente(s) à espera de tranca, e só depois liberta.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

if (process.env.INTEGRATION_DB_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DB_URL;
  process.env.DIRECT_URL = process.env.INTEGRATION_DB_URL;
}

type Ctx = { tenantId: string; userId: string };

describe.skipIf(skip)('#558 — fecho de caixa com tranca (DB efémera, Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let caixa: typeof import('@/server/services/financas/caixa.service');

  const sufixo = Date.now();
  const TENANT = `tenant-cx-tranca-558-${sufixo}`;
  let seq = 0;

  async function novoUtilizador(): Promise<Ctx> {
    seq += 1;
    const userId = `ucx558${sufixo}u${seq}`;
    await db.user.create({
      data: {
        id: userId,
        tenantId: TENANT,
        email: `caixa-tranca-558-${sufixo}-${seq}@test.mz`,
        nome: `Operador 558 ${seq}`,
        keycloakSub: `kc-caixa-tranca-558-${sufixo}-${seq}`,
      },
    });
    return { tenantId: TENANT, userId };
  }

  async function abrir(ctx: Ctx, fundoInicial: number): Promise<string> {
    const s: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial } as any, ctx));
    return s.id as string;
  }

  const fechar = (ctx: Ctx, sessaoCaixaId: string, fundoFinal: number) =>
    runCtx(ctx, () => caixa.fecharSessao({ sessaoCaixaId, fundoFinal } as any, ctx));

  /** Espera até haver `n` ligações à espera de tranca (ou até `parar()` ser verdade). */
  async function esperarPorTranca(n: number, parar: () => boolean = () => false): Promise<number> {
    let visto = 0;
    for (let i = 0; i < 100 && !parar(); i++) {
      const [{ c }] = await db.$queryRaw<{ c: number }[]>`
        SELECT count(*)::int AS c FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND datname = current_database()`;
      visto = c;
      if (c >= n) break;
      await new Promise((res) => setTimeout(res, 50));
    }
    return visto;
  }

  /** Segura a linha da sessão (FOR UPDATE) enquanto `concorrentes` arrancam, e liberta-a. */
  async function comLinhaSegura<T>(sessaoId: string, esperados: number, concorrentes: () => Promise<T>[]) {
    let corridas!: Promise<PromiseSettledResult<T>[]>;
    await db.$transaction(
      async (tx: any) => {
        await tx.$queryRaw`SELECT id FROM "SessaoCaixa" WHERE id = ${sessaoId} FOR UPDATE`;
        corridas = Promise.allSettled(concorrentes());
        await esperarPorTranca(esperados);
      },
      { timeout: 30_000 },
    );
    return corridas;
  }

  const codigo = (r: PromiseSettledResult<unknown>) =>
    r.status === 'rejected' ? (r.reason as { code?: string }).code : undefined;

  async function movimentos(sessaoId: string, tipo?: string) {
    return db.movimentoCaixa.findMany({
      where: { tenantId: TENANT, sessaoCaixaId: sessaoId, ...(tipo ? { tipo } : {}) },
    });
  }

  /** Invariante da issue: nenhum movimento posterior ao fecho. */
  async function movimentosDepoisDoFecho(sessaoId: string): Promise<number> {
    const [{ n }] = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "MovimentoCaixa" m
      JOIN "SessaoCaixa" s ON s.id = m."sessaoCaixaId"
      WHERE s.id = ${sessaoId} AND s."dataFechamento" IS NOT NULL
        AND m."createdAt" > s."dataFechamento" AND m.tipo <> 'FECHAMENTO'`;
    return n;
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    caixa = await import('@/server/services/financas/caixa.service');

    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');
    await db.tenant.create({
      data: { id: TENANT, nome: `Tenant caixa 558 ${sufixo}`, slug: `cx-tranca-558-${sufixo}`, nuit: `7${String(sufixo).slice(-8)}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it('a: dois fechos concorrentes → um só FECHAMENTO, o segundo recusa com TRANSICAO_INVALIDA', async () => {
    const ctx = await novoUtilizador();
    const id = await abrir(ctx, 500);

    const r = await comLinhaSegura(id, 2, () => [fechar(ctx, id, 500), fechar(ctx, id, 500)]);

    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(r.map(codigo).filter(Boolean)).toEqual(['TRANSICAO_INVALIDA']);
    expect(await movimentos(id, 'FECHAMENTO')).toHaveLength(1);
  });

  it('b: movimento por confirmar durante o fecho → conta na diferença; nada fica depois do fecho', async () => {
    const ctx = await novoUtilizador();
    const id = await abrir(ctx, 500);

    let fecho!: Promise<unknown>;
    let terminou = false;
    // A «venda»: regista o movimento e só confirma depois de o fecho arrancar.
    await runCtx(ctx, () =>
      db.$transaction(
        async (tx: any) => {
          await caixa.registarMovimentoCaixa(
            tx,
            {
              sessaoCaixaId: id,
              tipo: 'VENDA' as any,
              valor: '200.00',
              descricao: 'caixa-tranca-558 VENDA',
              documentoOrigemTipo: 'Oraculo',
              documentoOrigemId: `oraculo-558-${id}`,
            },
            ctx,
          );
          fecho = fechar(ctx, id, 700).finally(() => {
            terminou = true;
          });
          fecho.catch(() => {});
          await esperarPorTranca(1, () => terminou);
        },
        { timeout: 30_000 },
      ),
    );
    await fecho;

    const s = await db.sessaoCaixa.findFirst({ where: { id, tenantId: TENANT } });
    expect(s.status).toBe('FECHADA');
    // À mão: fundo 500 + VENDA 200 = 700 esperado; contado 700 → diferença 0.
    expect(new Prisma.Decimal(String(s.diferenca)).toFixed(2), 'o movimento tem de contar na diferença').toBe('0.00');
    expect(await movimentosDepoisDoFecho(id)).toBe(0);
  });

  it('c: cancelar e fechar em paralelo → um só vence', async () => {
    const ctx = await novoUtilizador();
    const id = await abrir(ctx, 300);

    const r = await comLinhaSegura(id, 2, () => [
      fechar(ctx, id, 300),
      runCtx(ctx, () => caixa.cancelarSessao(id, 'cancelado 558', ctx)),
    ]);

    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(r.map(codigo).filter(Boolean)).toEqual(['TRANSICAO_INVALIDA']);
    const s = await db.sessaoCaixa.findFirst({ where: { id, tenantId: TENANT } });
    const fechamentos = await movimentos(id, 'FECHAMENTO');
    expect(fechamentos).toHaveLength(s.status === 'FECHADA' ? 1 : 0);
  });

  it('d: sangria com o fecho a decorrer → SESSAO_CAIXA_FECHADA e nenhum movimento escrito', async () => {
    const ctx = await novoUtilizador();
    const id = await abrir(ctx, 500);

    // «O fecho a decorrer»: a linha trancada e já FECHADA, por confirmar.
    let sangria!: Promise<PromiseSettledResult<unknown>[]>;
    await db.$transaction(
      async (tx: any) => {
        await tx.$queryRaw`SELECT id FROM "SessaoCaixa" WHERE id = ${id} FOR UPDATE`;
        await tx.sessaoCaixa.update({ where: { id }, data: { status: 'FECHADA', dataFechamento: new Date() } });
        sangria = Promise.allSettled([
          runCtx(ctx, () => caixa.registarSangria({ sessaoCaixaId: id, valor: 50, motivo: 'oraculo 558' } as any, ctx)),
        ]);
        await esperarPorTranca(1);
      },
      { timeout: 30_000 },
    );

    const [r] = await sangria;
    expect(codigo(r)).toBe('SESSAO_CAIXA_FECHADA');
    expect(await movimentos(id, 'SANGRIA')).toHaveLength(0);
  });
});
