/**
 * Oráculo S2 — venda POS paga emite Factura-Recibo e lança (ADR-0041 §1–§4, §7; issue #306)
 *
 * Contra Postgres real (Testcontainers), pelo caminho real `vendaService.criar`:
 *   (C) o bootstrap do tenant cria o cliente técnico Consumidor Final (idempotente) e a
 *       série activa FATURA_RECIBO (prefixo FR);
 *   (D) uma venda POS paga, numa só transacção: Factura-Recibo (série FATURA_RECIBO, PAGA,
 *       totalPago = total) ligada nos dois sentidos à venda; lançamento LANCADO em
 *       `Fatura.lancamentoId` igual a `construirLancamentoVendaPOS`; totais de Venda e
 *       Fatura = `calcularTotaisVendaPOS`; venda anónima factura contra o Consumidor Final;
 *       venda CONCLUIDA; `MovimentoCaixa` só pela parte em DINHEIRO;
 *       Σ pagamentos ≠ total → PAGAMENTOS_NAO_BATEM_TOTAL sem escrever nada;
 *       falha injectada no lançamento (conta 711 inactiva) → nada fica e as séries não avançam.
 *
 * O tenant é montado pelos serviços reais (`bootstrapContabilidade`, `abrirSessao` do caixa);
 * o catálogo/stock/sessão POS são dados de partida. A sessão (auth) é o único duplo.
 * CREDITO fica para S4 (#308).
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
const ZERO = new Prisma.Decimal(0);

describe.skipIf(skip)('Venda POS paga → Factura-Recibo + lançamento atómicos — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let vendaService: (typeof import('@/server/services/comercial'))['vendaService'];
  let CreateVendaSchema: (typeof import('@/lib/validations/vendas'))['CreateVendaSchema'];
  let bootstrapContabilidade: (typeof import('@/server/provisioning/tenant-bootstrap'))['bootstrapContabilidade'];

  const sufixo = Date.now();
  const TENANT = `tenant-pos-fr-${sufixo}`;
  // CreateVendaSchema exige cuid em vendedorId: forma `c` + alfanuméricos.
  const USER = `cposfr${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  let produtoId: string;
  let localizacaoId: string;
  let sessaoCaixaId: string;
  let sessaoPOSId: string;
  let clienteIdentificadoId: string;

  // ── dados de venda ─────────────────────────────────────────────────────────
  // 3 × (1 × 10,03 @16%) + (3 × 33,33 − 10% @16%):
  //   subtotal 30,09 + 89,99 = 120,08 · IVA 4,80 + 14,40 = 19,20 · total 139,28
  // (IVA por linha arredondada: o cálculo antigo do POS daria 19,21.)
  function itensMisturados() {
    const l10 = { produtoId, nomeProduto: 'Artigo 10,03', quantidade: 1, precoUnitario: 10.03, desconto: 0, taxaIva: 0.16 };
    return [l10, { ...l10 }, { ...l10 }, { produtoId, nomeProduto: 'Artigo 33,33', quantidade: 3, precoUnitario: 33.33, desconto: 10, taxaIva: 0.16 }];
  }
  const TOT_MISTURADO = { subtotal: '120.08', ivaTotal: '19.20', total: '139.28' };

  // 1 × 1000 @16% → 1000 + 160 = 1160
  function itensMil() {
    return [{ produtoId, nomeProduto: 'Artigo 1000', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 }];
  }

  function inputVenda(itens: unknown[], pagamentos: unknown[], extra: Record<string, unknown> = {}) {
    return CreateVendaSchema.parse({
      origem: 'POS',
      vendedorId: USER,
      sessaoPOSId,
      sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      itens,
      pagamentos,
      ...extra,
    });
  }

  async function vender(itens: unknown[], pagamentos: unknown[], extra: Record<string, unknown> = {}) {
    const row: any = await noCtx(() => vendaService.criar(inputVenda(itens, pagamentos, extra), ctx));
    const venda = await db.venda.findFirst({ where: { id: row.id, tenantId: TENANT } });
    expect(venda, 'venda gravada').not.toBeNull();
    return venda;
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
  async function partidasDe(lancamentoId: string) {
    const partidas = await db.partidaLancamento.findMany({
      where: { lancamentoId, tenantId: TENANT },
      include: { conta: { select: { codigo: true } } },
    });
    return partidas.map((p: any) => ({ codigo: p.conta.codigo as string, tipo: p.tipo as string, valor: dec(p.valor) }));
  }

  function somar(partidas: Array<{ codigo: string; tipo: string; valor: Prisma.Decimal }>, tipo: string, codigo?: string) {
    return partidas
      .filter((p) => p.tipo === tipo && (codigo === undefined || p.codigo === codigo))
      .reduce((a, p) => a.plus(p.valor), ZERO);
  }

  async function proximoNumeroDaSerie(tipo: string): Promise<number> {
    const series = await db.serieDocumento.findMany({ where: { tenantId: TENANT, tipo, ativo: true } });
    expect(series.length, `série activa ${tipo}`).toBeGreaterThan(0);
    return series.reduce((a: number, s: any) => a + s.proximoNumero, 0);
  }

  async function saldoStock() {
    const s = await db.saldoStock.findFirst({ where: { tenantId: TENANT, produtoId, localizacaoId, varianteProdutoId: '' } });
    return dec(s.saldo);
  }

  async function movimentosVendaCaixa() {
    return db.movimentoCaixa.findMany({ where: { tenantId: TENANT, sessaoCaixaId, tipo: 'VENDA' }, orderBy: { createdAt: 'asc' } });
  }

  async function contagens() {
    return {
      vendas: await db.venda.count({ where: { tenantId: TENANT } }),
      itensVenda: await db.itemVenda.count({ where: { tenantId: TENANT } }),
      pagamentosVenda: await db.pagamentoVenda.count({ where: { tenantId: TENANT } }),
      faturas: await db.fatura.count({ where: { tenantId: TENANT } }),
      linhasFatura: await db.linhaFatura.count({ where: { tenantId: TENANT } }),
      lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
      partidas: await db.partidaLancamento.count({ where: { tenantId: TENANT } }),
      movimentosStock: await db.movimentoStock.count({ where: { tenantId: TENANT } }),
      movimentosCaixa: await db.movimentoCaixa.count({ where: { tenantId: TENANT } }),
      saldo: (await saldoStock()).toString(),
      serieVenda: await proximoNumeroDaSerie('VENDA'),
      serieFR: await proximoNumeroDaSerie('FATURA_RECIBO'),
    };
  }

  async function consumidorFinal() {
    const { CLIENTE_CONSUMIDOR_FINAL } = await import('@/lib/consumidor-final');
    return db.cliente.findMany({ where: { tenantId: TENANT, codigo: CLIENTE_CONSUMIDOR_FINAL.codigo } });
  }

  /** Fatura da venda, ligada nos dois sentidos, Factura-Recibo PAGA com lançamento igual ao da função pura. */
  async function esperarFacturaReciboDe(venda: any, pagamentos: Array<{ tipo: string; valor: number }>) {
    expect(venda.faturaId, 'Venda.faturaId').toBeTruthy();
    const fatura = await db.fatura.findFirst({
      where: { id: venda.faturaId, tenantId: TENANT },
      include: { serieDocumento: true, linhas: true },
    });
    expect(fatura, 'Fatura da venda').not.toBeNull();
    expect(fatura.vendaId).toBe(venda.id);
    expect(fatura.serieDocumento.tipo).toBe('FATURA_RECIBO');
    expect(fatura.numero.startsWith('FR/')).toBe(true);
    expect(fatura.status).toBe('PAGA');
    expect(dec(fatura.totalPago).equals(dec(fatura.total))).toBe(true);
    // Totais do documento = totais da venda.
    expect(dec(fatura.subtotal).equals(dec(venda.subtotal))).toBe(true);
    expect(dec(fatura.ivaTotal).equals(dec(venda.ivaTotal))).toBe(true);
    expect(dec(fatura.total).equals(dec(venda.total))).toBe(true);

    // Lançamento LANCADO, ligado, igual ao construído pela função pura.
    expect(fatura.lancamentoId, 'Fatura.lancamentoId').toBeTruthy();
    const lanc = await db.lancamento.findFirst({ where: { id: fatura.lancamentoId, tenantId: TENANT } });
    expect(lanc.status).toBe('LANCADO');
    expect(lanc.origem).toBe('VENDA');
    expect(lanc.documentoOrigemTipo).toBe('Fatura');
    expect(lanc.documentoOrigemId).toBe(fatura.id);

    const partidas = await partidasDe(fatura.lancamentoId);
    expect(somar(partidas, 'DEBITO').equals(somar(partidas, 'CREDITO'))).toBe(true);
    expect(somar(partidas, 'DEBITO').equals(dec(fatura.total))).toBe(true);
    expect(somar(partidas, 'CREDITO', '711').equals(dec(fatura.subtotal))).toBe(true);
    expect(somar(partidas, 'CREDITO', '44331').equals(dec(fatura.ivaTotal))).toBe(true);

    const { construirLancamentoVendaPOS } = await import('@/server/services/financas/faturacao.service');
    const esperado = construirLancamentoVendaPOS(
      {
        id: fatura.id,
        numero: fatura.numero,
        dataEmissao: fatura.dataEmissao,
        subtotal: dec(fatura.subtotal),
        ivaTotal: dec(fatura.ivaTotal),
        total: dec(fatura.total),
      },
      pagamentos.map((p) => ({ tipo: p.tipo as never, valor: dec(p.valor) })),
    );
    const chave = (p: { codigo: string; tipo: string; valor: Prisma.Decimal }) => `${p.codigo}|${p.tipo}|${p.valor.toFixed(2)}`;
    expect(partidas.map(chave).sort()).toEqual(
      esperado.partidas.map((p) => chave({ codigo: p.contaCodigo, tipo: p.tipo, valor: dec(p.valor) })).sort(),
    );
    return { fatura, partidas };
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ vendaService } = await import('@/server/services/comercial'));
    ({ CreateVendaSchema } = await import('@/lib/validations/vendas'));
    ({ bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap'));
    const caixa = await import('@/server/services/financas/caixa.service');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant POS Factura-Recibo', slug: `pos-fr-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `pos-fr-${sufixo}@test.mz`, nome: 'Vendedor POS', keycloakSub: `kc-pos-fr-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    // Catálogo e stock de partida.
    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const produto = await db.produto.create({
      data: {
        tenantId: TENANT,
        sku: `SKU-POS-FR-${sufixo}`,
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
      data: { tenantId: TENANT, codigo: `ARM-POS-FR-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    await db.saldoStock.create({
      data: { tenantId: TENANT, produtoId, varianteProdutoId: '', localizacaoId, saldo: 10_000, saldoReservado: 0 },
    });

    const cliente = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente Identificado',
        tipo: 'JURIDICA',
        nuit: '400000306',
        email: `cliente-pos-fr-${sufixo}@test.mz`,
        telefone: '840000306',
        codigo: `CLI-POS-FR-${sufixo}`,
      },
    });
    clienteIdentificadoId = cliente.id;

    // Caixa aberta pelo serviço real; sessão POS de partida sobre ela.
    const sessaoCaixa: any = await noCtx(() => caixa.abrirSessao({ fundoInicial: 1000 }, ctx));
    sessaoCaixaId = sessaoCaixa.id;
    const sessaoPOS = await db.sessaoPOS.create({
      data: { tenantId: TENANT, vendedorId: USER, sessaoCaixaId, status: 'ABERTA' },
    });
    sessaoPOSId = sessaoPOS.id;
  });

  // -------------------------------------------------------------------------
  // (C) bootstrap: Consumidor Final + série FATURA_RECIBO
  // -------------------------------------------------------------------------

  it('o bootstrap do tenant cria o Consumidor Final (CF-000000, NUIT 999999999) e a série activa FATURA_RECIBO com prefixo FR', async () => {
    const { CLIENTE_CONSUMIDOR_FINAL } = await import('@/lib/consumidor-final');
    const cfs = await consumidorFinal();
    expect(cfs).toHaveLength(1);
    expect(cfs[0].nuit).toBe(CLIENTE_CONSUMIDOR_FINAL.nuit);
    expect(cfs[0].nome).toBe(CLIENTE_CONSUMIDOR_FINAL.nome);
    expect(cfs[0].deletedAt).toBeNull();

    const fr = await db.serieDocumento.findMany({ where: { tenantId: TENANT, tipo: 'FATURA_RECIBO', ativo: true } });
    expect(fr.length).toBeGreaterThan(0);
    expect(fr.every((s: any) => s.prefixo === 'FR')).toBe(true);
  });

  it('o bootstrap é idempotente: corrido de novo, continua a haver um só Consumidor Final e as mesmas séries FR', async () => {
    const seriesAntes = await db.serieDocumento.count({ where: { tenantId: TENANT, tipo: 'FATURA_RECIBO' } });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });
    expect(await consumidorFinal()).toHaveLength(1);
    expect(await db.serieDocumento.count({ where: { tenantId: TENANT, tipo: 'FATURA_RECIBO' } })).toBe(seriesAntes);
  });

  // -------------------------------------------------------------------------
  // (D) venda POS paga
  // -------------------------------------------------------------------------

  it('venda anónima a dinheiro: Factura-Recibo PAGA ao Consumidor Final, totais por linha arredondada, D 111 / C 711 / C 44331, caixa pelo total, venda CONCLUIDA', async () => {
    const antes = await contagens();
    const serieFaturaAntes = await proximoNumeroDaSerie('FATURA');
    const caixaAntes = (await movimentosVendaCaixa()).length;
    const pagamentos = [{ tipo: 'DINHEIRO', valor: 139.28, troco: 10.72 }];

    const venda = await vender(itensMisturados(), pagamentos);

    expect(venda.status).toBe('CONCLUIDA');
    expect(dec(venda.subtotal).equals(dec(TOT_MISTURADO.subtotal))).toBe(true);
    expect(dec(venda.ivaTotal).equals(dec(TOT_MISTURADO.ivaTotal))).toBe(true);
    expect(dec(venda.total).equals(dec(TOT_MISTURADO.total))).toBe(true);

    // Os totais gravados são os da função partilhada com o terminal.
    const { calcularTotaisVendaPOS } = await import('@/lib/vendas-totais');
    const calc = calcularTotaisVendaPOS(itensMisturados());
    expect(dec(venda.subtotal).equals(dec(calc.subtotal))).toBe(true);
    expect(dec(venda.ivaTotal).equals(dec(calc.ivaTotal))).toBe(true);
    expect(dec(venda.total).equals(dec(calc.total))).toBe(true);

    const { fatura, partidas } = await esperarFacturaReciboDe(venda, pagamentos);
    const [cf] = await consumidorFinal();
    expect(fatura.clienteId).toBe(cf.id);
    expect(fatura.nuitCliente).toBe('999999999');

    // Linhas do documento = linhas da venda, com os mesmos valores arredondados.
    expect(fatura.linhas).toHaveLength(4);
    const k = (l: { subtotal: unknown; ivaItem: unknown; total: unknown }) =>
      `${dec(l.subtotal).toFixed(2)}|${dec(l.ivaItem).toFixed(2)}|${dec(l.total).toFixed(2)}`;
    expect(fatura.linhas.map(k).sort()).toEqual(calc.linhas.map(k).sort());

    expect(somar(partidas, 'DEBITO', '111').equals(dec('139.28'))).toBe(true);
    expect(somar(partidas, 'CREDITO', '711').equals(dec('120.08'))).toBe(true);
    expect(somar(partidas, 'CREDITO', '44331').equals(dec('19.20'))).toBe(true);

    const mov = await movimentosVendaCaixa();
    expect(mov.length).toBe(caixaAntes + 1);
    expect(dec(mov[mov.length - 1].valor).equals(dec('139.28'))).toBe(true);

    const depois = await contagens();
    expect(depois.serieFR).toBe(antes.serieFR + 1);
    expect(depois.serieVenda).toBe(antes.serieVenda + 1);
    expect(await proximoNumeroDaSerie('FATURA')).toBe(serieFaturaAntes);
    expect(depois.faturas).toBe(antes.faturas + 1);
    expect(dec(depois.saldo).equals(dec(antes.saldo).minus(6))).toBe(true);
  });

  it('venda a cartão: nenhum MovimentoCaixa; D 121 = total', async () => {
    const caixaAntes = await db.movimentoCaixa.count({ where: { tenantId: TENANT } });
    const pagamentos = [{ tipo: 'CARTAO', valor: 1160 }];

    const venda = await vender(itensMil(), pagamentos);

    expect(venda.status).toBe('CONCLUIDA');
    const { partidas } = await esperarFacturaReciboDe(venda, pagamentos);
    expect(somar(partidas, 'DEBITO', '121').equals(dec('1160'))).toBe(true);
    expect(somar(partidas, 'DEBITO', '111').equals(ZERO)).toBe(true);
    expect(await db.movimentoCaixa.count({ where: { tenantId: TENANT } })).toBe(caixaAntes);
  });

  it('venda mista DINHEIRO 300 + MPESA 860: um MovimentoCaixa de 300; D 111 = 300, D 121 = 860', async () => {
    const caixaAntes = (await movimentosVendaCaixa()).length;
    const pagamentos = [
      { tipo: 'DINHEIRO', valor: 300 },
      { tipo: 'MPESA', valor: 860, referencia: 'MP-306' },
    ];

    const venda = await vender(itensMil(), pagamentos);

    const { partidas } = await esperarFacturaReciboDe(venda, pagamentos);
    expect(somar(partidas, 'DEBITO', '111').equals(dec('300'))).toBe(true);
    expect(somar(partidas, 'DEBITO', '121').equals(dec('860'))).toBe(true);

    const mov = await movimentosVendaCaixa();
    expect(mov.length).toBe(caixaAntes + 1);
    expect(dec(mov[mov.length - 1].valor).equals(dec('300'))).toBe(true);
  });

  it('venda a um cliente identificado factura contra esse cliente, não contra o Consumidor Final', async () => {
    const pagamentos = [{ tipo: 'TRANSFERENCIA', valor: 1160 }];
    const venda = await vender(itensMil(), pagamentos, { clienteId: clienteIdentificadoId });
    const { fatura } = await esperarFacturaReciboDe(venda, pagamentos);
    expect(fatura.clienteId).toBe(clienteIdentificadoId);
    expect(fatura.nuitCliente).toBe('400000306');
  });

  it('Σ pagamentos ≠ total → PAGAMENTOS_NAO_BATEM_TOTAL e nada é gravado (nem número gasto)', async () => {
    const antes = await contagens();

    const erro = await capturarErro(() =>
      noCtx(() => vendaService.criar(inputVenda(itensMil(), [{ tipo: 'DINHEIRO', valor: 1159.99 }]), ctx)),
    );

    expect(erro, 'a venda tinha de ser recusada').toBeDefined();
    expect(erro.code).toBe('PAGAMENTOS_NAO_BATEM_TOTAL');
    expect(await contagens()).toEqual(antes);
  });

  it('falha injectada no lançamento (conta 711 inactiva) reverte tudo: sem venda, factura, linhas, lançamento, stock nem caixa; séries VENDA e FR intactas', async () => {
    // Pré-condição: o tenant já produziu Factura-Recibo com lançamento — a falha não é vácuo.
    expect(await db.fatura.count({ where: { tenantId: TENANT, serieDocumento: { tipo: 'FATURA_RECIBO' } } })).toBeGreaterThan(0);

    const antes = await contagens();
    const conta711 = await db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo: '711' } });
    expect(conta711).not.toBeNull();
    await db.contaPGC.update({ where: { id: conta711.id }, data: { ativo: false } });

    let erro: any;
    try {
      erro = await capturarErro(() =>
        noCtx(() => vendaService.criar(inputVenda(itensMil(), [{ tipo: 'DINHEIRO', valor: 1160 }]), ctx)),
      );
    } finally {
      await db.contaPGC.update({ where: { id: conta711.id }, data: { ativo: true } });
    }

    expect(erro, 'a venda tinha de falhar com a conta 711 inactiva').toBeDefined();
    expect(await contagens()).toEqual(antes);
  });

  it('nenhuma venda POS do tenant fica sem documento, e nenhuma factura fica sem lançamento', async () => {
    expect(await db.venda.count({ where: { tenantId: TENANT, origem: 'POS', faturaId: null } })).toBe(0);
    expect(await db.fatura.count({ where: { tenantId: TENANT, lancamentoId: null } })).toBe(0);
  });
});
