/**
 * Oráculo da issue #144 (lançamento em período trancado) — a recusa `PERIODO_FECHADO` de quem
 * tenta lançar num período fechado aponta o passo que resolve: o período (pelo código), o ecrã
 * onde se reabre (Contabilidade › Exercícios) e a acção (reabrir). Hoje diz só «Período X está
 * fechado». O CÓDIGO não muda e nada fica gravado.
 *
 * Cobre as duas portas de escrita no razão (CLAUDE.md, ADR-0033): o lançamento manual
 * (`criarLancamento`) e o automático dos documentos (`registarLancamentoContabilistico`).
 *
 * Dados: tenant montado pelo `bootstrapContabilidade` real; o período 2025-03 nasce pelo
 * primeiro lançamento (serviço real) e é fechado por escrita directa no `PeriodoContabil`
 * (preparação — o `fecharPeriodo` exigiria IVA apurado, fora do âmbito).
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador; um agente de implementação que o altere é BLOCKER.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

describe.skipIf(skip)('#144 — PERIODO_FECHADO aponta o passo certo — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let contab: typeof import('@/server/services/financas/contabilidade.service');
  let val: typeof import('@/lib/validations/contabilidade');

  const sufixo = Date.now();
  const TENANT = `tenant-msg-144-${sufixo}`;
  const USER = `user-msg-144-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const DATA_MARCO = '2025-03-15T10:00:00Z';
  const CODIGO = '2025-03';

  let conta111: string;
  let conta711: string;
  let diarioOutros: string;
  let doc = 0;

  function registar(data: string) {
    return runCtx(ctx, () =>
      db.$transaction((tx: any) =>
        contab.registarLancamentoContabilistico(
          tx,
          {
            data: new Date(data),
            diarioTipo: 'OPERACOES',
            origem: 'AJUSTE',
            documentoOrigemId: `doc-msg-144-${++doc}`,
            documentoOrigemTipo: 'TesteMensagens144',
            historico: 'Teste #144',
            partidas: [
              { contaCodigo: '111', tipo: 'DEBITO', valor: '10' },
              { contaCodigo: '711', tipo: 'CREDITO', valor: '10' },
            ],
          },
          ctx,
        ),
      ),
    );
  }

  function criarManual(data: string) {
    return runCtx(ctx, () =>
      contab.criarLancamento(
        val.CriarLancamentoSchema.parse({
          data,
          diarioId: diarioOutros,
          historico: 'Lançamento manual #144',
          partidas: [
            { contaId: conta111, tipo: 'DEBITO', valor: 10 },
            { contaId: conta711, tipo: 'CREDITO', valor: 10 },
          ],
        }),
        ctx,
      ),
    );
  }

  async function capturar(p: Promise<unknown>): Promise<{ code?: string; message: string }> {
    try {
      await p;
    } catch (e) {
      return e as { code?: string; message: string };
    }
    throw new Error('devia ter sido recusado com PERIODO_FECHADO');
  }

  function esperarPassoCerto(e: { code?: string; message: string }) {
    expect(e.code).toBe('PERIODO_FECHADO');
    // Qual período
    expect(e.message).toContain(CODIGO);
    // Onde: o ecrã dos exercícios e períodos
    expect(e.message).toMatch(/Contabilidade\s*[›>→]\s*Exerc[ií]cios/);
    // O quê: reabrir o período
    expect(e.message).toMatch(/reabr/i);
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    contab = await import('@/server/services/financas/contabilidade.service');
    val = await import('@/lib/validations/contabilidade');
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    const slug = `msg-144-${sufixo}`;
    await db.tenant.create({ data: { id: TENANT, nome: `Tenant ${slug}`, slug, nuit: `${sufixo}`.slice(-9) } });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `${slug}@test.mz`, nome: 'Contabilista', keycloakSub: `kc-${slug}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const contas = await db.contaPGC.findMany({
      where: { tenantId: TENANT, codigo: { in: ['111', '711'] } },
      select: { id: true, codigo: true },
    });
    conta111 = contas.find((c: any) => c.codigo === '111').id;
    conta711 = contas.find((c: any) => c.codigo === '711').id;
    diarioOutros = (await db.diario.findFirst({ where: { tenantId: TENANT, tipo: 'OUTROS' } })).id;

    // O primeiro lançamento cria o exercício e o período 2025-03; depois fecha-se o período.
    await registar(DATA_MARCO);
    const r = await db.periodoContabil.updateMany({
      where: { tenantId: TENANT, codigo: CODIGO },
      data: { estado: 'FECHADO', fechadoEm: new Date(), fechadoPorId: USER },
    });
    expect(r.count, 'pré-condição: o período 2025-03 existe e ficou fechado').toBe(1);
  });

  it('lançamento manual num período fechado: PERIODO_FECHADO com o período, o ecrã e a acção', async () => {
    const antes = await db.lancamento.count({ where: { tenantId: TENANT } });
    const e = await capturar(criarManual(DATA_MARCO));
    esperarPassoCerto(e);
    expect(await db.lancamento.count({ where: { tenantId: TENANT } }), 'nada gravado').toBe(antes);
  });

  it('lançamento automático (documento) num período fechado: a mesma recusa accionável', async () => {
    const antes = await db.lancamento.count({ where: { tenantId: TENANT } });
    const e = await capturar(registar(DATA_MARCO));
    esperarPassoCerto(e);
    expect(await db.lancamento.count({ where: { tenantId: TENANT } }), 'nada gravado').toBe(antes);
  });
});
