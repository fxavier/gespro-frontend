/**
 * Oráculo #328 (integração) — cada aresta que o serviço grava em HistoricoEstadoVenda está em
 * TRANSICOES_VENDA, e a porta manual não fica mais larga por isso.
 *
 * Escrito ANTES da implementação; quem implementa não o altera.
 *
 * Contrato (decisão do orquestrador): alinhar `TRANSICOES_VENDA` com as transições que o código
 * executa. Para cada escritor do histórico (`criar`, `transitar`, `anular` — os únicos, ver o
 * oráculo unitário `transicoes-venda-328.test.ts`), percorre-se o caminho real e verifica-se:
 *   - toda a linha do histórico com `estadoAntes ≠ estadoDepois` é uma aresta do mapa;
 *   - a linha com `estadoAntes = estadoDepois` só é aceite como marca de NASCIMENTO (a primeira
 *     linha da venda) — nunca a meio da cadeia;
 *   - a cadeia é contínua: o `estadoAntes` de cada linha é o `estadoDepois` da anterior, e a
 *     última é o estado actual da venda; a primeira acaba no estado com que a venda nasceu.
 *
 * Hoje falha em: anular paga (CONCLUIDA → CANCELADA), anular a crédito (FATURADA → CANCELADA),
 * nascimento da ENCOMENDA (o histórico grava PENDENTE → RASCUNHO, aresta que o mapa proíbe e
 * bem: nada volta a RASCUNHO) e nascimento da POS paga (PENDENTE → CONCLUIDA). Como o
 * nascimento é representado (aresta do mapa ou marca antes = depois) fica a quem implementa,
 * desde que a cadeia acima se verifique — e sem nunca pôr uma aresta para RASCUNHO no mapa.
 *
 * Decisão conservadora (tratada como contrato): alargar o mapa NÃO alarga a porta manual.
 * `vendaService.transitar` — a porta da `transitarVendaAction`/`cancelarVenda` — continua a
 * recusar com `TRANSICAO_INVALIDA`, sem escrever nada:
 *   - CONCLUIDA → CANCELADA numa venda sem documento (só a NC desfaz uma venda concluída);
 *   - FATURADA → CANCELADA numa encomenda facturada sem documento (o stock já saiu);
 *   - PENDENTE → CONCLUIDA numa venda MANUAL (concluir sem factura).
 *
 * Harness: o de `venda-pos-anulacao-credito-322.test.ts` (tenant pelos serviços reais,
 * vendas pelo caminho real `vendaService.criar`) e o de `venda-submeter-rascunho-132.test.ts`
 * (transitar pelo schema da action). A sessão (auth) é o único duplo.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

type Ctx = { tenantId: string; userId: string };

describe.skipIf(skip)('#328 — arestas do histórico da venda ⊆ TRANSICOES_VENDA — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let vendaService: any;
  let CreateVendaSchema: (typeof import('@/lib/validations/vendas'))['CreateVendaSchema'];
  let TransitarVendaSchema: (typeof import('@/lib/validations/vendas'))['TransitarVendaSchema'];
  let caixa: typeof import('@/server/services/financas/caixa.service');
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];
  let MAPA: Record<string, string[]>;

  const sufixo = Date.now();
  const TENANT = `tenant-transicoes-venda-328-${sufixo}`;
  const USER = `ctv328${sufixo}u1`;
  const ctx: Ctx = { tenantId: TENANT, userId: USER };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  let produtoId: string;
  let localizacaoId: string;
  let clienteId: string;
  let sessaoCaixaId: string;
  let sessaoPOSId: string;

  // 1 × 1000 @16% → 1160
  const itens = () => [{ produtoId, nomeProduto: 'Artigo 1000', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 }];

  // ── utilidades ─────────────────────────────────────────────────────────────
  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  async function historico(vendaId: string) {
    return db.historicoEstadoVenda.findMany({
      where: { tenantId: TENANT, vendaId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** A cadeia do histórico da venda respeita o mapa (ver cabeçalho). */
  async function exigirCadeiaNoMapa(vendaId: string, estadoNascimento: string) {
    const venda = await db.venda.findFirst({ where: { id: vendaId, tenantId: TENANT } });
    const hist = await historico(vendaId);
    const desc = hist.map((h: any) => `${h.estadoAntes}→${h.estadoDepois}`).join(', ');
    expect(hist.length, `histórico da venda ${venda.numero}`).toBeGreaterThan(0);

    expect(hist[0].estadoDepois, `nascimento da venda ${venda.numero} [${desc}]`).toBe(estadoNascimento);
    hist.forEach((h: any, i: number) => {
      if (i > 0) {
        expect(h.estadoAntes, `cadeia contínua na linha ${i} [${desc}]`).toBe(hist[i - 1].estadoDepois);
      }
      if (h.estadoAntes === h.estadoDepois) {
        expect(i, `${h.estadoAntes}→${h.estadoDepois} só é marca de nascimento, não aresta a meio [${desc}]`).toBe(0);
      } else {
        expect(
          MAPA[h.estadoAntes] ?? [],
          `aresta ${h.estadoAntes} → ${h.estadoDepois} gravada no histórico e ausente de TRANSICOES_VENDA [${desc}]`,
        ).toContain(h.estadoDepois);
      }
    });
    expect(hist[hist.length - 1].estadoDepois, `a última linha é o estado actual [${desc}]`).toBe(venda.status);
  }

  async function criar(dados: Record<string, unknown>) {
    const input = CreateVendaSchema.parse({ vendedorId: USER, localizacaoOrigemId: localizacaoId, itens: itens(), ...dados });
    const row: any = await noCtx(() => vendaService.criar(input, ctx));
    return db.venda.findFirst({ where: { id: row.id, tenantId: TENANT } });
  }

  const posPaga = () =>
    criar({ origem: 'POS', sessaoPOSId, sessaoCaixaId, pagamentos: [{ tipo: 'DINHEIRO', valor: 1160 }] });
  const posACredito = () =>
    criar({ origem: 'POS', sessaoPOSId, sessaoCaixaId, clienteId, pagamentos: [{ tipo: 'CREDITO', valor: 1160 }] });
  const encomenda = () => criar({ origem: 'ENCOMENDA', clienteId, pagamentos: [{ tipo: 'CREDITO', valor: 1160 }] });
  const manual = () => criar({ origem: 'MANUAL', clienteId, pagamentos: [{ tipo: 'DINHEIRO', valor: 1160 }] });

  /** O mesmo caminho da `transitarVendaAction`: schema da action e depois o serviço. */
  function transitar(vendaId: string, paraStatus: string) {
    const input = TransitarVendaSchema.parse({ vendaId, paraStatus });
    return noCtx(() => vendaService.transitar(input, ctx));
  }

  function anular(vendaId: string) {
    expect(typeof vendaService.anular, 'vendaService.anular publicado').toBe('function');
    return noCtx(() => vendaService.anular(vendaId, { motivo: 'Oráculo #328' }, ctx));
  }

  async function retrato(vendaId: string) {
    const v = await db.venda.findFirst({ where: { id: vendaId, tenantId: TENANT } });
    return {
      status: v.status,
      historico: await db.historicoEstadoVenda.count({ where: { tenantId: TENANT, vendaId } }),
      movimentosStock: await db.movimentoStock.count({ where: { tenantId: TENANT } }),
      reservas: (await db.reservaStock.findMany({ where: { tenantId: TENANT, documentoReferenciaId: vendaId }, orderBy: { id: 'asc' } })).map(
        (r: any) => r.status,
      ),
      notasCredito: await db.notaCredito.count({ where: { tenantId: TENANT } }),
      lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
    };
  }

  async function exigirRecusaManual(vendaId: string, paraStatus: string) {
    const antes = await retrato(vendaId);
    const erro = await capturarErro(() => transitar(vendaId, paraStatus));
    expect(erro, `transitar ${antes.status} → ${paraStatus} devia ser recusado`).toBeDefined();
    expect(erro, `esperava BusinessRuleError, veio ${erro?.constructor?.name}: ${erro?.message}`).toBeInstanceOf(BusinessRuleError);
    expect(erro.code).toBe('TRANSICAO_INVALIDA');
    expect(await retrato(vendaId), 'a recusa não escreve nada').toEqual(antes);
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ vendaService } = (await import('@/server/services/comercial')) as any);
    ({ CreateVendaSchema, TransitarVendaSchema } = await import('@/lib/validations/vendas'));
    caixa = await import('@/server/services/financas/caixa.service');
    ({ BusinessRuleError } = await import('@/lib/errors'));
    MAPA = ((await import('@/server/services/comercial/venda.interface')) as any).TRANSICOES_VENDA;
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant transições venda #328', slug: `transicoes-venda-328-${sufixo}`, nuit: `3${String(sufixo).slice(-8)}` },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `transicoes-venda-328-${sufixo}@test.mz`, nome: 'Vendedor', keycloakSub: `kc-transicoes-venda-328-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const produto = await db.produto.create({
      data: {
        tenantId: TENANT,
        sku: `SKU-TRANSICOES-VENDA-328-${sufixo}`,
        nome: 'Artigo 1000',
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
      data: { tenantId: TENANT, codigo: `ARM-TRANSICOES-VENDA-328-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    await db.saldoStock.create({
      data: { tenantId: TENANT, produtoId, varianteProdutoId: '', localizacaoId, saldo: 10_000, saldoReservado: 0 },
    });

    const cliente = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente #328',
        tipo: 'JURIDICA',
        nuit: '400000328',
        email: `cliente-transicoes-venda-328-${sufixo}@test.mz`,
        telefone: '840000328',
        codigo: `CLI-TRANSICOES-VENDA-328-${sufixo}`,
        diasPagamento: 30,
        limiteCreditoMT: 10_000_000,
      },
    });
    clienteId = cliente.id;

    const sc: any = await noCtx(() => caixa.abrirSessao({ fundoInicial: 5000 }, ctx));
    sessaoCaixaId = sc.id;
    const sp = await db.sessaoPOS.create({ data: { tenantId: TENANT, vendedorId: USER, sessaoCaixaId, status: 'ABERTA' } });
    sessaoPOSId = sp.id;
  });

  // ── criar + anular (ADR-0041) ────────────────────────────────────────────────

  it('POS paga: nasce CONCLUIDA e a anulação por NC grava CONCLUIDA → CANCELADA — tudo no mapa', async () => {
    const venda = await posPaga();
    expect(venda.status, 'fixture: POS paga nasce CONCLUIDA').toBe('CONCLUIDA');
    expect(venda.faturaId, 'fixture: POS paga com Factura-Recibo').toBeTruthy();
    await exigirCadeiaNoMapa(venda.id, 'CONCLUIDA');

    await anular(venda.id);
    const hist = await historico(venda.id);
    expect(`${hist.at(-1).estadoAntes}→${hist.at(-1).estadoDepois}`).toBe('CONCLUIDA→CANCELADA');
    await exigirCadeiaNoMapa(venda.id, 'CONCLUIDA');
  });

  it('POS a crédito: nasce FATURADA e a anulação por NC grava FATURADA → CANCELADA — tudo no mapa', async () => {
    const venda = await posACredito();
    expect(venda.status, 'fixture: POS a crédito nasce FATURADA').toBe('FATURADA');
    expect(venda.faturaId, 'fixture: POS a crédito com Factura').toBeTruthy();
    await exigirCadeiaNoMapa(venda.id, 'FATURADA');

    await anular(venda.id);
    const hist = await historico(venda.id);
    expect(`${hist.at(-1).estadoAntes}→${hist.at(-1).estadoDepois}`).toBe('FATURADA→CANCELADA');
    await exigirCadeiaNoMapa(venda.id, 'FATURADA');
  });

  // ── criar + transitar ────────────────────────────────────────────────────────

  it('ENCOMENDA: nasce RASCUNHO e o caminho completo até CONCLUIDA fica no mapa', async () => {
    const venda = await encomenda();
    expect(venda.status, 'fixture: ENCOMENDA nasce RASCUNHO').toBe('RASCUNHO');
    await exigirCadeiaNoMapa(venda.id, 'RASCUNHO');

    for (const para of ['PENDENTE', 'CONFIRMADA', 'EM_PREPARACAO', 'FATURADA', 'CONCLUIDA']) {
      await transitar(venda.id, para);
    }
    await exigirCadeiaNoMapa(venda.id, 'RASCUNHO');
  });

  it('ENCOMENDA cancelada em RASCUNHO: cadeia no mapa', async () => {
    const venda = await encomenda();
    await transitar(venda.id, 'CANCELADA');
    await exigirCadeiaNoMapa(venda.id, 'RASCUNHO');
  });

  it('MANUAL: nasce PENDENTE; cancelada depois — cadeia no mapa', async () => {
    const venda = await manual();
    expect(venda.status, 'fixture: MANUAL nasce PENDENTE').toBe('PENDENTE');
    await exigirCadeiaNoMapa(venda.id, 'PENDENTE');
    await transitar(venda.id, 'CANCELADA');
    await exigirCadeiaNoMapa(venda.id, 'PENDENTE');
  });

  it('invariante do tenant: nenhuma linha do histórico, de nenhuma venda, tem aresta fora do mapa', async () => {
    const linhas = await db.historicoEstadoVenda.findMany({ where: { tenantId: TENANT } });
    expect(linhas.length, 'os casos anteriores gravaram histórico').toBeGreaterThan(0);
    const fora = linhas
      .filter((h: any) => h.estadoAntes !== h.estadoDepois && !(MAPA[h.estadoAntes] ?? []).includes(h.estadoDepois))
      .map((h: any) => `${h.estadoAntes}→${h.estadoDepois}`);
    expect([...new Set(fora)].sort(), 'arestas gravadas que TRANSICOES_VENDA não descreve').toEqual([]);
  });

  // ── a porta manual não alarga ─────────────────────────────────────────────────

  it('transitar recusa CONCLUIDA → CANCELADA numa venda concluída sem documento (TRANSICAO_INVALIDA, nada escrito)', async () => {
    const venda = await encomenda();
    for (const para of ['PENDENTE', 'CONFIRMADA', 'EM_PREPARACAO', 'FATURADA', 'CONCLUIDA']) {
      await transitar(venda.id, para);
    }
    const v = await db.venda.findFirst({ where: { id: venda.id, tenantId: TENANT } });
    expect(v.status, 'fixture').toBe('CONCLUIDA');
    expect(v.faturaId, 'fixture: sem documento — o travão VENDA_COM_DOCUMENTO não se aplica').toBeNull();
    await exigirRecusaManual(venda.id, 'CANCELADA');
  });

  it('transitar recusa FATURADA → CANCELADA numa encomenda facturada sem documento (TRANSICAO_INVALIDA, nada escrito)', async () => {
    const venda = await encomenda();
    for (const para of ['PENDENTE', 'CONFIRMADA', 'EM_PREPARACAO', 'FATURADA']) {
      await transitar(venda.id, para);
    }
    const v = await db.venda.findFirst({ where: { id: venda.id, tenantId: TENANT } });
    expect(v.status, 'fixture').toBe('FATURADA');
    expect(v.faturaId, 'fixture: sem documento').toBeNull();
    await exigirRecusaManual(venda.id, 'CANCELADA');
  });

  it('transitar recusa PENDENTE → CONCLUIDA numa venda MANUAL (TRANSICAO_INVALIDA, nada escrito)', async () => {
    const venda = await manual();
    expect(venda.status, 'fixture').toBe('PENDENTE');
    await exigirRecusaManual(venda.id, 'CONCLUIDA');
  });
});
