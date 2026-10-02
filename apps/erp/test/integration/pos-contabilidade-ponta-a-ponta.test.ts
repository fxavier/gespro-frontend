/**
 * Oráculo S9 — prova ponta-a-ponta: venda POS → apuramento do IVA, balancete e DFC
 * (ADR-0041 «Consequências»; issue #313, PRD #304)
 *
 * Prova cruzada entre módulos, contra Postgres real (Testcontainers), num tenant novo montado
 * pelos serviços reais (`bootstrapContabilidade`, `abrirSessao` do caixa). Vendas POS no período
 * corrente pelo caminho real `vendaService.criar`:
 *   A  dinheiro, 4 linhas @16%                       subtotal  120,08 · IVA  19,20 · total  139,28
 *   B  cartão, 1 × 1000 @16%                         subtotal 1000,00 · IVA 160,00 · total 1160,00
 *   C  DINHEIRO 300 + MPESA 860, 1 × 1000 @16%       subtotal 1000,00 · IVA 160,00 · total 1160,00
 *   D  CREDITO 1160 a cliente identificado, @16%     subtotal 1000,00 · IVA 160,00 · total 1160,00
 *   E  dinheiro, 1 × 1000 @16% + 1 × 500 @0%         subtotal 1500,00 · IVA 160,00 · total 1660,00
 *   Σ  subtotal 4620,08 · IVA 659,20 · total 5279,28
 *      dinheiro 2099,28 (A+C+E) · cartão/MPESA 2020,00 (B+C, sem configuração → 121) · crédito 1160 (D)
 *      base documental @16% = 4120,08 (a linha a 0% não entra na base do 44331)
 *
 * Afirma:
 *   (1) Balancete de verificação do período: movimento em 111/121/411 (D), 711/44331 (C) = somas
 *       acima; as três igualdades (movimento, acumulado, saldo) verificam-se.
 *   (2) DFC do período sai (sem impedimentos, sem DFC_NAO_ARTICULA) com variação de caixa =
 *       dinheiro + cartão/MPESA; as rubricas vêm do `bootstrapContabilidade`.
 *   (3) Apuramento do IVA do período corre (sem DOCUMENTO_SEM_LANCAMENTO nem outro impedimento);
 *       IVA liquidado (44331) = Σ ivaTotal dos documentos emitidos; base 44331 = Σ subtotal das
 *       linhas a 16% → sem divergência de base.
 *   (4) Anular a venda A (vendaService.anular): no balancete, o efeito líquido da venda A nas suas
 *       contas desaparece (111, 711, 44331 voltam ao valor sem A; 411 líquido inalterado); o novo
 *       apuramento (o primeiro é estornado pelo serviço, caminho legítimo) reflecte a NC no 44331
 *       e na base, sem divergência.
 *
 * Ordem: o balancete e a DFC são lidos ANTES do apuramento, porque o lançamento de apuramento
 * salda o 44331 no próprio período (D 44331 / C 4437) — é saída do cálculo, não entrada.
 *
 * A sessão (auth) é o único duplo. Catálogo, stock e sessão POS são dados de partida.
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

describe.skipIf(skip)('POS ponta-a-ponta: apuramento do IVA, balancete e DFC — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let vendaService: (typeof import('@/server/services/comercial'))['vendaService'];
  let CreateVendaSchema: (typeof import('@/lib/validations/vendas'))['CreateVendaSchema'];
  let contab: typeof import('@/server/services/financas/contabilidade.service');
  let apuramento: typeof import('@/server/services/financas/apuramento-iva.service');
  let dfc: typeof import('@/server/services/financas/dfc.service');

  const sufixo = Date.now();
  const TENANT = `tenant-pos-e2e-${sufixo}`;
  // Os schemas de vendas exigem cuid em vendedorId: forma `c` + alfanuméricos.
  const USER = `cpose2e${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  let produto16Id: string;
  let produto0Id: string;
  let localizacaoId: string;
  let sessaoCaixaId: string;
  let sessaoPOSId: string;
  let clienteId: string;

  /** Vendas feitas no primeiro teste; os seguintes dependem delas. */
  const vendas: Record<'A' | 'B' | 'C' | 'D' | 'E', any> = {} as any;
  let periodo: any;

  // ── esperados (contas à mão, independentes do código) ───────────────────────
  const ESP = {
    subtotal: dec('4620.08'),
    iva: dec('659.20'),
    total: dec('5279.28'),
    dinheiro: dec('2099.28'),
    bancos: dec('2020.00'),
    credito: dec('1160.00'),
    base16: dec('4120.08'),
  };
  // Venda A (a anulada)
  const A = { subtotal: dec('120.08'), iva: dec('19.20'), total: dec('139.28') };

  // ── itens ──────────────────────────────────────────────────────────────────
  function itensMisturados() {
    const l10 = { produtoId: produto16Id, nomeProduto: 'Artigo 10,03', quantidade: 1, precoUnitario: 10.03, desconto: 0, taxaIva: 0.16 };
    return [
      l10,
      { ...l10 },
      { ...l10 },
      { produtoId: produto16Id, nomeProduto: 'Artigo 33,33', quantidade: 3, precoUnitario: 33.33, desconto: 10, taxaIva: 0.16 },
    ];
  }
  function itensMil() {
    return [{ produtoId: produto16Id, nomeProduto: 'Artigo 1000', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 }];
  }
  function itensTaxasMistas() {
    return [
      { produtoId: produto16Id, nomeProduto: 'Artigo 1000', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 },
      { produtoId: produto0Id, nomeProduto: 'Artigo isento 500', quantidade: 1, precoUnitario: 500, desconto: 0, taxaIva: 0 },
    ];
  }

  async function vender(itens: unknown[], pagamentos: unknown[], extra: Record<string, unknown> = {}) {
    const input = CreateVendaSchema.parse({
      origem: 'POS',
      vendedorId: USER,
      sessaoPOSId,
      sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      itens,
      pagamentos,
      ...extra,
    });
    const row: any = await noCtx(() => vendaService.criar(input, ctx));
    const venda = await db.venda.findFirst({ where: { id: row.id, tenantId: TENANT } });
    expect(venda, 'venda gravada').not.toBeNull();
    expect(venda.faturaId, `venda ${venda.numero} com documento`).toBeTruthy();
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
  async function balancete() {
    const bv = await noCtx(() =>
      contab.gerarBalanceteVerificacao(
        { exercicioId: periodo.exercicioId, periodoInicial: periodo.ordem, periodoFinal: periodo.ordem, incluir13: false },
        ctx,
      ),
    );
    const linha = (codigo: string) => {
      const l = bv.linhas.find((x: any) => x.conta?.codigo === codigo);
      return { movD: l ? dec(l.movD) : ZERO, movC: l ? dec(l.movC) : ZERO };
    };
    return { bv, linha, liquido: (codigo: string) => linha(codigo).movD.minus(linha(codigo).movC) };
  }

  async function documentosEmitidos() {
    const faturas = await db.fatura.findMany({
      where: { tenantId: TENANT, status: { in: ['EMITIDA', 'PAGA', 'PARCIALMENTE_PAGA', 'VENCIDA'] } },
      include: { linhas: true },
    });
    const ncs = await db.notaCredito.findMany({
      where: { tenantId: TENANT, status: { in: ['EMITIDA', 'LIQUIDADA'] } },
      include: { linhas: true },
    });
    const ivaFat = faturas.reduce((a: Prisma.Decimal, f: any) => a.plus(dec(f.ivaTotal)), ZERO);
    const ivaNC = ncs.reduce((a: Prisma.Decimal, n: any) => a.plus(dec(n.ivaTotal)), ZERO);
    const base16 = (linhas: any[]) =>
      linhas.filter((l) => dec(l.taxaIva).equals(dec('0.16'))).reduce((a: Prisma.Decimal, l: any) => a.plus(dec(l.subtotal)), ZERO);
    const baseFat = faturas.reduce((a: Prisma.Decimal, f: any) => a.plus(base16(f.linhas)), ZERO);
    const baseNC = ncs.reduce((a: Prisma.Decimal, n: any) => a.plus(base16(n.linhas)), ZERO);
    return { faturas, ncs, iva: ivaFat.minus(ivaNC), base16: baseFat.minus(baseNC) };
  }

  async function apurar() {
    const erro = await capturarErro(async () => {
      resultadoApuramento = await noCtx(() => apuramento.apurarIva({ periodoId: periodo.id }, ctx));
    });
    expect(erro, `apurarIva recusou: ${erro?.code ?? ''} ${erro?.message ?? ''} ${JSON.stringify(erro?.details ?? erro?.meta ?? '')}`).toBeUndefined();
    return resultadoApuramento;
  }
  let resultadoApuramento: any;

  function linha44331(ap: any) {
    const linhas = ap.linhas.filter((l: any) => l.contaCodigo === '44331');
    expect(linhas, 'uma linha 44331 no apuramento').toHaveLength(1);
    return linhas[0];
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ vendaService } = await import('@/server/services/comercial'));
    ({ CreateVendaSchema } = await import('@/lib/validations/vendas'));
    contab = await import('@/server/services/financas/contabilidade.service');
    apuramento = await import('@/server/services/financas/apuramento-iva.service');
    dfc = await import('@/server/services/financas/dfc.service');
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');
    const caixa = await import('@/server/services/financas/caixa.service');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant POS ponta-a-ponta', slug: `pos-e2e-${sufixo}`, nuit: `5${String(sufixo).slice(-8)}` },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `pos-e2e-${sufixo}@test.mz`, nome: 'Vendedor POS', keycloakSub: `kc-pos-e2e-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const base = { tenantId: TENANT, categoriaId: categoria.id, unidadeMedida: 'UN', precoCompra: 300, margemLucro: 0.3 };
    produto16Id = (
      await db.produto.create({ data: { ...base, sku: `SKU-E2E-16-${sufixo}`, nome: 'Artigo a 16%', precoVenda: 1000, taxaIva: 0.16 } })
    ).id;
    produto0Id = (
      await db.produto.create({ data: { ...base, sku: `SKU-E2E-0-${sufixo}`, nome: 'Artigo isento', precoVenda: 500, taxaIva: 0 } })
    ).id;
    localizacaoId = (
      await db.localizacao.create({
        data: { tenantId: TENANT, codigo: `ARM-E2E-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
      })
    ).id;
    for (const produtoId of [produto16Id, produto0Id]) {
      await db.saldoStock.create({
        data: { tenantId: TENANT, produtoId, varianteProdutoId: '', localizacaoId, saldo: 10_000, saldoReservado: 0 },
      });
    }

    clienteId = (
      await db.cliente.create({
        data: {
          tenantId: TENANT,
          nome: 'Cliente a Crédito',
          tipo: 'JURIDICA',
          nuit: '400000313',
          email: `cliente-pos-e2e-${sufixo}@test.mz`,
          telefone: '840000313',
          codigo: `CLI-POS-E2E-${sufixo}`,
          diasPagamento: 30,
          limiteCreditoMT: 1_000_000,
        },
      })
    ).id;

    const sessaoCaixa: any = await noCtx(() => caixa.abrirSessao({ fundoInicial: 1000 }, ctx));
    sessaoCaixaId = sessaoCaixa.id;
    sessaoPOSId = (await db.sessaoPOS.create({ data: { tenantId: TENANT, vendedorId: USER, sessaoCaixaId, status: 'ABERTA' } })).id;
  });

  // -------------------------------------------------------------------------
  // Vendas
  // -------------------------------------------------------------------------

  it('cinco vendas POS no período corrente (dinheiro, cartão, dinheiro+MPESA, crédito, taxas 16%/0%) emitem documento com lançamento', async () => {
    vendas.A = await vender(itensMisturados(), [{ tipo: 'DINHEIRO', valor: 139.28, troco: 10.72 }]);
    vendas.B = await vender(itensMil(), [{ tipo: 'CARTAO', valor: 1160, referencia: 'POS-1' }]);
    vendas.C = await vender(itensMil(), [
      { tipo: 'DINHEIRO', valor: 300 },
      { tipo: 'MPESA', valor: 860, referencia: 'MP-1' },
    ]);
    vendas.D = await vender(itensMil(), [{ tipo: 'CREDITO', valor: 1160 }], { clienteId });
    vendas.E = await vender(itensTaxasMistas(), [{ tipo: 'DINHEIRO', valor: 1660 }]);

    const { faturas, iva, base16 } = await documentosEmitidos();
    expect(faturas).toHaveLength(5);
    expect(faturas.every((f: any) => f.lancamentoId), 'todos os documentos com lançamento').toBe(true);
    const subtotal = faturas.reduce((a: Prisma.Decimal, f: any) => a.plus(dec(f.subtotal)), ZERO);
    const total = faturas.reduce((a: Prisma.Decimal, f: any) => a.plus(dec(f.total)), ZERO);
    expect(subtotal.toFixed(2)).toBe(ESP.subtotal.toFixed(2));
    expect(iva.toFixed(2)).toBe(ESP.iva.toFixed(2));
    expect(total.toFixed(2)).toBe(ESP.total.toFixed(2));
    expect(base16.toFixed(2)).toBe(ESP.base16.toFixed(2));

    // Período corrente: o dos lançamentos das vendas (todos no mesmo).
    const lancs = await db.lancamento.findMany({
      where: { tenantId: TENANT, id: { in: faturas.map((f: any) => f.lancamentoId) } },
      select: { periodoId: true },
    });
    const periodos = new Set(lancs.map((l: any) => l.periodoId));
    expect(periodos.size, 'todas as vendas no mesmo período').toBe(1);
    periodo = await db.periodoContabil.findFirst({ where: { id: [...periodos][0], tenantId: TENANT } });
    expect(periodo.estado).toBe('ABERTO');
  });

  // -------------------------------------------------------------------------
  // (1) Balancete
  // -------------------------------------------------------------------------

  it('balancete do período: D 111 = Σ dinheiro, D 121 = Σ cartão/MPESA, D 411 = Σ crédito, C 711 = Σ subtotal, C 44331 = Σ IVA; as três igualdades', async () => {
    expect(periodo, 'pré-condição: vendas feitas').toBeDefined();
    const { bv, linha } = await balancete();

    expect(linha('111').movD.toFixed(2), 'D 111').toBe(ESP.dinheiro.toFixed(2));
    expect(linha('111').movC.toFixed(2), 'C 111').toBe('0.00');
    expect(linha('121').movD.toFixed(2), 'D 121').toBe(ESP.bancos.toFixed(2));
    expect(linha('121').movC.toFixed(2), 'C 121').toBe('0.00');
    expect(linha('411').movD.toFixed(2), 'D 411').toBe(ESP.credito.toFixed(2));
    expect(linha('411').movC.toFixed(2), 'C 411').toBe('0.00');
    expect(linha('711').movC.toFixed(2), 'C 711').toBe(ESP.subtotal.toFixed(2));
    expect(linha('711').movD.toFixed(2), 'D 711').toBe('0.00');
    expect(linha('44331').movC.toFixed(2), 'C 44331').toBe(ESP.iva.toFixed(2));
    expect(linha('44331').movD.toFixed(2), 'D 44331').toBe('0.00');

    expect(bv.equilibrio).toEqual({ movimento: true, acumulado: true, saldo: true });
    expect(dec(bv.totais.movD).toFixed(2)).toBe(ESP.total.toFixed(2));
    expect(dec(bv.totais.movC).toFixed(2)).toBe(ESP.total.toFixed(2));
  });

  // -------------------------------------------------------------------------
  // (2) DFC
  // -------------------------------------------------------------------------

  it('DFC do período sai sem impedimentos e articula: variação de caixa = Σ dinheiro + Σ cartão/MPESA', async () => {
    expect(periodo, 'pré-condição: vendas feitas').toBeDefined();
    const { temImpedimentos } = await import('@/server/services/financas/dfc.interface');
    let resultado: any;
    const erro = await capturarErro(async () => {
      resultado = await noCtx(() => dfc.gerarDFC({ periodoInicioId: periodo.id, periodoFimId: periodo.id }, ctx));
    });
    expect(erro, `gerarDFC lançou: ${erro?.code ?? ''} ${erro?.message ?? ''}`).toBeUndefined();
    expect(temImpedimentos(resultado), `impedimentos: ${JSON.stringify(resultado?.impedimentos ?? [])}`).toBe(false);

    const atual = resultado.atual;
    expect(dec(atual.variacaoCaixa).toFixed(2)).toBe(ESP.dinheiro.plus(ESP.bancos).toFixed(2));
    expect(dec(atual.seccoes.somaAtividades).toFixed(2)).toBe(dec(atual.variacaoCaixa).toFixed(2));
    // Resultado líquido do período = receita 711 (sem custo das vendas — ADR-0041 §9).
    expect(dec(atual.seccoes.resultadoLiquido).toFixed(2)).toBe(ESP.subtotal.toFixed(2));
  });

  // -------------------------------------------------------------------------
  // (3) Apuramento do IVA
  // -------------------------------------------------------------------------

  it('apuramento do IVA do período corre; 44331 = Σ ivaTotal dos documentos; base 44331 = Σ subtotal das linhas a 16%; sem divergência', async () => {
    expect(periodo, 'pré-condição: vendas feitas').toBeDefined();
    const docs = await documentosEmitidos();
    const ap = await apurar();

    expect(ap.estado).toBe('APURADO');
    expect(dec(ap.totalIvaLiquidado).toFixed(2)).toBe(docs.iva.toFixed(2));
    expect(dec(ap.totalIvaLiquidado).toFixed(2)).toBe(ESP.iva.toFixed(2));

    const l = linha44331(ap);
    expect(l.tipoMovimento).toBe('DEBITO');
    expect(dec(l.valorImposto).toFixed(2), 'imposto 44331 (razão)').toBe(docs.iva.toFixed(2));
    expect(l.baseImponivel, 'base 44331 (documentos)').not.toBeNull();
    expect(dec(l.baseImponivel).toFixed(2)).toBe(docs.base16.toFixed(2));
    expect(dec(l.baseImponivel).toFixed(2)).toBe(ESP.base16.toFixed(2));
    expect(l.divergenciaBase, 'sem divergência de base no 44331').toBeNull();
  });

  // -------------------------------------------------------------------------
  // (4) Anulação
  // -------------------------------------------------------------------------

  it('anular a venda a dinheiro A: no balancete o efeito dela desaparece (111/711/44331), 411 líquido inalterado; novo apuramento reflecte a NC no 44331 e na base', async () => {
    expect(periodo, 'pré-condição: vendas feitas').toBeDefined();
    expect(resultadoApuramento, 'pré-condição: primeiro apuramento').toBeDefined();
    const antes = await balancete();

    await noCtx(() => (vendaService as any).anular(vendas.A.id, { motivo: 'Cliente desistiu (S9)' }, ctx));
    const vendaA = await db.venda.findFirst({ where: { id: vendas.A.id, tenantId: TENANT } });
    expect(vendaA.status).toBe('CANCELADA');
    const ncs = await db.notaCredito.findMany({ where: { tenantId: TENANT, faturaOriginalId: vendaA.faturaId } });
    expect(ncs).toHaveLength(1);
    expect(ncs[0].lancamentoId, 'NC com lançamento').toBeTruthy();

    // Balancete: líquido (D − C) por conta, depois − antes = − contributo da venda A.
    const depois = await balancete();
    expect(depois.bv.equilibrio).toEqual({ movimento: true, acumulado: true, saldo: true });
    const delta = (c: string) => depois.liquido(c).minus(antes.liquido(c)).toFixed(2);
    expect(delta('111'), 'Δ 111').toBe(A.total.negated().toFixed(2));
    expect(delta('711'), 'Δ 711').toBe(A.subtotal.toFixed(2));
    expect(delta('44331'), 'Δ 44331').toBe(A.iva.toFixed(2));
    expect(delta('411'), 'Δ 411 (NC C 411 e liquidação D 411 anulam-se)').toBe('0.00');
    expect(delta('121'), 'Δ 121').toBe('0.00');
    // Valores absolutos, sem a venda A: 111 = 2099,28 − 139,28; 711 = −(4620,08 − 120,08); 44331 = −(659,20 − 19,20).
    // (O apuramento e o seu estorno, se já houvesse, anulam-se no 44331; aqui ainda está activo — ver abaixo.)

    // Novo apuramento: o activo tem de ser estornado primeiro (PERIODO_JA_APURADO); caminho legítimo.
    const reapurarSemEstorno = await capturarErro(() => noCtx(() => apuramento.apurarIva({ periodoId: periodo.id }, ctx)));
    expect(reapurarSemEstorno?.code).toBe('PERIODO_JA_APURADO');
    await noCtx(() =>
      apuramento.estornarApuramentoIva({ apuramentoId: resultadoApuramento.id, motivo: 'Venda POS anulada depois do apuramento' }, ctx),
    );

    // Com o apuramento estornado, o 44331 do período volta a ser só documentos: −(Σ IVA − IVA de A).
    const semApuramento = await balancete();
    expect(semApuramento.liquido('44331').toFixed(2), '44331 líquido sem A').toBe(ESP.iva.minus(A.iva).negated().toFixed(2));
    expect(semApuramento.liquido('711').toFixed(2), '711 líquido sem A').toBe(ESP.subtotal.minus(A.subtotal).negated().toFixed(2));
    expect(semApuramento.liquido('111').toFixed(2), '111 líquido sem A').toBe(ESP.dinheiro.minus(A.total).toFixed(2));

    const docs = await documentosEmitidos();
    expect(docs.ncs).toHaveLength(1);
    expect(docs.iva.toFixed(2)).toBe(ESP.iva.minus(A.iva).toFixed(2));
    expect(docs.base16.toFixed(2)).toBe(ESP.base16.minus(A.subtotal).toFixed(2));

    const ap2 = await apurar();
    expect(ap2.versao).toBe(2);
    expect(dec(ap2.totalIvaLiquidado).toFixed(2), 'IVA liquidado líquido de NC').toBe(docs.iva.toFixed(2));
    const l = linha44331(ap2);
    expect(dec(l.valorImposto).toFixed(2)).toBe(docs.iva.toFixed(2));
    expect(l.baseImponivel).not.toBeNull();
    expect(dec(l.baseImponivel).toFixed(2), 'base 44331 = facturas − NC (16%)').toBe(docs.base16.toFixed(2));
    expect(l.divergenciaBase, 'sem divergência de base depois da NC').toBeNull();
  });
});
