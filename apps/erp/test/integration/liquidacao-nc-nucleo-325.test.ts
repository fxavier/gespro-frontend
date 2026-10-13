/**
 * Oráculo #325 — os quatro caminhos de liquidação de NC passam pelo MESMO núcleo
 * (escrito ANTES da implementação; quem implementa não o altera).
 *
 * Contrato (decisão do orquestrador): refactor SEM mudança de comportamento. Um núcleo único com
 * as variantes explícitas, usado pela liquidação manual (Facturação), pela anulação POS, pela
 * devolução e pela troca; o enum gravado (`FormaLiquidacaoNC`) não muda — sem migração. Os
 * oráculos de integração existentes (nc-accoes, venda-pos-anulacao*, devolucao-troca-documento*,
 * venda-pos-anulacao-credito-322, venda-pos-anular-dia-seguinte-327) são o oráculo de
 * não-regressão; este acrescenta só o que faltava para provar a unificação.
 *
 * O MESMO invariante, verificado em sete liquidações pelos quatro caminhos reais:
 *   I1  NC `LIQUIDADA`, `dataLiquidacao` preenchida;
 *   I2  `formaLiquidacao` gravado na base (lido em SQL, `::text`) é exactamente 'COMPENSACAO'
 *       quando há parte compensada e 'DEVOLUCAO' quando não há — os dois valores de sempre;
 *   I3  parte devolvida = total − compensado. Se > 0: EXACTAMENTE um lançamento de liquidação
 *       (origem PAGAMENTO, `documentoOrigemTipo` 'NotaCredito', `documentoOrigemId` = NC), que é
 *       o `lancamentoLiquidacaoId`, LANCADO, com D só na 411 = parte devolvida, nenhum C na 411 e
 *       Σ C = Σ D. Se = 0: nenhum lançamento de liquidação e `lancamentoLiquidacaoId` nulo;
 *   I4  o lançamento de emissão da NC fica intacto (LANCADO) — liquidar não lhe toca.
 *
 *   Caminho                         | compensado | devolvido
 *   A manual COMPENSACAO            | total (116)| 0
 *   B manual DEVOLUCAO (banco)      | 0          | 116 (C 123)
 *   C anulação POS em numerário     | 0          | 1160 (C 111)
 *   D anulação POS mista            | 1000       | 160 (C 111)
 *   E devolução com reembolso       | 0          | 1160 (C 111)
 *   F troca mais barata             | 580        | 580 (C 111)
 *   G troca mais cara               | 1160       | 0
 *
 * Recusas hoje inalcançáveis pela UI, provadas DIRECTAMENTE pelas entradas em tx (decisão
 * conservadora: «sem mudança de comportamento» ⇒ mantêm-se, não se apagam), cada uma sem
 * escrever nada:
 *   R1  `liquidarNotaCreditoEmTx` com partes que não somam o total ou negativas →
 *       NC_LIQUIDACAO_INCOMPLETA;
 *   R2  `devolverNotaCreditoPelosMeiosOriginaisEmTx` de uma NC parcial → NC_DEVOLUCAO_PARCIAL.
 *
 * Contra Postgres real (Testcontainers); harness de devolucao-troca-documento-2 e
 * venda-pos-anulacao-credito-322. A sessão (auth) é o único duplo.
 * Requer: Docker em execução + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

const dec = (v: unknown) => new Prisma.Decimal(String(v));
const ZERO = new Prisma.Decimal(0);

type Ctx = { tenantId: string; userId: string };
type Operador = { ctx: Ctx; sessaoCaixaId: string; sessaoPOSId: string };
type Partida = { codigo: string; tipo: string; valor: Prisma.Decimal };

describe.skipIf(skip)('#325 — um só núcleo de liquidação de NC: o mesmo invariante nos quatro caminhos — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let comercial: typeof import('@/server/services/comercial');
  let validacoes: typeof import('@/lib/validations/vendas');
  let valFat: typeof import('@/lib/validations/faturacao');
  let caixa: typeof import('@/server/services/financas/caixa.service');
  let fat: typeof import('@/server/services/financas/faturacao.service');
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];

  const sufixo = Date.now();
  const TENANT = `tenant-liq-nc-325-${sufixo}`;
  let seq = 0;

  let produtoA: string;
  let produtoB: string;
  let localizacaoId: string;
  let clienteId: string;
  let contaBancariaId: string;
  let op: Operador;

  // ── utilidades ─────────────────────────────────────────────────────────────
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

  async function novoOperador(): Promise<Operador> {
    seq += 1;
    const userId = `cliqnc325${sufixo}u${seq}`;
    await db.user.create({
      data: { id: userId, tenantId: TENANT, email: `liq-nc-325-${sufixo}-${seq}@test.mz`, nome: `Operador ${seq}`, keycloakSub: `kc-liq-nc-325-${sufixo}-${seq}` },
    });
    const ctx = { tenantId: TENANT, userId };
    const sc: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial: 10_000 }, ctx));
    const sp = await db.sessaoPOS.create({ data: { tenantId: TENANT, vendedorId: userId, sessaoCaixaId: sc.id, status: 'ABERTA' } });
    return { ctx, sessaoCaixaId: sc.id, sessaoPOSId: sp.id };
  }

  /** Venda POS de `quantidade` × A a 1000 + 16% pelo caminho real. */
  async function venderA(quantidade: number, pagamentos: Array<{ tipo: string; valor: number }>, comCliente = false) {
    const input = validacoes.CreateVendaSchema.parse({
      origem: 'POS',
      vendedorId: op.ctx.userId,
      sessaoPOSId: op.sessaoPOSId,
      sessaoCaixaId: op.sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      ...(comCliente && { clienteId }),
      itens: [{ produtoId: produtoA, nomeProduto: 'Artigo A', quantidade, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 }],
      pagamentos,
    });
    const row: any = await runCtx(op.ctx, () => comercial.vendaService.criar(input, op.ctx));
    const venda = await db.venda.findFirst({ where: { id: row.id, tenantId: TENANT } });
    expect(venda?.faturaId, 'pré-condição: venda POS com documento').toBeTruthy();
    const fatura = await db.fatura.findFirst({ where: { id: venda.faturaId, tenantId: TENANT } });
    expect(fatura.lancamentoId, 'pré-condição: documento com lançamento').toBeTruthy();
    return { venda, fatura };
  }

  async function devolucaoAprovada(venda: any, fatura: any, reembolso: boolean) {
    const input = validacoes.CreateDevolucaoSchema.parse({
      clienteId: fatura.clienteId,
      vendaId: venda.id,
      faturaId: fatura.id,
      motivo: 'DEFEITO',
      reembolso,
      itens: [{ produtoId: produtoA, nomeProduto: 'Artigo A', quantidade: 1, valorUnitario: 1000, taxaIva: 0.16 }],
    });
    const dev: any = await runCtx(op.ctx, () => comercial.devolucaoService.criar(input, op.ctx));
    await runCtx(op.ctx, () => comercial.devolucaoService.aprovar(dev.id, op.ctx));
    return db.devolucao.findFirst({ where: { id: dev.id, tenantId: TENANT } });
  }

  function trocar(input: Record<string, unknown>) {
    const parsed = validacoes.CreateTrocaSchema.parse({ localizacaoId, ...input });
    return runCtx(op.ctx, () => comercial.trocaService.criar(parsed, op.ctx));
  }

  const itemB = (precoUnitario: number) => ({ produtoId: produtoB, nomeProduto: 'Artigo B', quantidade: 1, precoUnitario, desconto: 0, taxaIva: 0.16 });

  /** Factura de Facturação (10 × 100 + 16% = 1160), a crédito do cliente. */
  async function emitirFaturaFaturacao(): Promise<string> {
    const hoje = new Date();
    const input = valFat.EmitirFaturaSchema.parse({
      clienteId,
      dataEmissao: hoje,
      dataVencimento: new Date(hoje.getTime() + 30 * 86_400_000),
      linhas: [{ descricao: 'Mercadoria', quantidade: 10, precoUnitario: 100, taxaIva: 0.16 }],
    });
    const f: any = await runCtx(op.ctx, () => fat.emitirFatura(input, op.ctx));
    return f.id;
  }

  /** NC de 1 × 100 + 16% = 116 sobre a factura dada. */
  async function emitirNC116(faturaOriginalId: string): Promise<any> {
    const input = valFat.EmitirNotaCreditoSchema.parse({
      faturaOriginalId,
      motivo: 'Devolução parcial',
      dataEmissao: new Date(),
      linhas: [{ descricao: 'Artigo devolvido', quantidade: 1, precoUnitario: 100, taxaIva: 0.16 }],
    });
    return runCtx(op.ctx, () => fat.emitirNotaCredito(input, op.ctx));
  }

  async function partidasDe(lancamentoId: string): Promise<Partida[]> {
    const partidas = await db.partidaLancamento.findMany({
      where: { lancamentoId, tenantId: TENANT },
      include: { conta: { select: { codigo: true } } },
    });
    return partidas.map((p: any) => ({ codigo: p.conta.codigo as string, tipo: p.tipo as string, valor: dec(p.valor) }));
  }

  function somar(partidas: Partida[], tipo: string, codigo?: string) {
    return partidas
      .filter((p) => p.tipo === tipo && (codigo === undefined || p.codigo === codigo))
      .reduce((a, p) => a.plus(p.valor), ZERO);
  }

  async function ncsDe(faturaOriginalId: string) {
    return db.notaCredito.findMany({ where: { tenantId: TENANT, faturaOriginalId } });
  }

  /**
   * I1–I4: o invariante do núcleo único. `contaDoMeio`: a conta que o lançamento de liquidação
   * credita (só quando há parte devolvida).
   */
  async function provarInvarianteDoNucleo(
    caminho: string,
    ncId: string,
    esperado: { compensado: string; contaDoMeio?: string },
  ) {
    const nc = await db.notaCredito.findFirst({ where: { id: ncId, tenantId: TENANT } });
    expect(nc, `${caminho}: NC existe`).toBeTruthy();

    // I1
    expect(nc.status, `${caminho}: I1 status`).toBe('LIQUIDADA');
    expect(nc.dataLiquidacao, `${caminho}: I1 dataLiquidacao`).toBeTruthy();

    // I2 — o valor gravado, lido em SQL (o enum da base não muda).
    const [{ forma }] = await db.$queryRaw`SELECT "formaLiquidacao"::text AS forma FROM "NotaCredito" WHERE id = ${ncId}`;
    const compensado = dec(esperado.compensado);
    expect(forma, `${caminho}: I2 formaLiquidacao gravada`).toBe(compensado.greaterThan(0) ? 'COMPENSACAO' : 'DEVOLUCAO');

    // I3
    const total = dec(nc.total);
    const devolvido = total.minus(compensado);
    const liquidacoes = await db.lancamento.findMany({
      where: { tenantId: TENANT, documentoOrigemId: ncId, documentoOrigemTipo: 'NotaCredito', origem: 'PAGAMENTO' },
    });
    if (devolvido.greaterThan(0)) {
      expect(liquidacoes, `${caminho}: I3 exactamente um lançamento de liquidação`).toHaveLength(1);
      expect(nc.lancamentoLiquidacaoId, `${caminho}: I3 lancamentoLiquidacaoId é esse lançamento`).toBe(liquidacoes[0].id);
      expect(liquidacoes[0].status, `${caminho}: I3 lançamento LANCADO`).toBe('LANCADO');
      const ps = await partidasDe(liquidacoes[0].id);
      expect(somar(ps, 'DEBITO', '411').toFixed(2), `${caminho}: I3 D 411 = parte devolvida`).toBe(devolvido.toFixed(2));
      expect(somar(ps, 'DEBITO').toFixed(2), `${caminho}: I3 débitos só na 411`).toBe(devolvido.toFixed(2));
      expect(somar(ps, 'CREDITO', '411').toFixed(2), `${caminho}: I3 nenhum C na 411`).toBe('0.00');
      expect(somar(ps, 'CREDITO').toFixed(2), `${caminho}: I3 Σ C = Σ D`).toBe(devolvido.toFixed(2));
      if (esperado.contaDoMeio) {
        expect(somar(ps, 'CREDITO', esperado.contaDoMeio).toFixed(2), `${caminho}: I3 C ${esperado.contaDoMeio}`).toBe(devolvido.toFixed(2));
      }
    } else {
      expect(liquidacoes, `${caminho}: I3 sem lançamento de liquidação`).toHaveLength(0);
      expect(nc.lancamentoLiquidacaoId, `${caminho}: I3 lancamentoLiquidacaoId nulo`).toBeNull();
    }

    // I4
    expect(nc.lancamentoId, `${caminho}: I4 NC com lançamento de emissão`).toBeTruthy();
    const emissao = await db.lancamento.findFirst({ where: { id: nc.lancamentoId, tenantId: TENANT } });
    expect(emissao.status, `${caminho}: I4 lançamento de emissão intacto`).toBe('LANCADO');
    expect(emissao.id).not.toBe(nc.lancamentoLiquidacaoId);
  }

  async function contagens() {
    return {
      ncs: await db.notaCredito.count({ where: { tenantId: TENANT } }),
      ncLiquidadas: await db.notaCredito.count({ where: { tenantId: TENANT, status: 'LIQUIDADA' } }),
      lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
      partidas: await db.partidaLancamento.count({ where: { tenantId: TENANT } }),
      movimentosCaixa: await db.movimentoCaixa.count({ where: { tenantId: TENANT } }),
    };
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    comercial = await import('@/server/services/comercial');
    validacoes = await import('@/lib/validations/vendas');
    valFat = await import('@/lib/validations/faturacao');
    caixa = await import('@/server/services/financas/caixa.service');
    fat = await import('@/server/services/financas/faturacao.service');
    ({ BusinessRuleError } = await import('@/lib/errors'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant Liquidação NC #325', slug: `liq-nc-325-${sufixo}`, nuit: `6${String(sufixo).slice(-8)}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const loc = await db.localizacao.create({
      data: { tenantId: TENANT, codigo: `ARM-325-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    for (const [sku, nome, preco] of [
      [`SKU-325-A-${sufixo}`, 'Artigo A', 1000],
      [`SKU-325-B-${sufixo}`, 'Artigo B', 500],
    ] as const) {
      const p = await db.produto.create({
        data: { tenantId: TENANT, sku, nome, categoriaId: categoria.id, unidadeMedida: 'UN', precoVenda: preco, precoCompra: preco * 0.7, margemLucro: 0.3, taxaIva: 0.16 },
      });
      await db.saldoStock.create({ data: { tenantId: TENANT, produtoId: p.id, varianteProdutoId: '', localizacaoId, saldo: 1000, saldoReservado: 0 } });
      if (sku.includes('-A-')) produtoA = p.id;
      else produtoB = p.id;
    }

    const cliente = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente #325',
        tipo: 'JURIDICA',
        nuit: '400000325',
        email: `cliente-325-${sufixo}@test.mz`,
        telefone: '840000325',
        codigo: `CLI-325-${sufixo}`,
        diasPagamento: 30,
        limiteCreditoMT: 10_000_000,
      },
    });
    clienteId = cliente.id;

    const pgc123 = await db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo: '123' } });
    const conta = await db.contaBancaria.create({
      data: {
        tenantId: TENANT,
        banco: 'Banco #325',
        agencia: '0001',
        numeroConta: `325-${sufixo}`,
        tipoConta: 'CORRENTE',
        contaContabilId: pgc123.id,
        ativo: true,
      },
    });
    contaBancariaId = conta.id;

    op = await novoOperador();
  });

  // =========================================================================
  // O mesmo invariante nos quatro caminhos
  // =========================================================================

  it('A — liquidação manual por COMPENSACAO (Facturação): compensa o total, sem lançamento', async () => {
    const faturaId = await emitirFaturaFaturacao();
    const nc = await emitirNC116(faturaId);
    const ctx = { ...op.ctx, permissions: new Set(['faturacao:nc:liquidar']) };
    await runCtx(ctx, () => fat.liquidarNotaCredito({ id: nc.id, forma: 'COMPENSACAO', data: new Date() } as any, ctx));
    await provarInvarianteDoNucleo('A manual COMPENSACAO', nc.id, { compensado: '116' });
  });

  it('B — liquidação manual por DEVOLUCAO (transferência): devolve o total, D 411 / C 123', async () => {
    const faturaId = await emitirFaturaFaturacao();
    const nc = await emitirNC116(faturaId);
    const ctx = { ...op.ctx, permissions: new Set(['faturacao:nc:liquidar', 'financas:banca:escrita']) };
    await runCtx(ctx, () =>
      fat.liquidarNotaCredito(
        { id: nc.id, forma: 'DEVOLUCAO', data: new Date(), formaPagamento: 'TRANSFERENCIA_BANCARIA', contaBancariaId } as any,
        ctx,
      ),
    );
    await provarInvarianteDoNucleo('B manual DEVOLUCAO', nc.id, { compensado: '0', contaDoMeio: '123' });
  });

  it('C — anulação POS de venda em numerário: devolve pelos meios originais, D 411 / C 111', async () => {
    const { venda, fatura } = await venderA(1, [{ tipo: 'DINHEIRO', valor: 1160 }]);
    await runCtx(op.ctx, () => (comercial.vendaService as any).anular(venda.id, { motivo: 'Cliente desistiu' }, op.ctx));
    const ncs = await ncsDe(fatura.id);
    expect(ncs, 'uma NC da anulação').toHaveLength(1);
    await provarInvarianteDoNucleo('C anulação numerário', ncs[0].id, { compensado: '0', contaDoMeio: '111' });
  });

  it('D — anulação POS mista (CREDITO 1000 + DINHEIRO 160): compensa 1000, devolve 160 (D 411 / C 111)', async () => {
    const { venda, fatura } = await venderA(
      1,
      [
        { tipo: 'DINHEIRO', valor: 160 },
        { tipo: 'CREDITO', valor: 1000 },
      ],
      true,
    );
    await runCtx(op.ctx, () => (comercial.vendaService as any).anular(venda.id, { motivo: 'Cliente desistiu' }, op.ctx));
    const ncs = await ncsDe(fatura.id);
    expect(ncs, 'uma NC da anulação').toHaveLength(1);
    await provarInvarianteDoNucleo('D anulação mista', ncs[0].id, { compensado: '1000', contaDoMeio: '111' });
  });

  it('E — devolução processada com reembolso em numerário: devolve o total, D 411 / C 111', async () => {
    const { venda, fatura } = await venderA(1, [{ tipo: 'DINHEIRO', valor: 1160 }]);
    const dev = await devolucaoAprovada(venda, fatura, true);
    await runCtx(op.ctx, () =>
      comercial.devolucaoService.processar(dev.id, op.ctx, { localizacaoId, sessaoCaixaId: op.sessaoCaixaId }),
    );
    const ncs = await ncsDe(fatura.id);
    expect(ncs, 'uma NC da devolução').toHaveLength(1);
    await provarInvarianteDoNucleo('E devolução reembolso', ncs[0].id, { compensado: '0', contaDoMeio: '111' });
  });

  it('F — troca por artigo mais barato (A 1160 → B 580): compensa 580 na FR da troca, devolve 580 (D 411 / C 111)', async () => {
    const { venda, fatura } = await venderA(1, [{ tipo: 'DINHEIRO', valor: 1160 }]);
    const dev = await devolucaoAprovada(venda, fatura, false);
    await trocar({ devolucaoId: dev.id, novoItem: itemB(500), sessaoCaixaId: op.sessaoCaixaId, pagamentos: [] });
    const ncs = await ncsDe(fatura.id);
    expect(ncs, 'uma NC da troca').toHaveLength(1);
    await provarInvarianteDoNucleo('F troca mais barata', ncs[0].id, { compensado: '580', contaDoMeio: '111' });
  });

  it('G — troca por artigo mais caro (A 1160 → B 1740, paga 580): compensa o total, sem lançamento de liquidação', async () => {
    const { venda, fatura } = await venderA(1, [{ tipo: 'DINHEIRO', valor: 1160 }]);
    const dev = await devolucaoAprovada(venda, fatura, false);
    await trocar({ devolucaoId: dev.id, novoItem: itemB(1500), sessaoCaixaId: op.sessaoCaixaId, pagamentos: [{ tipo: 'DINHEIRO', valor: 580 }] });
    const ncs = await ncsDe(fatura.id);
    expect(ncs, 'uma NC da troca').toHaveLength(1);
    await provarInvarianteDoNucleo('G troca mais cara', ncs[0].id, { compensado: '1160' });
  });

  it('o enum gravado não mudou: a base só admite DEVOLUCAO e COMPENSACAO em FormaLiquidacaoNC', async () => {
    const valores: Array<{ v: string }> = await db.$queryRaw`
      SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'FormaLiquidacaoNC' ORDER BY e.enumsortorder`;
    expect(valores.map((r) => r.v).sort()).toEqual(['COMPENSACAO', 'DEVOLUCAO']);
  });

  // =========================================================================
  // Recusas hoje inalcançáveis pela UI — provadas directamente, sem escrita
  // =========================================================================

  it('R1 — liquidarNotaCreditoEmTx com partes que não somam o total (ou negativas) → NC_LIQUIDACAO_INCOMPLETA, NC EMITIDA, nada escrito', async () => {
    const faturaId = await emitirFaturaFaturacao();
    const nc = await emitirNC116(faturaId);
    const antes = await contagens();

    const casos: Array<{ nome: string; numerario: string; compensado: string }> = [
      { nome: 'falta 1 MT', numerario: '115', compensado: '0' },
      { nome: 'excede 1 MT', numerario: '100', compensado: '17' },
      { nome: 'parte negativa que soma o total', numerario: '-10', compensado: '126' },
    ];
    for (const c of casos) {
      const erro = await capturarErro(() =>
        runCtx(op.ctx, () =>
          db.$transaction((tx: any) =>
            (fat as any).liquidarNotaCreditoEmTx(
              tx,
              { notaCreditoId: nc.id, data: new Date(), numerario: dec(c.numerario), compensado: dec(c.compensado) },
              op.ctx,
            ),
          ),
        ),
      );
      esperarRegra(erro, 'NC_LIQUIDACAO_INCOMPLETA');
      const gravada = await db.notaCredito.findFirst({ where: { id: nc.id, tenantId: TENANT } });
      expect(gravada.status, `${c.nome}: NC continua EMITIDA`).toBe('EMITIDA');
      expect(gravada.formaLiquidacao, `${c.nome}: sem forma`).toBeNull();
      expect(await contagens(), `${c.nome}: nada escrito`).toEqual(antes);
    }
  });

  it('R2 — devolverNotaCreditoPelosMeiosOriginaisEmTx de uma NC parcial → NC_DEVOLUCAO_PARCIAL, NC EMITIDA, nada escrito', async () => {
    const faturaId = await emitirFaturaFaturacao();
    const nc = await emitirNC116(faturaId); // 116 de 1160: parcial
    const antes = await contagens();
    const faturaAntes = await db.fatura.findFirst({ where: { id: faturaId, tenantId: TENANT } });

    const erro = await capturarErro(() =>
      runCtx(op.ctx, () =>
        db.$transaction((tx: any) =>
          (fat as any).devolverNotaCreditoPelosMeiosOriginaisEmTx(tx, { notaCreditoId: nc.id, data: new Date() }, op.ctx),
        ),
      ),
    );

    esperarRegra(erro, 'NC_DEVOLUCAO_PARCIAL');
    const gravada = await db.notaCredito.findFirst({ where: { id: nc.id, tenantId: TENANT } });
    expect(gravada.status).toBe('EMITIDA');
    expect(gravada.formaLiquidacao).toBeNull();
    expect(await contagens()).toEqual(antes);
    expect(await db.fatura.findFirst({ where: { id: faturaId, tenantId: TENANT } })).toEqual(faturaAntes);
  });
});
