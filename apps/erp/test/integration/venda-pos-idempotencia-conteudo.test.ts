/**
 * Oráculo S5 (adenda) — a chave de idempotência cobre o CONTEÚDO FISCAL da venda, não só o total
 * (ADR-0041 §5; issue #309)
 *
 * Contrato:
 *   - mesma chave + mesmo total mas outras linhas (outra combinação quantidade/preço) →
 *     BusinessRuleError `CHAVE_IDEMPOTENCIA_REUTILIZADA`, nada escrito, séries intactas;
 *   - mesma chave + mesmo total + mesmas linhas mas outra repartição de pagamentos
 *     (DINHEIRO vs CARTAO) → `CHAVE_IDEMPOTENCIA_REUTILIZADA`, nada escrito;
 *   - mesma chave + payload idêntico excepto o `troco` do pagamento a dinheiro → devolve a venda
 *     EXISTENTE (o troco não é conteúdo fiscal), nada escrito;
 *   - 4 chamadas concorrentes idênticas com a mesma chave → TODAS resolvem (0 recusadas), mesmo
 *     id, exactamente uma venda/factura gravada;
 *   - um retry não duplica a Comissao da venda (a regra padrão de 5% cria sempre uma comissão).
 *
 * Mesmo arnês do oráculo S5 (`venda-pos-idempotencia.test.ts`): Postgres real (Testcontainers),
 * caminho real `vendaService.criar`, inputs por `CreateVendaSchema.parse`. A sessão é o único duplo.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

const dec = (v: unknown) => new Prisma.Decimal(String(v));

interface TenantMontado {
  tenantId: string;
  userId: string;
  ctx: { tenantId: string; userId: string };
  produtoId: string;
  localizacaoId: string;
  sessaoCaixaId: string;
  sessaoPOSId: string;
}

describe.skipIf(skip)('Venda POS idempotente — conteúdo fiscal completo da chave — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let vendaService: (typeof import('@/server/services/comercial'))['vendaService'];
  let CreateVendaSchema: (typeof import('@/lib/validations/vendas'))['CreateVendaSchema'];
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];

  const sufixo = Date.now();
  let A: TenantMontado;

  let contadorChaves = 0;
  const novaChave = () => `pos-${sufixo}-${++contadorChaves}-${Math.random().toString(36).slice(2, 10)}`;

  // 1 × 1000 @16% → total 1160
  const itensMil = (t: TenantMontado) => [
    { produtoId: t.produtoId, nomeProduto: 'Artigo 1000', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 },
  ];
  // 2 × 1000 @16% → total 2320
  const itensDoisMil = (t: TenantMontado) => [
    { produtoId: t.produtoId, nomeProduto: 'Artigo 1000', quantidade: 2, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 },
  ];

  function inputVenda(t: TenantMontado, itens: unknown[], pagamentos: unknown[], extra: Record<string, unknown> = {}) {
    return CreateVendaSchema.parse({
      origem: 'POS',
      vendedorId: t.userId,
      sessaoPOSId: t.sessaoPOSId,
      sessaoCaixaId: t.sessaoCaixaId,
      localizacaoOrigemId: t.localizacaoId,
      itens,
      pagamentos,
      ...extra,
    });
  }

  /** Venda paga a dinheiro de 1160 (ou 2320 com `dois`), com chave opcional. */
  function inputMil(t: TenantMontado, chave?: string) {
    return inputVenda(t, itensMil(t), [{ tipo: 'DINHEIRO', valor: 1160 }], chave === undefined ? {} : { chaveIdempotencia: chave });
  }
  function inputDoisMil(t: TenantMontado, chave?: string) {
    return inputVenda(t, itensDoisMil(t), [{ tipo: 'DINHEIRO', valor: 2320 }], chave === undefined ? {} : { chaveIdempotencia: chave });
  }

  function criar(t: TenantMontado, input: unknown): Promise<any> {
    return runCtx(t.ctx, () => vendaService.criar(input as never, t.ctx));
  }

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  // ── leituras ───────────────────────────────────────────────────────────────
  async function proximoNumeroDaSerie(t: TenantMontado, tipo: string): Promise<number> {
    const series = await db.serieDocumento.findMany({ where: { tenantId: t.tenantId, tipo, ativo: true } });
    expect(series.length, `série activa ${tipo}`).toBeGreaterThan(0);
    return series.reduce((a: number, s: any) => a + s.proximoNumero, 0);
  }

  async function saldoStock(t: TenantMontado) {
    const s = await db.saldoStock.findFirst({
      where: { tenantId: t.tenantId, produtoId: t.produtoId, localizacaoId: t.localizacaoId, varianteProdutoId: '' },
    });
    return dec(s.saldo).toString();
  }

  async function contagens(t: TenantMontado) {
    const tenantId = t.tenantId;
    return {
      comissoes: await db.comissao.count({ where: { tenantId } }),
      vendas: await db.venda.count({ where: { tenantId } }),
      itensVenda: await db.itemVenda.count({ where: { tenantId } }),
      pagamentosVenda: await db.pagamentoVenda.count({ where: { tenantId } }),
      faturas: await db.fatura.count({ where: { tenantId } }),
      linhasFatura: await db.linhaFatura.count({ where: { tenantId } }),
      lancamentos: await db.lancamento.count({ where: { tenantId } }),
      partidas: await db.partidaLancamento.count({ where: { tenantId } }),
      movimentosStock: await db.movimentoStock.count({ where: { tenantId } }),
      movimentosCaixa: await db.movimentoCaixa.count({ where: { tenantId } }),
      saldo: await saldoStock(t),
      serieVenda: await proximoNumeroDaSerie(t, 'VENDA'),
      serieFR: await proximoNumeroDaSerie(t, 'FATURA_RECIBO'),
    };
  }

  async function vendasComChave(t: TenantMontado, chave: string) {
    return db.venda.findMany({ where: { tenantId: t.tenantId, chaveIdempotencia: chave } });
  }

  // ── montagem de um tenant (como no oráculo S2) ─────────────────────────────
  async function montarTenant(tag: string): Promise<TenantMontado> {
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');
    const caixa = await import('@/server/services/financas/caixa.service');

    const tenantId = `tenant-pos-idemc-${tag}-${sufixo}`;
    // CreateVendaSchema exige cuid em vendedorId: forma `c` + alfanuméricos.
    const userId = `cposidemc${tag}${sufixo}`;
    const ctx = { tenantId, userId };

    await db.tenant.create({
      data: { id: tenantId, nome: `Tenant POS idempotência ${tag}`, slug: `pos-idemc-${tag}-${sufixo}`, nuit: `${tag === 'a' ? 1 : 2}${`${sufixo}`.slice(-8)}` },
    });
    await db.user.create({
      data: { id: userId, tenantId, email: `pos-idemc-${tag}-${sufixo}@test.mz`, nome: 'Vendedor POS', keycloakSub: `kc-pos-idemc-${tag}-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, tenantId), { timeout: 60_000 });

    const categoria = await db.categoriaProduto.create({ data: { tenantId, nome: 'Mercadorias' } });
    const produto = await db.produto.create({
      data: {
        tenantId,
        sku: `SKU-POS-IDEMC-${tag}-${sufixo}`,
        nome: 'Artigo de balcão',
        categoriaId: categoria.id,
        unidadeMedida: 'UN',
        precoVenda: 1000,
        precoCompra: 700,
        margemLucro: 0.3,
        taxaIva: 0.16,
      },
    });
    const loc = await db.localizacao.create({
      data: { tenantId, codigo: `ARM-POS-IDEMC-${tag}-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    await db.saldoStock.create({
      data: { tenantId, produtoId: produto.id, varianteProdutoId: '', localizacaoId: loc.id, saldo: 10_000, saldoReservado: 0 },
    });

    const sessaoCaixa: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial: 1000 }, ctx));
    const sessaoPOS = await db.sessaoPOS.create({
      data: { tenantId, vendedorId: userId, sessaoCaixaId: sessaoCaixa.id, status: 'ABERTA' },
    });

    return {
      tenantId,
      userId,
      ctx,
      produtoId: produto.id,
      localizacaoId: loc.id,
      sessaoCaixaId: sessaoCaixa.id,
      sessaoPOSId: sessaoPOS.id,
    };
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ vendaService } = await import('@/server/services/comercial'));
    ({ CreateVendaSchema } = await import('@/lib/validations/vendas'));
    ({ BusinessRuleError } = await import('@/lib/errors'));
    A = await montarTenant('a');
  }, 120_000);

  // 2 × 500 @16% → total 1160 (mesmo total que itensMil, outras linhas)
  const itensDoisQuinhentos = (t: TenantMontado) => [
    { produtoId: t.produtoId, nomeProduto: 'Artigo 1000', quantidade: 2, precoUnitario: 500, desconto: 0, taxaIva: 0.16 },
  ];

  async function comissoesDaVenda(t: TenantMontado, vendaId: string) {
    return db.comissao.count({ where: { tenantId: t.tenantId, vendaId } });
  }

  // -------------------------------------------------------------------------
  // Mesmo total, outro conteúdo fiscal
  // -------------------------------------------------------------------------

  it('mesma chave + mesmo total mas outras linhas → CHAVE_IDEMPOTENCIA_REUTILIZADA e nada é gravado', async () => {
    const chave = novaChave();
    const original = await criar(A, inputMil(A, chave));
    const antes = await contagens(A);

    const outro = inputVenda(A, itensDoisQuinhentos(A), [{ tipo: 'DINHEIRO', valor: 1160 }], { chaveIdempotencia: chave });
    const erro = await capturarErro(() => criar(A, outro));

    expect(erro, 'outras linhas com o mesmo total tinham de ser recusadas').toBeDefined();
    expect(erro).toBeInstanceOf(BusinessRuleError);
    expect(erro.code).toBe('CHAVE_IDEMPOTENCIA_REUTILIZADA');
    expect(await contagens(A)).toEqual(antes);

    const gravadas = await vendasComChave(A, chave);
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0].id).toBe(original.id);
    const itens = await db.itemVenda.findMany({ where: { tenantId: A.tenantId, vendaId: original.id } });
    expect(itens).toHaveLength(1);
    expect(dec(itens[0].quantidade).equals(dec(1))).toBe(true);
    expect(dec(itens[0].precoUnitario).equals(dec(1000))).toBe(true);
  });

  it('mesma chave + mesmo total + mesmas linhas mas outra repartição de pagamentos → CHAVE_IDEMPOTENCIA_REUTILIZADA', async () => {
    const chave = novaChave();
    const original = await criar(A, inputVenda(A, itensMil(A), [{ tipo: 'DINHEIRO', valor: 1160 }], { chaveIdempotencia: chave }));
    const antes = await contagens(A);

    const erro = await capturarErro(() =>
      criar(A, inputVenda(A, itensMil(A), [{ tipo: 'CARTAO', valor: 1160 }], { chaveIdempotencia: chave })),
    );

    expect(erro, 'outra repartição de pagamentos tinha de ser recusada').toBeDefined();
    expect(erro).toBeInstanceOf(BusinessRuleError);
    expect(erro.code).toBe('CHAVE_IDEMPOTENCIA_REUTILIZADA');
    expect(await contagens(A)).toEqual(antes);

    const gravadas = await vendasComChave(A, chave);
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0].id).toBe(original.id);
    const pagamentos = await db.pagamentoVenda.findMany({ where: { tenantId: A.tenantId, vendaId: original.id } });
    expect(pagamentos.map((p: any) => p.tipo)).toEqual(['DINHEIRO']);
  });

  // -------------------------------------------------------------------------
  // Troco não é conteúdo fiscal
  // -------------------------------------------------------------------------

  it('mesma chave + payload idêntico excepto o troco → devolve a venda existente e não escreve nada', async () => {
    const chave = novaChave();
    const primeira = await criar(
      A,
      inputVenda(A, itensMil(A), [{ tipo: 'DINHEIRO', valor: 1160, troco: 0 }], { chaveIdempotencia: chave }),
    );
    const gravada = await db.venda.findFirst({ where: { id: primeira.id, tenantId: A.tenantId } });
    const antes = await contagens(A);

    const segunda = await criar(
      A,
      inputVenda(A, itensMil(A), [{ tipo: 'DINHEIRO', valor: 1160, troco: 40 }], { chaveIdempotencia: chave }),
    );

    expect(segunda.id).toBe(primeira.id);
    expect(segunda.numero).toBe(gravada.numero);
    expect(segunda.faturaId).toBe(gravada.faturaId);
    expect(await contagens(A)).toEqual(antes);
    expect(await vendasComChave(A, chave)).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Corrida concorrente — todas resolvem
  // -------------------------------------------------------------------------

  it('4 chamadas concorrentes idênticas com a mesma chave: todas resolvem com o mesmo id; uma venda e uma factura', async () => {
    const chave = novaChave();
    const antes = await contagens(A);

    const resultados = await Promise.allSettled(
      Array.from({ length: 4 }, () => criar(A, inputMil(A, chave))),
    );

    const recusados = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(
      recusados.length,
      `nenhuma pode ser recusada; erros: ${recusados.map((r) => String(r.reason?.code ?? r.reason?.message ?? r.reason)).join(' | ')}`,
    ).toBe(0);
    const ids = new Set(resultados.map((r) => (r as PromiseFulfilledResult<any>).value.id));
    expect(ids.size).toBe(1);

    const gravadas = await vendasComChave(A, chave);
    expect(gravadas).toHaveLength(1);
    expect([...ids][0]).toBe(gravadas[0].id);
    expect(gravadas[0].faturaId).toBeTruthy();

    const depois = await contagens(A);
    expect(depois.vendas).toBe(antes.vendas + 1);
    expect(depois.faturas).toBe(antes.faturas + 1);
    expect(depois.serieVenda).toBe(antes.serieVenda + 1);
    expect(depois.serieFR).toBe(antes.serieFR + 1);
    expect(depois.movimentosCaixa).toBe(antes.movimentosCaixa + 1);
    expect(depois.lancamentos).toBe(antes.lancamentos + 1);
    expect(dec(depois.saldo).equals(dec(antes.saldo).minus(1))).toBe(true);
    expect(await comissoesDaVenda(A, gravadas[0].id), 'uma só comissão').toBe(1);
  });

  // -------------------------------------------------------------------------
  // Comissões
  // -------------------------------------------------------------------------

  it('um retry não duplica a comissão da venda', async () => {
    const chave = novaChave();
    const primeira = await criar(A, inputMil(A, chave));
    const comissoesPrimeira = await comissoesDaVenda(A, primeira.id);
    // A regra padrão (5%) cria uma comissão por venda com vendedor.
    expect(comissoesPrimeira, 'a primeira venda regista a sua comissão').toBe(1);
    const antes = await contagens(A);

    const segunda = await criar(A, inputMil(A, chave));
    const terceira = await criar(A, inputMil(A, chave));

    expect(segunda.id).toBe(primeira.id);
    expect(terceira.id).toBe(primeira.id);
    expect(await comissoesDaVenda(A, primeira.id)).toBe(1);
    expect(await contagens(A)).toEqual(antes);
  });
});
