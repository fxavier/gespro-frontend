/**
 * Oráculo #327 — anular uma venda POS depois de a sessão de caixa da venda ter fechado
 * («dia seguinte»).
 *
 * Defeito: `vendaService.anular` registava a DEVOLUCAO em numerário na sessão de caixa DA VENDA;
 * fechado o caixa, o botão «Anular venda» continuava visível e falhava com SESSAO_CAIXA_FECHADA.
 *
 * Contrato (decisão do orquestrador, conservadora — alinhada com devolução/troca e com
 * `resolverContaMeioPagamento`/`liquidarNotaCredito`):
 *   - a parte em DINHEIRO a devolver sai da sessão de caixa ABERTA do utilizador que anula
 *     (`responsavelId = ctx.userId`, `status = ABERTA`) — nunca da sessão da venda só por ser a
 *     da venda, e nunca de uma sessão de outro utilizador;
 *   - a sessão da venda, se fechada, não recebe movimento nenhum e fica como estava;
 *   - havendo dinheiro a devolver e o utilizador sem sessão de caixa aberta → recusa com
 *     BusinessRuleError `SESSAO_CAIXA_NECESSARIA` (mensagem que fala do caixa) e nada é escrito:
 *     nem NC, lançamento, caixa, stock; série NOTA_CREDITO intacta; venda no estado anterior;
 *   - venda sem dinheiro (só cartão) anula-se mesmo sem sessão de caixa aberta, sem mexer na caixa;
 *   - o resto da anulação (NC total liquidada, stock, venda CANCELADA) é o contrato S7/#322,
 *     coberto em `venda-pos-anulacao.test.ts` e `venda-pos-anulacao-credito-322.test.ts`.
 *
 * Harness: o de `venda-pos-anulacao.test.ts` — tenant pelos serviços reais
 * (`bootstrapContabilidade`, `abrirSessao`/`fecharSessao` do caixa), vendas por
 * `vendaService.criar`. A sessão (auth) é o único duplo.
 *
 * Requer: Docker em execução + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

const dec = (v: unknown) => new Prisma.Decimal(String(v));

type Ctx = { tenantId: string; userId: string };
type Operador = { ctx: Ctx; sessaoCaixaId: string; sessaoPOSId: string };

describe.skipIf(skip)('#327 — anular venda POS com a sessão de caixa da venda fechada — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let vendaService: (typeof import('@/server/services/comercial'))['vendaService'];
  let CreateVendaSchema: (typeof import('@/lib/validations/vendas'))['CreateVendaSchema'];
  let caixa: typeof import('@/server/services/financas/caixa.service');
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];

  const sufixo = Date.now();
  const TENANT = `tenant-pos-anul-327-${sufixo}`;
  let seq = 0;

  let produtoId: string;
  let localizacaoId: string;
  let clienteId: string;

  // 1 × 1000 @16% → 1160
  function itensMil() {
    return [{ produtoId, nomeProduto: 'Artigo 1000', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 }];
  }

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
    expect(erro.code, `veio ${erro?.code}: ${erro?.message}`).toBe(codigo);
  }

  async function novoUtilizador(): Promise<Ctx> {
    seq += 1;
    const userId = `cposa327${sufixo}u${seq}`;
    await db.user.create({
      data: { id: userId, tenantId: TENANT, email: `pos-a327-${sufixo}-${seq}@test.mz`, nome: `Utilizador ${seq}`, keycloakSub: `kc-pos-a327-${sufixo}-${seq}` },
    });
    return { tenantId: TENANT, userId };
  }

  async function abrirCaixa(ctx: Ctx): Promise<string> {
    const sc: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial: 1000 }, ctx));
    return sc.id;
  }

  async function novoOperador(): Promise<Operador> {
    const ctx = await novoUtilizador();
    const sessaoCaixaId = await abrirCaixa(ctx);
    const sp = await db.sessaoPOS.create({ data: { tenantId: TENANT, vendedorId: ctx.userId, sessaoCaixaId, status: 'ABERTA' } });
    return { ctx, sessaoCaixaId, sessaoPOSId: sp.id };
  }

  async function fecharCaixa(ctx: Ctx, sessaoCaixaId: string) {
    await runCtx(ctx, () => caixa.fecharSessao({ sessaoCaixaId, fundoFinal: 0 }, ctx));
    const s = await db.sessaoCaixa.findFirst({ where: { id: sessaoCaixaId, tenantId: TENANT } });
    expect(s.status, 'pré-condição: sessão de caixa da venda fechada').not.toBe('ABERTA');
  }

  async function vender(pagamentos: unknown[], quem: Operador, comCliente = false) {
    const input = CreateVendaSchema.parse({
      origem: 'POS',
      vendedorId: quem.ctx.userId,
      sessaoPOSId: quem.sessaoPOSId,
      sessaoCaixaId: quem.sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      ...(comCliente ? { clienteId } : {}),
      itens: itensMil(),
      pagamentos,
    });
    const row: any = await runCtx(quem.ctx, () => vendaService.criar(input, quem.ctx));
    const venda = await db.venda.findFirst({ where: { id: row.id, tenantId: TENANT } });
    expect(venda?.faturaId, 'pré-condição: venda com documento fiscal').toBeTruthy();
    expect(venda?.sessaoCaixaId).toBe(quem.sessaoCaixaId);
    return venda;
  }

  function anular(vendaId: string, motivo: string, ctx: Ctx) {
    expect(typeof (vendaService as any).anular, 'vendaService.anular publicado').toBe('function');
    return runCtx(ctx, () => (vendaService as any).anular(vendaId, { motivo }, ctx));
  }

  async function proximoNumeroDaSerie(tipo: string): Promise<number> {
    const series = await db.serieDocumento.findMany({ where: { tenantId: TENANT, tipo, ativo: true } });
    expect(series.length, `série activa ${tipo}`).toBeGreaterThan(0);
    return series.reduce((a: number, s: any) => a + s.proximoNumero, 0);
  }

  async function contagens() {
    const saldo = await db.saldoStock.findFirst({ where: { tenantId: TENANT, produtoId, localizacaoId, varianteProdutoId: '' } });
    return {
      notasCredito: await db.notaCredito.count({ where: { tenantId: TENANT } }),
      lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
      partidas: await db.partidaLancamento.count({ where: { tenantId: TENANT } }),
      movimentosStock: await db.movimentoStock.count({ where: { tenantId: TENANT } }),
      movimentosCaixa: await db.movimentoCaixa.count({ where: { tenantId: TENANT } }),
      vendasCanceladas: await db.venda.count({ where: { tenantId: TENANT, status: 'CANCELADA' } }),
      saldo: dec(saldo.saldo).toString(),
      serieNC: await proximoNumeroDaSerie('NOTA_CREDITO'),
    };
  }

  /** A sessão e os seus movimentos, tal como persistidos — uma sessão fechada não se toca. */
  async function fotografiaSessao(sessaoCaixaId: string) {
    const sessao = await db.sessaoCaixa.findFirst({ where: { id: sessaoCaixaId, tenantId: TENANT } });
    const movimentos = await db.movimentoCaixa.findMany({ where: { sessaoCaixaId, tenantId: TENANT }, orderBy: { id: 'asc' } });
    return { sessao, movimentos };
  }

  async function devolucoesDaNC(vendaFaturaId: string) {
    const nc = await db.notaCredito.findFirst({ where: { tenantId: TENANT, faturaOriginalId: vendaFaturaId } });
    expect(nc, 'NC emitida pela anulação').not.toBeNull();
    const movs = await db.movimentoCaixa.findMany({
      where: { tenantId: TENANT, tipo: 'DEVOLUCAO', documentoOrigemId: nc.id },
    });
    return { nc, movs };
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ vendaService } = await import('@/server/services/comercial'));
    ({ CreateVendaSchema } = await import('@/lib/validations/vendas'));
    caixa = await import('@/server/services/financas/caixa.service');
    ({ BusinessRuleError } = await import('@/lib/errors'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant POS Anulação #327', slug: `pos-anul-327-${sufixo}`, nuit: `5${String(sufixo).slice(-8)}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const produto = await db.produto.create({
      data: {
        tenantId: TENANT,
        sku: `SKU-POS-A327-${sufixo}`,
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
      data: { tenantId: TENANT, codigo: `ARM-POS-A327-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    await db.saldoStock.create({
      data: { tenantId: TENANT, produtoId, varianteProdutoId: '', localizacaoId, saldo: 10_000, saldoReservado: 0 },
    });
    const cliente = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente a Crédito #327',
        tipo: 'JURIDICA',
        nuit: '400000327',
        email: `cliente-pos-a327-${sufixo}@test.mz`,
        telefone: '840000327',
        codigo: `CLI-POS-A327-${sufixo}`,
        diasPagamento: 30,
        limiteCreditoMT: 10_000_000,
      },
    });
    clienteId = cliente.id;
  });

  // -------------------------------------------------------------------------
  // Dia seguinte: o mesmo operador fechou o caixa da venda e abriu um novo
  // -------------------------------------------------------------------------

  it('venda a dinheiro, caixa da venda fechado, operador com novo caixa aberto → anula; DEVOLUCAO 1160 no caixa ABERTO do operador; a sessão fechada fica intacta', async () => {
    const op = await novoOperador();
    const venda = await vender([{ tipo: 'DINHEIRO', valor: 1160 }], op);
    await fecharCaixa(op.ctx, op.sessaoCaixaId);
    const fotoFechada = await fotografiaSessao(op.sessaoCaixaId);
    const novaSessao = await abrirCaixa(op.ctx);
    const antes = await contagens();

    const erro = await capturarErro(() => anular(venda.id, 'Cliente voltou no dia seguinte', op.ctx));
    expect(erro, `a anulação no dia seguinte não pode falhar (veio ${erro?.code}: ${erro?.message})`).toBeUndefined();

    expect((await db.venda.findFirst({ where: { id: venda.id } })).status).toBe('CANCELADA');
    const { nc, movs } = await devolucoesDaNC(venda.faturaId);
    expect(nc.status).toBe('LIQUIDADA');
    expect(movs, 'uma DEVOLUCAO em numerário').toHaveLength(1);
    expect(movs[0].sessaoCaixaId, 'DEVOLUCAO no caixa aberto do operador, não no da venda').toBe(novaSessao);
    expect(dec(movs[0].valor).toFixed(2)).toBe('1160.00');
    expect(await fotografiaSessao(op.sessaoCaixaId), 'sessão da venda (fechada) intacta').toEqual(fotoFechada);

    const depois = await contagens();
    expect(depois.notasCredito).toBe(antes.notasCredito + 1);
    expect(depois.movimentosCaixa).toBe(antes.movimentosCaixa + 1);
    expect(dec(depois.saldo).minus(dec(antes.saldo)).toFixed(2), 'stock reposto').toBe('1.00');
  });

  it('venda mista a crédito (DINHEIRO 160 + CREDITO 1000), caixa da venda fechado, novo caixa aberto → anula; DEVOLUCAO 160 no caixa aberto; sessão fechada intacta', async () => {
    const op = await novoOperador();
    const venda = await vender(
      [
        { tipo: 'DINHEIRO', valor: 160 },
        { tipo: 'CREDITO', valor: 1000 },
      ],
      op,
      true,
    );
    expect(venda.status, 'pré-condição: venda a crédito FATURADA').toBe('FATURADA');
    await fecharCaixa(op.ctx, op.sessaoCaixaId);
    const fotoFechada = await fotografiaSessao(op.sessaoCaixaId);
    const novaSessao = await abrirCaixa(op.ctx);

    const erro = await capturarErro(() => anular(venda.id, 'Anulação a crédito no dia seguinte', op.ctx));
    expect(erro, `a anulação no dia seguinte não pode falhar (veio ${erro?.code}: ${erro?.message})`).toBeUndefined();

    expect((await db.venda.findFirst({ where: { id: venda.id } })).status).toBe('CANCELADA');
    const { movs } = await devolucoesDaNC(venda.faturaId);
    expect(movs).toHaveLength(1);
    expect(movs[0].sessaoCaixaId).toBe(novaSessao);
    expect(dec(movs[0].valor).toFixed(2)).toBe('160.00');
    expect(await fotografiaSessao(op.sessaoCaixaId)).toEqual(fotoFechada);
  });

  // -------------------------------------------------------------------------
  // A gaveta é a de quem anula
  // -------------------------------------------------------------------------

  it('outro utilizador com caixa aberto anula a venda (caixa do vendedor ainda aberto) → DEVOLUCAO no caixa de quem anula, nada no do vendedor', async () => {
    const vendedor = await novoOperador();
    const gestor = await novoOperador();
    const venda = await vender([{ tipo: 'DINHEIRO', valor: 1160 }], vendedor);
    const fotoVendedor = await fotografiaSessao(vendedor.sessaoCaixaId);

    await anular(venda.id, 'Anulada pelo gestor', gestor.ctx);

    const { movs } = await devolucoesDaNC(venda.faturaId);
    expect(movs).toHaveLength(1);
    expect(movs[0].sessaoCaixaId, 'DEVOLUCAO no caixa aberto de quem anula').toBe(gestor.sessaoCaixaId);
    expect(await fotografiaSessao(vendedor.sessaoCaixaId), 'caixa do vendedor não mexe').toEqual(fotoVendedor);
  });

  // -------------------------------------------------------------------------
  // Recusas — sem caixa aberto de quem anula, nada escrito
  // -------------------------------------------------------------------------

  it('caixa da venda fechado e operador SEM caixa aberto → SESSAO_CAIXA_NECESSARIA (mensagem sobre o caixa), nada escrito', async () => {
    const op = await novoOperador();
    const venda = await vender([{ tipo: 'DINHEIRO', valor: 1160 }], op);
    await fecharCaixa(op.ctx, op.sessaoCaixaId);
    const fotoFechada = await fotografiaSessao(op.sessaoCaixaId);
    const antes = await contagens();

    const erro = await capturarErro(() => anular(venda.id, 'Sem caixa aberto', op.ctx));

    esperarRegra(erro, 'SESSAO_CAIXA_NECESSARIA');
    expect(String(erro.message)).toMatch(/caixa/i);
    expect(await contagens()).toEqual(antes);
    expect(await fotografiaSessao(op.sessaoCaixaId)).toEqual(fotoFechada);
    expect((await db.venda.findFirst({ where: { id: venda.id } })).status).toBe('CONCLUIDA');
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: venda.faturaId } })).toBe(0);
  });

  it('caixa do vendedor ABERTO mas quem anula não tem caixa aberto → SESSAO_CAIXA_NECESSARIA, nada escrito (nunca a gaveta de outro)', async () => {
    const vendedor = await novoOperador();
    const semCaixa = await novoUtilizador();
    const venda = await vender([{ tipo: 'DINHEIRO', valor: 1160 }], vendedor);
    const fotoVendedor = await fotografiaSessao(vendedor.sessaoCaixaId);
    const antes = await contagens();

    esperarRegra(await capturarErro(() => anular(venda.id, 'Anulação sem caixa próprio', semCaixa)), 'SESSAO_CAIXA_NECESSARIA');

    expect(await contagens()).toEqual(antes);
    expect(await fotografiaSessao(vendedor.sessaoCaixaId)).toEqual(fotoVendedor);
    expect((await db.venda.findFirst({ where: { id: venda.id } })).status).toBe('CONCLUIDA');
  });

  // -------------------------------------------------------------------------
  // Sem dinheiro a devolver, o caixa não é preciso
  // -------------------------------------------------------------------------

  it('venda só a cartão, caixa da venda fechado e operador sem caixa aberto → anula sem mexer na caixa', async () => {
    const op = await novoOperador();
    const venda = await vender([{ tipo: 'CARTAO', valor: 1160 }], op);
    await fecharCaixa(op.ctx, op.sessaoCaixaId);
    const antes = await contagens();

    const erro = await capturarErro(() => anular(venda.id, 'Cartão no dia seguinte', op.ctx));
    expect(erro, `venda a cartão anula-se sem caixa (veio ${erro?.code}: ${erro?.message})`).toBeUndefined();

    expect((await db.venda.findFirst({ where: { id: venda.id } })).status).toBe('CANCELADA');
    const depois = await contagens();
    expect(depois.movimentosCaixa, 'sem dinheiro não mexe na caixa').toBe(antes.movimentosCaixa);
    expect(depois.notasCredito).toBe(antes.notasCredito + 1);
  });
});
