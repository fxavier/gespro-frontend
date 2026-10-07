/**
 * Oráculo #412 — a NC reutilizada pela devolução é verificada em TODOS os ramos de `processar`,
 * não só no do reembolso com sessão de caixa.
 *
 * Contrato: quando a devolução já traz `notaCreditoId` (resíduo do desenho antigo), a tranca
 * (`FOR UPDATE`) e `exigirNotaCreditoComCredito` (#331/PR #411) correm SEMPRE, antes de qualquer
 * escrita (stock, caixa, liquidação, estado da devolução):
 *   - sem reembolso, NC CANCELADA → `NC_CANCELADA` (BusinessRuleError); nada escrito; a devolução
 *     continua APROVADA e não passa a apontar para a NC cancelada;
 *   - reembolso sem sessão de caixa (via «crédito na 411»), NC CANCELADA → `NC_CANCELADA`;
 *   - sem reembolso, NC LIQUIDADA → `NC_JA_LIQUIDADA` (o crédito já foi consumido);
 *   - corrida: outra tx tem a NC trancada e cancela-a → o processar espera e recusa `NC_CANCELADA`;
 *   - nenhuma escrita é sequer tentada antes da recusa: nem `entradaStock` nem
 *     `registarMovimentoCaixa` são chamados (também no ramo com reembolso e sessão de caixa);
 *   - controlo positivo: sem reembolso, NC EMITIDA → PROCESSADA, reutiliza-a (nenhuma NC nova),
 *     a NC fica EMITIDA (crédito do cliente na 411) e o stock reentra.
 *
 * Contra Postgres real (Testcontainers), harness de troca-serie-nc-tranca-331.test.ts.
 * Requer: Docker em execução + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Ctx = { tenantId: string; userId: string };
type Operador = { ctx: Ctx; sessaoCaixaId: string; sessaoPOSId: string };

describe.skipIf(skip)('#412 — devolução: NC reutilizada verificada em todos os ramos do processar — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let comercial: typeof import('@/server/services/comercial');
  let validacoes: typeof import('@/lib/validations/vendas');
  let caixa: typeof import('@/server/services/financas/caixa.service');
  let faturacao: typeof import('@/server/services/financas/faturacao.service');
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];
  let bootstrapContabilidade: (typeof import('@/server/provisioning/tenant-bootstrap'))['bootstrapContabilidade'];

  const sufixo = Date.now();
  const TENANT = `tenant-dev412-${sufixo}`;
  let seq = 0;

  let produtoA: string;
  let localizacaoId: string;
  let op: Operador;
  let serieNCId: string;

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  async function novoOperador(): Promise<Operador> {
    seq += 1;
    const userId = `cdev412${sufixo}u${seq}`;
    await db.user.create({
      data: { id: userId, tenantId: TENANT, email: `dev412-${sufixo}-${seq}@test.mz`, nome: `Operador ${seq}`, keycloakSub: `kc-dev412-${sufixo}-${seq}` },
    });
    const ctx = { tenantId: TENANT, userId };
    const sc: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial: 5000 }, ctx));
    const sp = await db.sessaoPOS.create({ data: { tenantId: TENANT, vendedorId: userId, sessaoCaixaId: sc.id, status: 'ABERTA' } });
    return { ctx, sessaoCaixaId: sc.id, sessaoPOSId: sp.id };
  }

  /** Venda POS de 1 × A a 1000 + 16%, paga em DINHEIRO (FR 1160). */
  async function venderA() {
    const input = validacoes.CreateVendaSchema.parse({
      origem: 'POS',
      vendedorId: op.ctx.userId,
      sessaoPOSId: op.sessaoPOSId,
      sessaoCaixaId: op.sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      itens: [{ produtoId: produtoA, nomeProduto: 'Artigo A', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 }],
      pagamentos: [{ tipo: 'DINHEIRO', valor: 1160 }],
    });
    const row: any = await runCtx(op.ctx, () => comercial.vendaService.criar(input, op.ctx));
    const venda = await db.venda.findFirst({ where: { id: row.id, tenantId: TENANT } });
    expect(venda?.faturaId, 'pré-condição: venda POS com Factura-Recibo').toBeTruthy();
    const fatura = await db.fatura.findFirst({ where: { id: venda.faturaId, tenantId: TENANT } });
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
    const gravada = await db.devolucao.findFirst({ where: { id: dev.id, tenantId: TENANT } });
    expect(gravada.status).toBe('APROVADA');
    return gravada;
  }

  /** Devolução APROVADA que já traz uma NC (EMITIDA) da sua factura — o caso «reutilizada». */
  async function devolucaoComNCReutilizada(reembolso: boolean) {
    const { venda, fatura } = await venderA();
    const dev = await devolucaoAprovada(venda, fatura, reembolso);
    const nc: any = await runCtx(op.ctx, () =>
      faturacao.emitirNotaCredito(
        {
          faturaOriginalId: fatura.id,
          motivo: 'NC anterior da devolução',
          moeda: 'MZN',
          dataEmissao: new Date(),
          linhas: [
            { produtoId: produtoA, descricao: 'Artigo A', quantidade: 1, desconto: 0, ordemLinha: 1, precoUnitario: 1000, subtotal: 1000, ivaItem: 160, total: 1160, taxaIva: 0.16 },
          ],
        } as any,
        op.ctx,
      ),
    );
    await db.devolucao.update({ where: { id: dev.id }, data: { notaCreditoId: nc.id } });
    const gravada = await db.notaCredito.findFirst({ where: { id: nc.id, tenantId: TENANT } });
    expect(gravada.status, 'pré-condição: NC reutilizada EMITIDA').toBe('EMITIDA');
    return { dev: { ...dev, notaCreditoId: nc.id }, ncId: nc.id as string };
  }

  function liquidarNC(ncId: string) {
    return runCtx(op.ctx, () =>
      faturacao.liquidarNotaCredito(
        { id: ncId, forma: 'DEVOLUCAO', data: new Date(), formaPagamento: 'NUMERARIO' } as any,
        { ...op.ctx, permissions: new Set(['caixa:operar']) },
      ),
    );
  }

  function cancelarNC(ncId: string) {
    return runCtx(op.ctx, () => faturacao.cancelarNotaCredito(ncId, 'Emitida por engano', op.ctx));
  }

  function processar(devolucaoId: string, opcoes: { sessaoCaixaId?: string } = {}) {
    return runCtx(op.ctx, () =>
      comercial.devolucaoService.processar(devolucaoId, op.ctx, { localizacaoId, serieNotaCreditoId: serieNCId, ...opcoes }),
    );
  }

  async function contagens() {
    return {
      notasCredito: await db.notaCredito.count({ where: { tenantId: TENANT } }),
      ncPorEstado: JSON.stringify(
        await db.notaCredito.findMany({ where: { tenantId: TENANT }, select: { id: true, status: true }, orderBy: { id: 'asc' } }),
      ),
      faturas: await db.fatura.count({ where: { tenantId: TENANT } }),
      lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
      movimentosStock: await db.movimentoStock.count({ where: { tenantId: TENANT } }),
      movimentosCaixa: await db.movimentoCaixa.count({ where: { tenantId: TENANT } }),
      saldoA: String(
        (await db.saldoStock.findFirst({ where: { tenantId: TENANT, produtoId: produtoA, localizacaoId } }))?.saldo,
      ),
    };
  }

  async function estadoDevolucao(id: string) {
    const d = await db.devolucao.findFirst({ where: { id, tenantId: TENANT } });
    return { status: d.status, notaCreditoId: d.notaCreditoId, processadoEm: d.processadoEm, processadoPorId: d.processadoPorId };
  }

  /** Espiões nas dependências injectadas do serviço (campos privados — acesso dinâmico). */
  function espiarEscritas() {
    const svc = comercial.devolucaoService as any;
    return {
      entradaStock: vi.spyOn(svc['stockService'], 'entradaStock'),
      registarMovimentoCaixa: vi.spyOn(svc['caixaService'], 'registarMovimentoCaixa'),
      liquidarNotaCreditoEmTx: vi.spyOn(svc['faturacaoService'], 'liquidarNotaCreditoEmTx'),
      emitirNotaCreditoEmTx: vi.spyOn(svc['faturacaoService'], 'emitirNotaCreditoEmTx'),
    };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    comercial = await import('@/server/services/comercial');
    validacoes = await import('@/lib/validations/vendas');
    caixa = await import('@/server/services/financas/caixa.service');
    faturacao = await import('@/server/services/financas/faturacao.service');
    ({ BusinessRuleError } = await import('@/lib/errors'));
    ({ bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap'));

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant Devolução 412', slug: `dev412-${sufixo}`, nuit: `5${String(sufixo).slice(-8)}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const loc = await db.localizacao.create({
      data: { tenantId: TENANT, codigo: `ARM-412-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    const p = await db.produto.create({
      data: { tenantId: TENANT, sku: `SKU-412-A-${sufixo}`, nome: 'Artigo A', categoriaId: categoria.id, unidadeMedida: 'UN', precoVenda: 1000, precoCompra: 700, margemLucro: 0.3, taxaIva: 0.16 },
    });
    await db.saldoStock.create({ data: { tenantId: TENANT, produtoId: p.id, varianteProdutoId: '', localizacaoId, saldo: 1000, saldoReservado: 0 } });
    produtoA = p.id;

    const serieNC = await db.serieDocumento.findFirst({ where: { tenantId: TENANT, tipo: 'NOTA_CREDITO', ativo: true } });
    expect(serieNC, 'série NOTA_CREDITO activa no bootstrap').not.toBeNull();
    serieNCId = serieNC.id;

    op = await novoOperador();
  });

  // =========================================================================
  // 1. Recusa fora do ramo «reembolso com sessão de caixa»
  // =========================================================================

  describe('NC reutilizada fora de EMITIDA, sem saída de gaveta', () => {
    const casos = [
      { titulo: 'sem reembolso, NC CANCELADA', reembolso: false, codigo: 'NC_CANCELADA', estado: 'CANCELADA', preparar: (id: string) => cancelarNC(id) },
      { titulo: 'reembolso SEM sessão de caixa, NC CANCELADA', reembolso: true, codigo: 'NC_CANCELADA', estado: 'CANCELADA', preparar: (id: string) => cancelarNC(id) },
      { titulo: 'sem reembolso, NC LIQUIDADA', reembolso: false, codigo: 'NC_JA_LIQUIDADA', estado: 'LIQUIDADA', preparar: (id: string) => liquidarNC(id) },
    ] as const;

    for (const c of casos) {
      it(`${c.titulo} → ${c.codigo} (BusinessRuleError); nada escrito; devolução APROVADA sem apontar para a NC`, async () => {
        const { dev, ncId } = await devolucaoComNCReutilizada(c.reembolso);
        await c.preparar(ncId);
        expect((await db.notaCredito.findFirst({ where: { id: ncId, tenantId: TENANT } })).status).toBe(c.estado);
        const antes = await contagens();
        const devAntes = await estadoDevolucao(dev.id);

        const erro = await capturarErro(() => processar(dev.id));

        expect(erro, 'o processar tinha de ser recusado').toBeInstanceOf(BusinessRuleError);
        expect((erro as any)?.code).toBe(c.codigo);
        expect(await contagens(), 'nada escrito (stock, caixa, NC, lançamentos)').toEqual(antes);
        const devDepois = await estadoDevolucao(dev.id);
        expect(devDepois, 'devolução intacta').toEqual(devAntes);
        expect(devDepois.status).toBe('APROVADA');
      });
    }
  });

  // =========================================================================
  // 2. A verificação vem antes de qualquer escrita (em todos os ramos)
  // =========================================================================

  describe('a recusa acontece antes de qualquer escrita', () => {
    it('sem reembolso, NC CANCELADA → nem entradaStock, nem movimento de caixa, nem liquidação, nem NC nova', async () => {
      const { dev, ncId } = await devolucaoComNCReutilizada(false);
      await cancelarNC(ncId);
      const espioes = espiarEscritas();

      const erro = await capturarErro(() => processar(dev.id));

      expect((erro as any)?.code).toBe('NC_CANCELADA');
      expect(espioes.entradaStock, 'o stock não reentra antes da verificação').not.toHaveBeenCalled();
      expect(espioes.registarMovimentoCaixa).not.toHaveBeenCalled();
      expect(espioes.liquidarNotaCreditoEmTx).not.toHaveBeenCalled();
      expect(espioes.emitirNotaCreditoEmTx, 'reutilizada: não se emite outra').not.toHaveBeenCalled();
    });

    it('reembolso COM sessão de caixa, NC CANCELADA → NC_CANCELADA sem tentar entradaStock nem movimento de caixa', async () => {
      const { dev, ncId } = await devolucaoComNCReutilizada(true);
      await cancelarNC(ncId);
      const antes = await contagens();
      const espioes = espiarEscritas();

      const erro = await capturarErro(() => processar(dev.id, { sessaoCaixaId: op.sessaoCaixaId }));

      expect(erro).toBeInstanceOf(BusinessRuleError);
      expect((erro as any)?.code).toBe('NC_CANCELADA');
      expect(espioes.entradaStock, 'a verificação vem antes da entrada de stock').not.toHaveBeenCalled();
      expect(espioes.registarMovimentoCaixa, 'a verificação vem antes da saída de gaveta').not.toHaveBeenCalled();
      expect(espioes.liquidarNotaCreditoEmTx).not.toHaveBeenCalled();
      expect(await contagens()).toEqual(antes);
      expect((await estadoDevolucao(dev.id)).status).toBe('APROVADA');
    });
  });

  // =========================================================================
  // 3. Corrida — sem reembolso, a NC é cancelada por quem a tem trancada
  // =========================================================================

  describe('corrida com uma transacção que tem a NC trancada', () => {
    it('sem reembolso, processar arranca com a NC trancada por quem a CANCELA → espera e recusa NC_CANCELADA; nada escrito', async () => {
      const { dev, ncId } = await devolucaoComNCReutilizada(false);
      const antes = await contagens();
      const devAntes = await estadoDevolucao(dev.id);

      let libertar!: () => void;
      const gate = new Promise<void>((r) => (libertar = r));
      let sinalizarTranca!: () => void;
      const trancou = new Promise<void>((r) => (sinalizarTranca = r));

      const dono = db.$transaction(
        async (tx: any) => {
          await tx.$queryRaw`SELECT id FROM "NotaCredito" WHERE id = ${ncId} AND "tenantId" = ${TENANT} FOR UPDATE`;
          sinalizarTranca();
          await gate;
          await tx.$executeRaw`UPDATE "NotaCredito" SET status = 'CANCELADA'::"StatusNotaCredito" WHERE id = ${ncId} AND "tenantId" = ${TENANT}`;
        },
        { timeout: 30_000, maxWait: 10_000 },
      );

      await trancou;
      let terminou = false;
      const pOperacao = capturarErro(() => processar(dev.id)).then((e) => {
        terminou = true;
        return e;
      });
      await esperar(1_500);
      const terminouAntesDoCommit = terminou;
      libertar();
      await dono;
      const erro = await pOperacao;

      expect(terminouAntesDoCommit, 'o processar tem de esperar pela tranca da NC').toBe(false);
      expect(erro, 'o processar tinha de ser recusado').toBeInstanceOf(BusinessRuleError);
      expect((erro as any)?.code, 'o estado que decide é o lido depois da tranca').toBe('NC_CANCELADA');
      const depois = await contagens();
      expect({ ...depois, ncPorEstado: undefined }, 'nada escrito pelo processar').toEqual({ ...antes, ncPorEstado: undefined });
      expect(await estadoDevolucao(dev.id)).toEqual(devAntes);
    });
  });

  // =========================================================================
  // 4. Controlo positivo — sem reembolso, NC EMITIDA reutiliza-se
  // =========================================================================

  describe('controlo positivo', () => {
    it('sem reembolso, NC reutilizada EMITIDA → PROCESSADA, reutiliza-a (nenhuma NC nova), NC continua EMITIDA, stock reentra', async () => {
      const { dev, ncId } = await devolucaoComNCReutilizada(false);
      const antes = await contagens();

      await processar(dev.id);

      const depois = await contagens();
      expect(depois.notasCredito, 'reutiliza, não emite outra').toBe(antes.notasCredito);
      expect(depois.movimentosCaixa, 'sem reembolso não sai dinheiro da gaveta').toBe(antes.movimentosCaixa);
      expect(depois.movimentosStock, 'o stock reentra').toBe(antes.movimentosStock + 1);
      expect((await db.notaCredito.findFirst({ where: { id: ncId, tenantId: TENANT } })).status, 'crédito do cliente na 411').toBe('EMITIDA');
      const d = await estadoDevolucao(dev.id);
      expect(d.status).toBe('PROCESSADA');
      expect(d.notaCreditoId).toBe(ncId);
    });
  });
});
