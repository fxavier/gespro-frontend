/**
 * Oráculo S6 — a abertura da sessão POS falha cedo (ADR-0041 §6; issue #310)
 *
 * Contra Postgres real (Testcontainers), pelo serviço real `sessaoPOSService.abrir`:
 *   recusa, SEM escrever nada (nenhuma SessaoPOS criada):
 *     - e-mail por confirmar                          → EMAIL_POR_CONFIRMAR_EMISSAO;
 *     - período de HOJE (Africa/Maputo) existe e não está ABERTO → PERIODO_FECHADO;
 *     - sessão de caixa de outro tenant / inexistente → NotFoundError;
 *     - sessão de caixa FECHADA                       → SESSAO_CAIXA_FECHADA;
 *     - sessão de caixa de outro utilizador           → SESSAO_CAIXA_DE_OUTRO_UTILIZADOR;
 *   aceita (SessaoPOS ABERTA) com e-mail confirmado, caixa própria aberta e período de hoje
 *   aberto ou ainda por criar;
 *   e a venda POS feita depois de o período fechar é recusada com PERIODO_FECHADO, sem
 *   escrever nada.
 *
 * O tenant é montado pelos serviços reais (`bootstrapContabilidade`, `abrirSessao`/`fecharSessao`
 * do caixa, `resolverPeriodo`). Fechar o período é um `update` de fixture ao `estado` (o fecho
 * real exige sete pré-condições que nada têm a ver com este contrato); cada caso que o fecha
 * repõe-no em `finally`. Cada caso usa um utilizador novo com a sua caixa — uma caixa e uma
 * sessão POS abertas por utilizador. A sessão (auth) é fronteira e é o único duplo.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

// Mutável: cada caso parte de sessão confirmada; o caso do e-mail troca-a.
const h = vi.hoisted(() => ({ sessao: null as null | { user: { emailVerificado?: boolean } } }));
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => h.sessao),
}));

const SESSAO_CONFIRMADA = { user: { emailVerificado: true } };

describe.skipIf(skip)('Abertura da sessão POS valida e-mail, período e caixa — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let sessaoPOSService: (typeof import('@/server/services/comercial'))['sessaoPOSService'];
  let vendaService: (typeof import('@/server/services/comercial'))['vendaService'];
  let CreateVendaSchema: (typeof import('@/lib/validations/vendas'))['CreateVendaSchema'];
  let caixa: typeof import('@/server/services/financas/caixa.service');
  let resolverPeriodo: (typeof import('@/server/services/financas/contabilidade.service'))['resolverPeriodo'];
  let periodoFiscalDe: (typeof import('@/server/services/financas/contabilidade.service'))['periodoFiscalDe'];
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];
  let NotFoundError: (typeof import('@/lib/errors'))['NotFoundError'];

  const sufixo = Date.now();
  const TENANT = `tenant-pos-s6-${sufixo}`;
  const OUTRO_TENANT = `tenant-pos-s6-outro-${sufixo}`;
  // Schemas de vendas exigem cuid: forma `c` + alfanuméricos.
  let seq = 0;

  let produtoId: string;
  let localizacaoId: string;
  /** Caixa aberta noutro tenant, por um utilizador desse tenant. */
  let caixaOutroTenantId: string;

  type Ctx = { tenantId: string; userId: string };

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  function esperarRegra(erro: any, codigo: string) {
    expect(erro, `esperava BusinessRuleError ${codigo}, nada foi lançado`).toBeDefined();
    expect(erro, `esperava BusinessRuleError ${codigo}, veio ${erro?.constructor?.name}: ${erro?.message}`).toBeInstanceOf(
      BusinessRuleError,
    );
    expect(erro.code).toBe(codigo);
  }

  /** Utilizador novo do tenant, com (opcionalmente) a sua caixa aberta pelo serviço real. */
  async function novoUtilizador(tenantId = TENANT, comCaixa = true): Promise<{ ctx: Ctx; sessaoCaixaId?: string }> {
    seq += 1;
    const userId = `cposs6${sufixo}u${seq}`;
    await db.user.create({
      data: { id: userId, tenantId, email: `pos-s6-${sufixo}-${seq}@test.mz`, nome: `Vendedor ${seq}`, keycloakSub: `kc-pos-s6-${sufixo}-${seq}` },
    });
    const ctx = { tenantId, userId };
    if (!comCaixa) return { ctx };
    const sc: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial: 1000 }, ctx));
    return { ctx, sessaoCaixaId: sc.id };
  }

  async function abrir(sessaoCaixaId: string, ctx: Ctx) {
    return runCtx(ctx, () => sessaoPOSService.abrir({ sessaoCaixaId }, ctx));
  }

  async function sessoesPOS() {
    return {
      tenant: await db.sessaoPOS.count({ where: { tenantId: TENANT } }),
      outro: await db.sessaoPOS.count({ where: { tenantId: OUTRO_TENANT } }),
    };
  }

  /** Garante que o período de hoje existe (pelo serviço real) e devolve-o. */
  async function periodoDeHoje() {
    await db.$transaction((tx: any) => resolverPeriodo(tx, new Date(), TENANT), { timeout: 60_000 });
    const p = await db.periodoContabil.findFirst({ where: { tenantId: TENANT, codigo: periodoFiscalDe(new Date()) } });
    expect(p, 'período de hoje').not.toBeNull();
    return p;
  }

  /** Fecha o período de hoje enquanto `fn` corre; repõe-no sempre. */
  async function comPeriodoDeHojeFechado<T>(fn: () => Promise<T>): Promise<T> {
    const p = await periodoDeHoje();
    const original = { estado: p.estado, fechadoEm: p.fechadoEm, fechadoPorId: p.fechadoPorId };
    await db.periodoContabil.update({ where: { id: p.id }, data: { estado: 'FECHADO', fechadoEm: new Date() } });
    try {
      return await fn();
    } finally {
      await db.periodoContabil.update({ where: { id: p.id }, data: original });
    }
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ sessaoPOSService, vendaService } = await import('@/server/services/comercial'));
    ({ CreateVendaSchema } = await import('@/lib/validations/vendas'));
    caixa = await import('@/server/services/financas/caixa.service');
    ({ resolverPeriodo, periodoFiscalDe } = await import('@/server/services/financas/contabilidade.service'));
    ({ BusinessRuleError, NotFoundError } = await import('@/lib/errors'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    for (const [id, slug, nuitSufixo] of [
      [TENANT, `pos-s6-${sufixo}`, '1'],
      [OUTRO_TENANT, `pos-s6-outro-${sufixo}`, '2'],
    ] as const) {
      await db.tenant.create({ data: { id, nome: `Tenant POS S6 ${slug}`, slug, nuit: `${nuitSufixo}${String(sufixo).slice(-8)}` } });
      await db.$transaction((tx: any) => bootstrapContabilidade(tx, id), { timeout: 60_000 });
    }

    // Catálogo e stock de partida (só para a venda em período fechado).
    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const produto = await db.produto.create({
      data: {
        tenantId: TENANT,
        sku: `SKU-POS-S6-${sufixo}`,
        nome: 'Artigo de balcão',
        categoriaId: categoria.id,
        unidadeMedida: 'UN',
        precoVenda: 1000,
        precoCompra: 700,
        margemLucro: 0.3,
        taxaIva: 0.16,
      },
    });
    produtoId = produto.id;
    const loc = await db.localizacao.create({
      data: { tenantId: TENANT, codigo: `ARM-POS-S6-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    await db.saldoStock.create({
      data: { tenantId: TENANT, produtoId, varianteProdutoId: '', localizacaoId, saldo: 10_000, saldoReservado: 0 },
    });

    h.sessao = SESSAO_CONFIRMADA;
    const doOutro = await novoUtilizador(OUTRO_TENANT);
    caixaOutroTenantId = doOutro.sessaoCaixaId!;
  });

  beforeEach(() => {
    h.sessao = SESSAO_CONFIRMADA;
  });

  // -------------------------------------------------------------------------
  // Caminho feliz
  // -------------------------------------------------------------------------

  // Primeiro de propósito: nenhum caso anterior criou o exercício do tenant.
  it('período de hoje ainda por criar + e-mail confirmado + caixa própria aberta → SessaoPOS ABERTA', async () => {
    const { ctx, sessaoCaixaId } = await novoUtilizador();
    expect(
      await db.periodoContabil.count({ where: { tenantId: TENANT, codigo: periodoFiscalDe(new Date()) } }),
      'pré-condição: o período de hoje ainda não existe',
    ).toBe(0);

    const row: any = await abrir(sessaoCaixaId!, ctx);

    const gravada = await db.sessaoPOS.findFirst({ where: { id: row.id, tenantId: TENANT } });
    expect(gravada).not.toBeNull();
    expect(gravada.status).toBe('ABERTA');
    expect(gravada.sessaoCaixaId).toBe(sessaoCaixaId);
    expect(gravada.vendedorId).toBe(ctx.userId);
  });

  it('período de hoje existente e ABERTO → SessaoPOS ABERTA', async () => {
    const p = await periodoDeHoje();
    expect(p.estado).toBe('ABERTO');
    const { ctx, sessaoCaixaId } = await novoUtilizador();

    const row: any = await abrir(sessaoCaixaId!, ctx);

    const gravada = await db.sessaoPOS.findFirst({ where: { id: row.id, tenantId: TENANT } });
    expect(gravada?.status).toBe('ABERTA');
    expect(gravada?.sessaoCaixaId).toBe(sessaoCaixaId);
  });

  // -------------------------------------------------------------------------
  // Recusas — nada escrito
  // -------------------------------------------------------------------------

  it('e-mail por confirmar (emailVerificado false) → EMAIL_POR_CONFIRMAR_EMISSAO, nenhuma SessaoPOS', async () => {
    const { ctx, sessaoCaixaId } = await novoUtilizador();
    h.sessao = { user: { emailVerificado: false } };
    const antes = await sessoesPOS();

    esperarRegra(await capturarErro(() => abrir(sessaoCaixaId!, ctx)), 'EMAIL_POR_CONFIRMAR_EMISSAO');

    expect(await sessoesPOS()).toEqual(antes);
    expect(await db.sessaoPOS.count({ where: { sessaoCaixaId } })).toBe(0);
  });

  it('e-mail por confirmar (emailVerificado ausente) → EMAIL_POR_CONFIRMAR_EMISSAO, nenhuma SessaoPOS', async () => {
    const { ctx, sessaoCaixaId } = await novoUtilizador();
    h.sessao = { user: {} };
    const antes = await sessoesPOS();

    esperarRegra(await capturarErro(() => abrir(sessaoCaixaId!, ctx)), 'EMAIL_POR_CONFIRMAR_EMISSAO');

    expect(await sessoesPOS()).toEqual(antes);
    expect(await db.sessaoPOS.count({ where: { sessaoCaixaId } })).toBe(0);
  });

  it('período de hoje FECHADO → PERIODO_FECHADO, nenhuma SessaoPOS', async () => {
    const { ctx, sessaoCaixaId } = await novoUtilizador();
    const antes = await sessoesPOS();

    const erro = await comPeriodoDeHojeFechado(() => capturarErro(() => abrir(sessaoCaixaId!, ctx)));

    esperarRegra(erro, 'PERIODO_FECHADO');
    expect(await sessoesPOS()).toEqual(antes);
    expect(await db.sessaoPOS.count({ where: { sessaoCaixaId } })).toBe(0);
  });

  it('sessão de caixa de outro tenant → NotFoundError, nenhuma SessaoPOS em nenhum dos tenants', async () => {
    const { ctx } = await novoUtilizador(TENANT, false);
    const antes = await sessoesPOS();

    const erro = await capturarErro(() => abrir(caixaOutroTenantId, ctx));

    expect(erro, `esperava NotFoundError, veio ${erro?.constructor?.name}: ${erro?.message}`).toBeInstanceOf(NotFoundError);
    expect(await sessoesPOS()).toEqual(antes);
    expect(await db.sessaoPOS.count({ where: { sessaoCaixaId: caixaOutroTenantId } })).toBe(0);
  });

  it('sessão de caixa inexistente → NotFoundError, nenhuma SessaoPOS', async () => {
    const { ctx } = await novoUtilizador(TENANT, false);
    const inexistente = `cinexistente${sufixo}x`;
    const antes = await sessoesPOS();

    const erro = await capturarErro(() => abrir(inexistente, ctx));

    expect(erro, `esperava NotFoundError, veio ${erro?.constructor?.name}: ${erro?.message}`).toBeInstanceOf(NotFoundError);
    expect(await sessoesPOS()).toEqual(antes);
    expect(await db.sessaoPOS.count({ where: { sessaoCaixaId: inexistente } })).toBe(0);
  });

  it('sessão de caixa FECHADA → SESSAO_CAIXA_FECHADA, nenhuma SessaoPOS', async () => {
    const { ctx, sessaoCaixaId } = await novoUtilizador();
    await runCtx(ctx, () => caixa.fecharSessao({ sessaoCaixaId: sessaoCaixaId!, fundoFinal: 1000 }, ctx));
    const sc = await db.sessaoCaixa.findFirst({ where: { id: sessaoCaixaId, tenantId: TENANT } });
    expect(sc.status, 'pré-condição: caixa fechada').toBe('FECHADA');
    const antes = await sessoesPOS();

    esperarRegra(await capturarErro(() => abrir(sessaoCaixaId!, ctx)), 'SESSAO_CAIXA_FECHADA');

    expect(await sessoesPOS()).toEqual(antes);
    expect(await db.sessaoPOS.count({ where: { sessaoCaixaId } })).toBe(0);
  });

  it('sessão de caixa aberta de outro utilizador → SESSAO_CAIXA_DE_OUTRO_UTILIZADOR, nenhuma SessaoPOS', async () => {
    const dono = await novoUtilizador();
    const intruso = await novoUtilizador(TENANT, false);
    const antes = await sessoesPOS();

    esperarRegra(
      await capturarErro(() => abrir(dono.sessaoCaixaId!, intruso.ctx)),
      'SESSAO_CAIXA_DE_OUTRO_UTILIZADOR',
    );

    expect(await sessoesPOS()).toEqual(antes);
    expect(await db.sessaoPOS.count({ where: { sessaoCaixaId: dono.sessaoCaixaId } })).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Venda depois de o período fechar
  // -------------------------------------------------------------------------

  it('sessão aberta com o período aberto; o período fecha; a venda POS é recusada com PERIODO_FECHADO e nada é escrito', async () => {
    const { ctx, sessaoCaixaId } = await novoUtilizador();
    const sessao: any = await abrir(sessaoCaixaId!, ctx);

    const input = CreateVendaSchema.parse({
      origem: 'POS',
      vendedorId: ctx.userId,
      sessaoPOSId: sessao.id,
      sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      itens: [{ produtoId, nomeProduto: 'Artigo 1000', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 }],
      pagamentos: [{ tipo: 'DINHEIRO', valor: 1160 }],
    });

    const contagens = async () => ({
      vendas: await db.venda.count({ where: { tenantId: TENANT } }),
      itensVenda: await db.itemVenda.count({ where: { tenantId: TENANT } }),
      pagamentosVenda: await db.pagamentoVenda.count({ where: { tenantId: TENANT } }),
      faturas: await db.fatura.count({ where: { tenantId: TENANT } }),
      lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
      partidas: await db.partidaLancamento.count({ where: { tenantId: TENANT } }),
      movimentosStock: await db.movimentoStock.count({ where: { tenantId: TENANT } }),
      movimentosCaixa: await db.movimentoCaixa.count({ where: { tenantId: TENANT } }),
      saldo: String((await db.saldoStock.findFirst({ where: { tenantId: TENANT, produtoId, localizacaoId, varianteProdutoId: '' } })).saldo),
      series: (await db.serieDocumento.findMany({ where: { tenantId: TENANT }, orderBy: { id: 'asc' } })).map(
        (s: any) => `${s.id}:${s.proximoNumero}`,
      ),
    });

    const { erro, antes, depois } = await comPeriodoDeHojeFechado(async () => {
      const antes = await contagens();
      const erro = await capturarErro(() => runCtx(ctx, () => vendaService.criar(input, ctx)));
      const depois = await contagens();
      return { erro, antes, depois };
    });

    esperarRegra(erro, 'PERIODO_FECHADO');
    expect(depois).toEqual(antes);
  });
});
