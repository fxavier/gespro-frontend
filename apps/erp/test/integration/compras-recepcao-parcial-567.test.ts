/**
 * Integração — issue #567: recepção parcial gera dívida e lançamento; pedido fecha em falta;
 * uma conta a pagar por recepção e nenhuma conta a pagar manual por pedido.
 *
 * Contrato (desenho aprovado no nó N567):
 *   - Cada recepção com aceite > 0 cria UMA `ContaPagar` (FACTURA) com `recebimentoCompraId`
 *     único, pelo valor das quantidades ACEITES: base líquida de desconto + IVA.
 *     `baseIva + valorIva = valorOriginal`; `taxaIva` = taxa comum dos itens ou null se mistas;
 *     bloco fiscal de dedução (`tipoAquisicao`, `numeroDocumento`, `dataDocumento`) null.
 *   - Lançamento por recepção: D 211 base / D 44311 IVA (suportado, ainda não dedutível —
 *     ADR-0034 §1) / C 421 base + IVA, na data da recepção.
 *   - Arredondamento telescópico ao nível do pedido: Σ das recepções que completam o pedido
 *     = `valorSubtotal − valorDesconto` (base) e `valorTotal` (dívida).
 *   - `RECEBIDO_PARCIAL → FECHADO_EM_FALTA` (terminal), motivo obrigatório em
 *     `PedidoCompra.motivoFecho`, permissão `compras:pedido:cancelar`; não lança nada.
 *   - CP manual com `pedidoCompraId` → `CONTA_PAGAR_PEDIDO_E_DA_RECEPCAO`;
 *     cancelar CP de recepção → `CONTA_PAGAR_DE_RECEPCAO`.
 *
 * Só a sessão (`@/lib/auth`) e `next/cache` são dobrados. Requer Docker (Testcontainers).
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const h = vi.hoisted(() => ({
  sessao: null as null | {
    user: { id: string; tenantId: string; permissions: string[]; acesso: 'aberto' | 'leitura' | 'fechado' };
  },
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => h.sessao) }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

type Resultado = { ok: boolean; data?: any; error?: { code: string; message: string } };

const TODAS = [
  'compras:ver',
  'compras:pedido:criar',
  'compras:pedido:editar',
  'compras:pedido:enviar',
  'compras:pedido:cancelar',
  'compras:recebimento:registar',
  'compras:conta-pagar:criar',
  'compras:conta-pagar:cancelar',
];

describe.skipIf(skip)('Recepção parcial: dívida, lançamento e fecho em falta (#567) — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let compras: Record<string, (...args: any[]) => Promise<any>>;
  let comprasActions: Record<string, (input: unknown) => Promise<Resultado>>;
  let fornecedoresActions: Record<string, (input: unknown) => Promise<Resultado>>;

  const sufixo = Date.now();
  const TENANT = `tenant-rp-567-${sufixo}`;
  const OUTRO = `tenant-rp-567-o-${sufixo}`;
  const USER = `user-rp-567-${sufixo}`;
  const USER_OUTRO = `user-rp-567-o-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };

  let fornecedorId = '';
  let produtoId = '';
  let loc = '';
  let contaGastoId = '';

  // Data da recepção: dois dias atrás (≠ hoje), para provar que é ela que data o lançamento.
  const DATA_RECEPCAO = new Date(Date.now() - 2 * 86_400_000);

  function sessao(userId = USER, tenantId = TENANT, permissions = TODAS) {
    h.sessao = { user: { id: userId, tenantId, permissions, acesso: 'aberto' } };
  }

  function action(mod: Record<string, (input: unknown) => Promise<Resultado>>, nome: string) {
    const fn = mod[nome];
    expect(typeof fn, `${nome} não está exportada`).toBe('function');
    return fn;
  }
  const receber = (input: unknown) => action(comprasActions, 'registarRecebimentoAction')(input);
  const fechar = (input: unknown) => action(comprasActions, 'fecharPedidoCompraEmFaltaAction')(input);
  const criarCP = (input: unknown) => action(fornecedoresActions, 'criarContaPagarAction')(input);
  const cancelarCP = (input: unknown) => action(fornecedoresActions, 'cancelarContaPagarAction')(input);

  function recusadaComoRegra(r: Resultado, oQue: string, codigo?: string) {
    expect(r.ok, `${oQue} foi aceite`).toBe(false);
    expect(r.error?.code, `${oQue} rebentou como erro interno: ${JSON.stringify(r)}`).not.toBe('ERRO_INTERNO');
    if (codigo) expect(r.error?.code, `${oQue}: ${JSON.stringify(r)}`).toBe(codigo);
  }

  async function serieCP(): Promise<number> {
    const s = await db.serieDocumento.findMany({ where: { tenantId: TENANT, tipo: 'CONTA_PAGAR' } });
    return s.reduce((acc: number, x: any) => acc + Number(x.proximoNumero), 0);
  }

  type ItemIn = { produto?: boolean; descricao: string; quantidade: number; preco: number; desconto?: number; taxa: number };

  async function pedidoEmTransito(itens: ItemIn[]): Promise<{ id: string; itens: string[] }> {
    const p = await runCtx(ctx, () =>
      compras.criarPedido(
        {
          fornecedorId,
          data: new Date(),
          condicoesPagamento: '30 dias',
          prazoEntregaDias: 10,
          dataEntregaPrevista: new Date(Date.now() + 10 * 86_400_000),
          enderecoEntrega: 'Av. Eduardo Mondlane, Maputo',
          itens: itens.map((i) => ({
            ...(i.produto ? { produtoId } : {}),
            descricao: i.descricao,
            quantidade: i.quantidade,
            unidadeMedida: 'UN',
            precoUnitario: i.preco,
            desconto: i.desconto ?? 0,
            taxaIva: i.taxa,
          })),
        },
        ctx,
      ),
    );
    sessao();
    for (const nome of ['enviarPedidoCompraAction', 'confirmarPedidoCompraAction', 'marcarPedidoCompraEmTransitoAction']) {
      const r = await action(comprasActions, nome)({ id: p.id });
      expect(r.ok, `${nome}: ${JSON.stringify(r)}`).toBe(true);
    }
    const linhas = await db.itemPedidoCompra.findMany({ where: { pedidoCompraId: p.id }, orderBy: { descricao: 'asc' } });
    return { id: p.id, itens: linhas.map((l: any) => l.id) };
  }

  const linha = (itemPedidoCompraId: string, recebida: number, rejeitada = 0) => ({
    itemPedidoCompraId,
    localizacaoDestinoId: loc,
    quantidadeRecebida: recebida,
    quantidadeAceita: recebida - rejeitada,
    quantidadeRejeitada: rejeitada,
    ...(rejeitada > 0 ? { motivoRejeicao: 'Caixa amolgada' } : {}),
  });

  const recepcao = (pedidoCompraId: string, itens: unknown[]) =>
    receber({ pedidoCompraId, data: DATA_RECEPCAO, numeroDocumento: `GR-567-${sufixo}`, itens });

  /** Partidas do lançamento de uma CP, como { '211': [tipo, valor], … }. */
  async function partidasDe(lancamentoId: string) {
    const ps = await db.partidaLancamento.findMany({ where: { lancamentoId }, include: { conta: true } });
    return ps
      .map((p: any) => [p.conta.codigo, p.tipo, Number(p.valor).toFixed(2)])
      .sort((a: any, b: any) => (a[0] + a[1]).localeCompare(b[0] + b[1]));
  }

  async function somaDebito211DoPedido(pedidoId: string): Promise<number> {
    const cps = await db.contaPagar.findMany({ where: { pedidoCompraId: pedidoId } });
    let soma = 0;
    for (const cp of cps) {
      const ps = await db.partidaLancamento.findMany({
        where: { lancamentoId: cp.lancamentoId, tipo: 'DEBITO', conta: { codigo: '211' } },
      });
      soma += ps.reduce((a: number, p: any) => a + Number(p.valor), 0);
    }
    return Math.round(soma * 100) / 100;
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ comprasService: compras } = (await import('@/server/services/compras/compras.service')) as any);
    comprasActions = (await import('@/server/actions/compras.actions')) as unknown as typeof comprasActions;
    fornecedoresActions = (await import('@/server/actions/fornecedores.actions')) as unknown as typeof fornecedoresActions;
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    for (const [id, slug, nuit] of [
      [TENANT, `rp-567-${sufixo}`, `${sufixo}`.slice(-9)],
      [OUTRO, `rp-567-o-${sufixo}`, `${sufixo + 1}`.slice(-9)],
    ] as const) {
      await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit } });
    }
    await db.user.create({ data: { id: USER, tenantId: TENANT, email: `${USER}@test.mz`, nome: 'Compras', keycloakSub: `kc-${USER}` } });
    await db.user.create({ data: { id: USER_OUTRO, tenantId: OUTRO, email: `${USER_OUTRO}@test.mz`, nome: 'Outro', keycloakSub: `kc-${USER_OUTRO}` } });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, OUTRO), { timeout: 60_000 });

    fornecedorId = (
      await db.fornecedor.create({
        data: {
          tenantId: TENANT,
          codigo: `FOR-567-${sufixo}`,
          nome: 'Distribuidora da Matola Lda',
          tipo: 'PESSOA_JURIDICA',
          nuit: `4${String(sufixo).slice(-8)}`,
          email: `for-567-${sufixo}@test.mz`,
        },
      })
    ).id;
    const cat = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: `Cat 567 ${sufixo}` } });
    produtoId = (
      await db.produto.create({
        data: {
          tenantId: TENANT,
          sku: `SKU-567-${sufixo}`,
          nome: 'Caixa de parafusos',
          categoriaId: cat.id,
          unidadeMedida: 'UN',
          precoVenda: '150',
          precoCompra: '100',
          margemLucro: '0.5',
        },
      })
    ).id;
    loc = (await db.localizacao.create({ data: { tenantId: TENANT, codigo: `ARM-567-${sufixo}`, nome: 'Armazém 567', tipo: 'ARMAZEM' } })).id;
    contaGastoId = (
      await db.contaPGC.findFirst({
        where: { tenantId: TENANT, codigo: { startsWith: '6' }, aceitaLancamento: true, ativo: true },
        orderBy: { codigo: 'asc' },
      })
    ).id;
  }, 180_000);

  // 10 × 100, desconto 50 na linha, IVA 16 % ⇒ líquido 950, IVA 152, total 1 102.
  const PADRAO: ItemIn[] = [{ produto: true, descricao: 'A — Parafusos', quantidade: 10, preco: 100, desconto: 50, taxa: 0.16 }];

  it('(a)+(b) cada recepção cria a sua CP pelo aceite líquido de desconto; Σ D 211 = base das aceites; o fim bate com o pedido', async () => {
    const p = await pedidoEmTransito(PADRAO);
    const pedido = await db.pedidoCompra.findUnique({ where: { id: p.id } });
    const serieAntes = await serieCP();

    // (a) 8 de 10.
    const r1 = await recepcao(p.id, [linha(p.itens[0], 8)]);
    expect(r1.ok, JSON.stringify(r1)).toBe(true);
    const rec1 = await db.recebimentoCompra.findFirst({ where: { pedidoCompraId: p.id }, orderBy: { createdAt: 'asc' } });
    let cps = await db.contaPagar.findMany({ where: { pedidoCompraId: p.id }, orderBy: { createdAt: 'asc' } });
    expect(cps, 'a recepção parcial não criou conta a pagar').toHaveLength(1);
    expect(await serieCP()).toBe(serieAntes + 1);
    const cp1 = cps[0];
    expect(cp1.recebimentoCompraId).toBe(rec1.id);
    expect(cp1.tipoDocumento).toBe('FACTURA');
    expect(cp1.status).toBe('ABERTA');
    expect(cp1.fornecedorId).toBe(fornecedorId);
    expect(cp1.baseIva.toFixed(2)).toBe('760.00');
    expect(cp1.valorIva.toFixed(2)).toBe('121.60');
    expect(cp1.valorOriginal.toFixed(2)).toBe('881.60');
    expect(cp1.valorRestante.toFixed(2)).toBe('881.60');
    expect(cp1.baseIva.plus(cp1.valorIva).toFixed(2)).toBe(cp1.valorOriginal.toFixed(2));
    expect(Number(cp1.taxaIva)).toBe(0.16);
    expect(cp1.lancamentoId).toBeTruthy();
    expect(await partidasDe(cp1.lancamentoId)).toEqual([
      ['211', 'DEBITO', '760.00'],
      ['421', 'CREDITO', '881.60'],
      ['44311', 'DEBITO', '121.60'],
    ]);
    const l1 = await db.lancamento.findUnique({ where: { id: cp1.lancamentoId } });
    expect(l1).toMatchObject({ origem: 'COMPRA', documentoOrigemTipo: 'ContaPagar', documentoOrigemId: cp1.id });
    // A data é a da recepção, não a de hoje.
    expect(l1.data.toISOString().slice(0, 10)).toBe(DATA_RECEPCAO.toISOString().slice(0, 10));
    expect(cp1.dataEmissao.toISOString().slice(0, 10)).toBe(DATA_RECEPCAO.toISOString().slice(0, 10));
    expect(await somaDebito211DoPedido(p.id)).toBe(760);
    expect((await db.pedidoCompra.findUnique({ where: { id: p.id } })).status).toBe('RECEBIDO_PARCIAL');

    // (b) as 2 que faltam.
    const r2 = await recepcao(p.id, [linha(p.itens[0], 2)]);
    expect(r2.ok, JSON.stringify(r2)).toBe(true);
    cps = await db.contaPagar.findMany({ where: { pedidoCompraId: p.id }, orderBy: { createdAt: 'asc' } });
    expect(cps).toHaveLength(2);
    const cp2 = cps[1];
    expect(cp2.recebimentoCompraId).not.toBe(cp1.recebimentoCompraId);
    expect(cp2.baseIva.toFixed(2)).toBe('190.00');
    expect(cp2.valorIva.toFixed(2)).toBe('30.40');
    expect(cp2.valorOriginal.toFixed(2)).toBe('220.40');
    expect(await somaDebito211DoPedido(p.id)).toBe(Number(pedido.valorSubtotal.minus(pedido.valorDesconto)));
    const somaOriginal = cps.reduce((a: number, c: any) => a + Number(c.valorOriginal), 0);
    expect(somaOriginal.toFixed(2)).toBe(pedido.valorTotal.toFixed(2));
    expect((await db.pedidoCompra.findUnique({ where: { id: p.id } })).status).toBe('RECEBIDO_TOTAL');
  });

  it('(c) o rejeitado não entra na dívida nem no D 211', async () => {
    const p = await pedidoEmTransito(PADRAO);
    const r = await recepcao(p.id, [linha(p.itens[0], 5, 2)]);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const [cp] = await db.contaPagar.findMany({ where: { pedidoCompraId: p.id } });
    expect(cp.baseIva.toFixed(2)).toBe('285.00');
    expect(cp.valorIva.toFixed(2)).toBe('45.60');
    expect(cp.valorOriginal.toFixed(2)).toBe('330.60');
    expect(await somaDebito211DoPedido(p.id)).toBe(285);
  });

  it('(d) recepção só com rejeitados não cria CP nem avança a série', async () => {
    const p = await pedidoEmTransito(PADRAO);
    const serieAntes = await serieCP();
    const r = await recepcao(p.id, [linha(p.itens[0], 2, 2)]);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await db.contaPagar.count({ where: { pedidoCompraId: p.id } })).toBe(0);
    expect(await serieCP()).toBe(serieAntes);
  });

  it('(e) RECEBIDO_PARCIAL fecha em falta com motivo; terminal; não lança; recusas de estado, permissão e tenant', async () => {
    const p = await pedidoEmTransito(PADRAO);
    // Antes de receber: EM_TRANSITO não fecha em falta.
    sessao();
    recusadaComoRegra(await fechar({ id: p.id, motivo: 'Fornecedor sem stock' }), 'fechar EM_TRANSITO', 'TRANSICAO_INVALIDA');

    expect((await recepcao(p.id, [linha(p.itens[0], 8)])).ok).toBe(true);
    const lancAntes = await db.lancamento.count({ where: { tenantId: TENANT } });
    const cpAntes = await db.contaPagar.count({ where: { tenantId: TENANT } });

    // Motivo obrigatório.
    expect((await fechar({ id: p.id, motivo: '' })).ok, 'fechou sem motivo').toBe(false);
    // Sem permissão.
    sessao(USER, TENANT, TODAS.filter((x) => x !== 'compras:pedido:cancelar'));
    recusadaComoRegra(await fechar({ id: p.id, motivo: 'x' }), 'fechar sem permissão', 'SEM_PERMISSAO');
    // Outro tenant.
    sessao(USER_OUTRO, OUTRO, TODAS);
    recusadaComoRegra(await fechar({ id: p.id, motivo: 'x' }), 'fechar de outro tenant', 'NAO_ENCONTRADO');
    expect((await db.pedidoCompra.findUnique({ where: { id: p.id } })).status).toBe('RECEBIDO_PARCIAL');

    sessao();
    const r = await fechar({ id: p.id, motivo: 'Fornecedor descontinuou o artigo' });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const depois = await db.pedidoCompra.findUnique({ where: { id: p.id } });
    expect(depois.status).toBe('FECHADO_EM_FALTA');
    expect(depois.motivoFecho).toBe('Fornecedor descontinuou o artigo');
    expect(await db.lancamento.count({ where: { tenantId: TENANT } }), 'o fecho lançou').toBe(lancAntes);
    expect(await db.contaPagar.count({ where: { tenantId: TENANT } }), 'o fecho criou CP').toBe(cpAntes);

    // Terminal: nem recepção nem novo fecho.
    recusadaComoRegra(await recepcao(p.id, [linha(p.itens[0], 2)]), 'receber pedido fechado em falta');
    recusadaComoRegra(await fechar({ id: p.id, motivo: 'de novo' }), 'fechar duas vezes', 'TRANSICAO_INVALIDA');
    expect(await db.recebimentoCompra.count({ where: { pedidoCompraId: p.id } })).toBe(1);
  });

  it('(e) RECEBIDO_TOTAL não fecha em falta', async () => {
    const p = await pedidoEmTransito(PADRAO);
    expect((await recepcao(p.id, [linha(p.itens[0], 10)])).ok).toBe(true);
    sessao();
    recusadaComoRegra(await fechar({ id: p.id, motivo: 'x' }), 'fechar RECEBIDO_TOTAL', 'TRANSICAO_INVALIDA');
  });

  it('(f) CP manual com pedidoCompraId é recusada e a série não avança', async () => {
    const p = await pedidoEmTransito(PADRAO);
    expect((await recepcao(p.id, [linha(p.itens[0], 8)])).ok).toBe(true);
    const serieAntes = await serieCP();
    const cpAntes = await db.contaPagar.count({ where: { pedidoCompraId: p.id } });
    sessao();
    const r = await criarCP({
      fornecedorId,
      pedidoCompraId: p.id,
      descricao: 'Factura do resto',
      valorOriginal: 220.4,
      dataEmissao: new Date(),
      dataVencimento: new Date(Date.now() + 30 * 86_400_000),
      contaContabilId: contaGastoId,
    });
    recusadaComoRegra(r, 'CP manual com pedido', 'CONTA_PAGAR_PEDIDO_E_DA_RECEPCAO');
    expect(await serieCP()).toBe(serieAntes);
    expect(await db.contaPagar.count({ where: { pedidoCompraId: p.id } })).toBe(cpAntes);
  });

  it('(f) segunda CP com o mesmo recebimentoCompraId viola a unicidade', async () => {
    const p = await pedidoEmTransito(PADRAO);
    expect((await recepcao(p.id, [linha(p.itens[0], 8)])).ok).toBe(true);
    const [cp] = await db.contaPagar.findMany({ where: { pedidoCompraId: p.id } });
    await expect(
      db.contaPagar.create({
        data: {
          tenantId: TENANT,
          numero: `DUP-567-${sufixo}`,
          fornecedorId,
          pedidoCompraId: p.id,
          recebimentoCompraId: cp.recebimentoCompraId,
          descricao: 'duplicada',
          valorOriginal: 1,
          valorRestante: 1,
          dataEmissao: new Date(),
          dataVencimento: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it('(f) duas recepções concorrentes do mesmo resto: uma passa, uma CP por recepção', async () => {
    const p = await pedidoEmTransito(PADRAO);
    sessao();
    const [a, b] = await Promise.all([recepcao(p.id, [linha(p.itens[0], 10)]), recepcao(p.id, [linha(p.itens[0], 10)])]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const recs = await db.recebimentoCompra.count({ where: { pedidoCompraId: p.id } });
    const cps = await db.contaPagar.findMany({ where: { pedidoCompraId: p.id } });
    expect(recs).toBe(1);
    expect(cps).toHaveLength(1);
    expect(cps[0].valorOriginal.toFixed(2)).toBe('1102.00');
  });

  it('(g) sem documento do fornecedor não nasce IVA dedutível: 4432x intactas e bloco fiscal nulo', async () => {
    const p = await pedidoEmTransito(PADRAO);
    expect((await recepcao(p.id, [linha(p.itens[0], 10)])).ok).toBe(true);
    const [cp] = await db.contaPagar.findMany({ where: { pedidoCompraId: p.id } });
    expect(cp.tipoAquisicao).toBeNull();
    expect(cp.numeroDocumento).toBeNull();
    expect(cp.dataDocumento).toBeNull();
    const ded = await db.partidaLancamento.count({
      where: { lancamentoId: cp.lancamentoId, conta: { codigo: { startsWith: '4432' } } },
    });
    expect(ded).toBe(0);
  });

  it('(h) cancelar CP nascida de recepção é recusado e nada se estorna', async () => {
    const p = await pedidoEmTransito(PADRAO);
    expect((await recepcao(p.id, [linha(p.itens[0], 8)])).ok).toBe(true);
    const [cp] = await db.contaPagar.findMany({ where: { pedidoCompraId: p.id } });
    sessao();
    recusadaComoRegra(await cancelarCP({ id: cp.id, motivo: 'Engano' }), 'cancelar CP de recepção', 'CONTA_PAGAR_DE_RECEPCAO');
    const depois = await db.contaPagar.findUnique({ where: { id: cp.id } });
    expect(depois.status).toBe('ABERTA');
    const l = await db.lancamento.findUnique({ where: { id: cp.lancamentoId } });
    expect(l.status).not.toBe('ESTORNADO');
  });

  it('(i) taxas mistas: taxaIva null e valorIva = Σ das linhas', async () => {
    const p = await pedidoEmTransito([
      { produto: true, descricao: 'A — Parafusos', quantidade: 4, preco: 100, taxa: 0.16 },
      { descricao: 'B — Livro técnico', quantidade: 2, preco: 500, taxa: 0 },
    ]);
    expect((await recepcao(p.id, [linha(p.itens[0], 4), linha(p.itens[1], 2)])).ok).toBe(true);
    const [cp] = await db.contaPagar.findMany({ where: { pedidoCompraId: p.id } });
    expect(cp.taxaIva).toBeNull();
    expect(cp.baseIva.toFixed(2)).toBe('1400.00');
    expect(cp.valorIva.toFixed(2)).toBe('64.00');
    expect(cp.valorOriginal.toFixed(2)).toBe('1464.00');
    expect(await partidasDe(cp.lancamentoId)).toEqual([
      ['211', 'DEBITO', '1400.00'],
      ['421', 'CREDITO', '1464.00'],
      ['44311', 'DEBITO', '64.00'],
    ]);
  });
});
