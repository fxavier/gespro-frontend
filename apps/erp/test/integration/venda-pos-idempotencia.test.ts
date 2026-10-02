/**
 * Oráculo S5 — idempotência da venda POS (ADR-0041 §5; issue #309)
 *
 * Contrato:
 *   - `CreateVendaSchema` aceita `chaveIdempotencia` opcional (1–100 caracteres) e não a descarta;
 *   - `Venda.chaveIdempotencia` com `@@unique([tenantId, chaveIdempotencia])`;
 *   - `vendaService.criar` com uma chave já usada no tenant devolve a venda EXISTENTE (mesmo id,
 *     número e factura) e não escreve nada: nem Venda, Fatura, LinhaFatura, Lancamento,
 *     PartidaLancamento, MovimentoStock, MovimentoCaixa; saldo de stock intacto; séries VENDA e
 *     FATURA_RECIBO não avançam;
 *   - duas chamadas concorrentes com a mesma chave → exactamente uma venda/factura/lançamento;
 *     todas as chamadas que resolvem devolvem essa mesma venda (pelo menos uma resolve);
 *   - mesma chave com outro conteúdo (outro total) → BusinessRuleError
 *     `CHAVE_IDEMPOTENCIA_REUTILIZADA`, nada escrito;
 *   - a mesma chave noutro tenant é independente;
 *   - sem chave, duas chamadas idênticas criam duas vendas (nenhuma deduplicação acidental).
 *
 * Contra Postgres real (Testcontainers), pelo caminho real `vendaService.criar`, com o tenant
 * montado como no oráculo S2 (`venda-pos-documento.test.ts`). A sessão (auth) é o único duplo.
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

describe.skipIf(skip)('Venda POS idempotente por chave — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let vendaService: (typeof import('@/server/services/comercial'))['vendaService'];
  let CreateVendaSchema: (typeof import('@/lib/validations/vendas'))['CreateVendaSchema'];
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];

  const sufixo = Date.now();
  let A: TenantMontado;
  let B: TenantMontado;
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

    const tenantId = `tenant-pos-idem-${tag}-${sufixo}`;
    // CreateVendaSchema exige cuid em vendedorId: forma `c` + alfanuméricos.
    const userId = `cposidem${tag}${sufixo}`;
    const ctx = { tenantId, userId };

    await db.tenant.create({
      data: { id: tenantId, nome: `Tenant POS idempotência ${tag}`, slug: `pos-idem-${tag}-${sufixo}`, nuit: `${tag === 'a' ? 1 : 2}${`${sufixo}`.slice(-8)}` },
    });
    await db.user.create({
      data: { id: userId, tenantId, email: `pos-idem-${tag}-${sufixo}@test.mz`, nome: 'Vendedor POS', keycloakSub: `kc-pos-idem-${tag}-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, tenantId), { timeout: 60_000 });

    const categoria = await db.categoriaProduto.create({ data: { tenantId, nome: 'Mercadorias' } });
    const produto = await db.produto.create({
      data: {
        tenantId,
        sku: `SKU-POS-IDEM-${tag}-${sufixo}`,
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
      data: { tenantId, codigo: `ARM-POS-IDEM-${tag}-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
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
    B = await montarTenant('b');
  }, 120_000);

  // -------------------------------------------------------------------------
  // Schema
  // -------------------------------------------------------------------------

  it('CreateVendaSchema conserva chaveIdempotencia (1–100 caracteres) e recusa vazia ou com mais de 100', () => {
    const base = {
      origem: 'POS',
      vendedorId: A.userId,
      sessaoPOSId: A.sessaoPOSId,
      sessaoCaixaId: A.sessaoCaixaId,
      itens: itensMil(A),
      pagamentos: [{ tipo: 'DINHEIRO', valor: 1160 }],
    };
    const comChave = CreateVendaSchema.parse({ ...base, chaveIdempotencia: 'abc-123' }) as Record<string, unknown>;
    expect(comChave.chaveIdempotencia).toBe('abc-123');
    expect((CreateVendaSchema.parse({ ...base, chaveIdempotencia: 'x' }) as Record<string, unknown>).chaveIdempotencia).toBe('x');
    expect(
      (CreateVendaSchema.parse({ ...base, chaveIdempotencia: 'k'.repeat(100) }) as Record<string, unknown>).chaveIdempotencia,
    ).toBe('k'.repeat(100));

    expect(CreateVendaSchema.safeParse({ ...base, chaveIdempotencia: '' }).success).toBe(false);
    expect(CreateVendaSchema.safeParse({ ...base, chaveIdempotencia: 'k'.repeat(101) }).success).toBe(false);

    // Opcional: sem chave continua válida.
    const semChave = CreateVendaSchema.parse(base) as Record<string, unknown>;
    expect(semChave.chaveIdempotencia).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Retry sequencial
  // -------------------------------------------------------------------------

  it('primeira venda com chave grava a chave na Venda e emite uma Factura-Recibo', async () => {
    const chave = novaChave();
    const antes = await contagens(A);

    const row = await criar(A, inputMil(A, chave));

    const gravadas = await vendasComChave(A, chave);
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0].id).toBe(row.id);
    expect(gravadas[0].faturaId, 'Venda.faturaId').toBeTruthy();

    const depois = await contagens(A);
    expect(depois.vendas).toBe(antes.vendas + 1);
    expect(depois.faturas).toBe(antes.faturas + 1);
    expect(depois.serieVenda).toBe(antes.serieVenda + 1);
    expect(depois.serieFR).toBe(antes.serieFR + 1);
  });

  it('retry com a mesma chave devolve a venda existente (mesmo id, número e factura) e não escreve nada', async () => {
    const chave = novaChave();
    const primeira = await criar(A, inputMil(A, chave));
    const gravada = await db.venda.findFirst({ where: { id: primeira.id, tenantId: A.tenantId } });
    expect(gravada.faturaId, 'a primeira venda emitiu documento').toBeTruthy();

    const antes = await contagens(A);

    const segunda = await criar(A, inputMil(A, chave));

    expect(segunda.id).toBe(primeira.id);
    expect(segunda.numero).toBe(gravada.numero);
    expect(segunda.faturaId).toBe(gravada.faturaId);
    expect(await contagens(A)).toEqual(antes);

    // E um terceiro retry também.
    const terceira = await criar(A, inputMil(A, chave));
    expect(terceira.id).toBe(primeira.id);
    expect(await contagens(A)).toEqual(antes);

    expect(await vendasComChave(A, chave)).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Corrida concorrente
  // -------------------------------------------------------------------------

  it('duas chamadas concorrentes com a mesma chave gravam exactamente uma venda, uma factura e um lançamento', async () => {
    const chave = novaChave();
    const antes = await contagens(A);

    const resultados = await Promise.allSettled([criar(A, inputMil(A, chave)), criar(A, inputMil(A, chave))]);

    const resolvidos = resultados.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled');
    const recusados = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(resolvidos.length, `pelo menos uma resolve; erros: ${recusados.map((r) => String(r.reason?.code ?? r.reason?.message ?? r.reason)).join(' | ')}`).toBeGreaterThanOrEqual(1);
    expect(recusados.length, 'no máximo uma é recusada').toBeLessThanOrEqual(1);

    const gravadas = await vendasComChave(A, chave);
    expect(gravadas).toHaveLength(1);
    const [venda] = gravadas;
    for (const r of resolvidos) {
      expect(r.value.id).toBe(venda.id);
    }

    const depois = await contagens(A);
    expect(depois.vendas).toBe(antes.vendas + 1);
    expect(depois.faturas).toBe(antes.faturas + 1);
    expect(depois.serieVenda).toBe(antes.serieVenda + 1);
    expect(depois.serieFR).toBe(antes.serieFR + 1);
    expect(depois.movimentosCaixa).toBe(antes.movimentosCaixa + 1);
    expect(dec(depois.saldo).equals(dec(antes.saldo).minus(1))).toBe(true);
    // Um só lançamento: o da factura da venda.
    expect(depois.lancamentos).toBe(antes.lancamentos + 1);
    const fatura = await db.fatura.findFirst({ where: { id: venda.faturaId, tenantId: A.tenantId } });
    expect(fatura.lancamentoId).toBeTruthy();
    expect(
      await db.partidaLancamento.count({ where: { tenantId: A.tenantId, lancamentoId: fatura.lancamentoId } }),
    ).toBe(depois.partidas - antes.partidas);
  });

  // -------------------------------------------------------------------------
  // Chave reutilizada com outro conteúdo
  // -------------------------------------------------------------------------

  it('mesma chave com outro total → CHAVE_IDEMPOTENCIA_REUTILIZADA e nada é gravado', async () => {
    const chave = novaChave();
    const original = await criar(A, inputMil(A, chave));
    const antes = await contagens(A);

    const erro = await capturarErro(() => criar(A, inputDoisMil(A, chave)));

    expect(erro, 'a reutilização da chave tinha de ser recusada').toBeDefined();
    expect(erro).toBeInstanceOf(BusinessRuleError);
    expect(erro.code).toBe('CHAVE_IDEMPOTENCIA_REUTILIZADA');
    expect(await contagens(A)).toEqual(antes);

    // A venda original continua a ser a única com a chave, e intacta.
    const gravadas = await vendasComChave(A, chave);
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0].id).toBe(original.id);
    expect(dec(gravadas[0].total).equals(dec('1160'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Âmbito por tenant
  // -------------------------------------------------------------------------

  it('a mesma chave noutro tenant é independente: cria a sua própria venda e documento', async () => {
    const chave = novaChave();
    const vendaA = await criar(A, inputMil(A, chave));
    const antesB = await contagens(B);
    const antesA = await contagens(A);

    const vendaB = await criar(B, inputMil(B, chave));

    expect(vendaB.id).not.toBe(vendaA.id);
    const gravadasB = await vendasComChave(B, chave);
    expect(gravadasB).toHaveLength(1);
    expect(gravadasB[0].id).toBe(vendaB.id);
    expect(gravadasB[0].faturaId).toBeTruthy();

    const depoisB = await contagens(B);
    expect(depoisB.vendas).toBe(antesB.vendas + 1);
    expect(depoisB.faturas).toBe(antesB.faturas + 1);
    expect(depoisB.serieFR).toBe(antesB.serieFR + 1);
    expect(await contagens(A)).toEqual(antesA);

    // E o retry em B devolve a venda de B, não a de A.
    const retryB = await criar(B, inputMil(B, chave));
    expect(retryB.id).toBe(vendaB.id);
    expect(await contagens(B)).toEqual(depoisB);
  });

  // -------------------------------------------------------------------------
  // Sem chave: nenhuma deduplicação
  // -------------------------------------------------------------------------

  it('sem chave, duas chamadas idênticas criam duas vendas e dois documentos', async () => {
    const antes = await contagens(A);

    const v1 = await criar(A, inputMil(A));
    const v2 = await criar(A, inputMil(A));

    expect(v2.id).not.toBe(v1.id);
    const depois = await contagens(A);
    expect(depois.vendas).toBe(antes.vendas + 2);
    expect(depois.faturas).toBe(antes.faturas + 2);
    expect(depois.serieVenda).toBe(antes.serieVenda + 2);
    expect(depois.serieFR).toBe(antes.serieFR + 2);
    expect(dec(depois.saldo).equals(dec(antes.saldo).minus(2))).toBe(true);
  });
});
