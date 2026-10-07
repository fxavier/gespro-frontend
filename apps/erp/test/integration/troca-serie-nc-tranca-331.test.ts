/**
 * Oráculo #331 — NC reutilizada em devolução/troca lida COM tranca, códigos separados, e número
 * da troca pela série de documento.
 *
 *  1. NC reutilizada (resíduo do desenho antigo: a devolução já traz `notaCreditoId`):
 *     - LIQUIDADA → `NC_JA_LIQUIDADA`; CANCELADA → `NC_CANCELADA` (código próprio, não o da
 *       liquidação), tanto em `trocaService.criar` como em `devolucaoService.processar` com
 *       reembolso. Nada escrito em nenhum dos casos. Controlo positivo: EMITIDA reutiliza-se.
 *     - Corrida: outra transacção tem a NC trancada (`FOR UPDATE`) e muda-lhe o estado antes do
 *       commit. A troca/o processar tem de ESPERAR por essa tranca antes de ler e verificar o
 *       estado — e então recusa com o código do estado novo (BusinessRuleError), em vez de seguir
 *       com o EMITIDA lido sem tranca e rebentar mais à frente (`TRANSICAO_INVALIDA` na liquidação).
 *  2. `Troca.numero` sai de `proximoNumeroSerie(tx, 'TROCA', …)`: igual ao número formatado da série
 *     TROCA activa do ano (prefixo TRC), que avança 1 por troca; duas trocas → números seguidos.
 *     O bootstrap cria a série TROCA/TRC; a migração de dados cria-a nos tenants que já existem
 *     (idempotente) — corrida aqui dentro de uma tx desfeita no fim, sem tocar nos outros tenants.
 *
 * Contra Postgres real (Testcontainers), harness de devolucao-troca-documento-2.test.ts.
 * Requer: Docker em execução + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

/** Ano civil corrente em Africa/Maputo (UTC+2, sem hora de Verão) — oráculo próprio. */
function anoCorrenteMaputo(): number {
  return new Date(Date.now() + 2 * 3_600_000).getUTCFullYear();
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Ctx = { tenantId: string; userId: string };
type Operador = { ctx: Ctx; sessaoCaixaId: string; sessaoPOSId: string };

describe.skipIf(skip)('#331 — NC reutilizada trancada, NC_JA_LIQUIDADA ≠ NC_CANCELADA, número da troca pela série TROCA — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let comercial: typeof import('@/server/services/comercial');
  let validacoes: typeof import('@/lib/validations/vendas');
  let caixa: typeof import('@/server/services/financas/caixa.service');
  let faturacao: typeof import('@/server/services/financas/faturacao.service');
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];
  let bootstrapContabilidade: (typeof import('@/server/provisioning/tenant-bootstrap'))['bootstrapContabilidade'];

  const sufixo = Date.now();
  const TENANT = `tenant-troca331-${sufixo}`;
  const ANO = anoCorrenteMaputo();
  let seq = 0;

  let produtoA: string;
  let produtoB: string;
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
    const userId = `ctroca331${sufixo}u${seq}`;
    await db.user.create({
      data: { id: userId, tenantId: TENANT, email: `troca331-${sufixo}-${seq}@test.mz`, nome: `Operador ${seq}`, keycloakSub: `kc-troca331-${sufixo}-${seq}` },
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

  /**
   * Devolução APROVADA que já traz uma NC (EMITIDA) da sua factura — o caso «reutilizada» de
   * `notaCreditoDaDevolucaoEmTx`. A NC sai pela via pública de Facturação.
   */
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
    return { venda, fatura, dev: { ...dev, notaCreditoId: nc.id }, ncId: nc.id as string };
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

  function processar(devolucaoId: string, opcoes: { sessaoCaixaId?: string }) {
    return runCtx(op.ctx, () =>
      comercial.devolucaoService.processar(devolucaoId, op.ctx, { localizacaoId, serieNotaCreditoId: serieNCId, ...opcoes }),
    );
  }

  function trocar(input: Record<string, unknown>) {
    const parsed = validacoes.CreateTrocaSchema.parse({ localizacaoId, serieNotaCreditoId: serieNCId, ...input });
    return runCtx(op.ctx, () => comercial.trocaService.criar(parsed, op.ctx));
  }

  /** Troca B(1500) com diferença 580 paga em dinheiro (crédito da NC: 1160). */
  const inputTroca = (devolucaoId: string) => ({
    devolucaoId,
    novoItem: { produtoId: produtoB, nomeProduto: 'Artigo B', quantidade: 1, precoUnitario: 1500, desconto: 0, taxaIva: 0.16 },
    sessaoCaixaId: op.sessaoCaixaId,
    pagamentos: [{ tipo: 'DINHEIRO', valor: 580 }],
  });

  async function contagens() {
    return {
      notasCredito: await db.notaCredito.count({ where: { tenantId: TENANT } }),
      ncPorEstado: JSON.stringify(
        (await db.notaCredito.findMany({ where: { tenantId: TENANT }, select: { id: true, status: true }, orderBy: { id: 'asc' } })),
      ),
      faturas: await db.fatura.count({ where: { tenantId: TENANT } }),
      vendas: await db.venda.count({ where: { tenantId: TENANT } }),
      trocas: await db.troca.count({ where: { tenantId: TENANT } }),
      lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
      movimentosStock: await db.movimentoStock.count({ where: { tenantId: TENANT } }),
      movimentosCaixa: await db.movimentoCaixa.count({ where: { tenantId: TENANT } }),
    };
  }

  async function estadoDevolucao(id: string) {
    const d = await db.devolucao.findFirst({ where: { id, tenantId: TENANT } });
    return { status: d.status, notaCreditoId: d.notaCreditoId, processadoEm: d.processadoEm };
  }

  async function serieTroca(tenantId: string = TENANT) {
    return db.serieDocumento.findFirst({ where: { tenantId, tipo: 'TROCA', ano: ANO, ativo: true } });
  }

  const formatar = (serie: any, n: number) => `${serie.prefixo}/${serie.ano}/${String(n).padStart(6, '0')}`;

  /**
   * Outra transacção tranca a NC (`FOR UPDATE`), espera, muda-lhe o estado e faz commit.
   * `operacao` arranca enquanto a tranca está tomada. Devolve o erro (ou undefined) da operação.
   */
  async function corridaComTranca(ncId: string, novoEstado: 'LIQUIDADA' | 'CANCELADA', operacao: () => Promise<unknown>) {
    let libertar!: () => void;
    const gate = new Promise<void>((r) => (libertar = r));
    let sinalizarTranca!: () => void;
    const trancou = new Promise<void>((r) => (sinalizarTranca = r));

    const dono = db.$transaction(
      async (tx: any) => {
        await tx.$queryRaw`SELECT id FROM "NotaCredito" WHERE id = ${ncId} AND "tenantId" = ${TENANT} FOR UPDATE`;
        sinalizarTranca();
        await gate;
        await tx.$executeRaw`UPDATE "NotaCredito" SET status = ${novoEstado}::"StatusNotaCredito" WHERE id = ${ncId} AND "tenantId" = ${TENANT}`;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    await trancou;
    let terminou = false;
    const pOperacao = capturarErro(operacao).then((e) => {
      terminou = true;
      return e;
    });
    await esperar(1_500);
    const terminouAntesDoCommit = terminou;
    libertar();
    await dono;
    const erro = await pOperacao;
    return { erro, terminouAntesDoCommit };
  }

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
      data: { id: TENANT, nome: 'Tenant Troca 331', slug: `troca331-${sufixo}`, nuit: `6${String(sufixo).slice(-8)}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const loc = await db.localizacao.create({
      data: { tenantId: TENANT, codigo: `ARM-331-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    for (const [sku, nome, preco] of [
      [`SKU-331-A-${sufixo}`, 'Artigo A', 1000],
      [`SKU-331-B-${sufixo}`, 'Artigo B', 1500],
    ] as const) {
      const p = await db.produto.create({
        data: { tenantId: TENANT, sku, nome, categoriaId: categoria.id, unidadeMedida: 'UN', precoVenda: preco, precoCompra: preco * 0.7, margemLucro: 0.3, taxaIva: 0.16 },
      });
      await db.saldoStock.create({ data: { tenantId: TENANT, produtoId: p.id, varianteProdutoId: '', localizacaoId, saldo: 1000, saldoReservado: 0 } });
      if (sku.includes('-A-')) produtoA = p.id;
      else produtoB = p.id;
    }

    const serieNC = await db.serieDocumento.findFirst({ where: { tenantId: TENANT, tipo: 'NOTA_CREDITO', ativo: true } });
    expect(serieNC, 'série NOTA_CREDITO activa no bootstrap').not.toBeNull();
    serieNCId = serieNC.id;

    op = await novoOperador();
  });

  // =========================================================================
  // 1a. NC reutilizada já fora de EMITIDA — códigos separados, nada escrito
  // =========================================================================

  describe('NC reutilizada fora de EMITIDA', () => {
    const casos = [
      { estado: 'LIQUIDADA', codigo: 'NC_JA_LIQUIDADA', preparar: (id: string) => liquidarNC(id) },
      { estado: 'CANCELADA', codigo: 'NC_CANCELADA', preparar: (id: string) => cancelarNC(id) },
    ] as const;

    for (const c of casos) {
      it(`troca com NC reutilizada ${c.estado} → ${c.codigo}; nada escrito, devolução APROVADA`, async () => {
        const { dev, ncId } = await devolucaoComNCReutilizada(false);
        await c.preparar(ncId);
        expect((await db.notaCredito.findFirst({ where: { id: ncId, tenantId: TENANT } })).status).toBe(c.estado);
        const antes = await contagens();
        const devAntes = await estadoDevolucao(dev.id);

        const erro = await capturarErro(() => trocar(inputTroca(dev.id)));

        expect(erro, 'a troca tinha de ser recusada').toBeInstanceOf(BusinessRuleError);
        expect(erro.code).toBe(c.codigo);
        expect(await contagens(), 'nada escrito').toEqual(antes);
        expect(await estadoDevolucao(dev.id)).toEqual(devAntes);
      });

      it(`processar com reembolso e NC reutilizada ${c.estado} → ${c.codigo}; nada escrito, devolução APROVADA`, async () => {
        const { dev, ncId } = await devolucaoComNCReutilizada(true);
        await c.preparar(ncId);
        const antes = await contagens();
        const devAntes = await estadoDevolucao(dev.id);

        const erro = await capturarErro(() => processar(dev.id, { sessaoCaixaId: op.sessaoCaixaId }));

        expect(erro, 'o processar tinha de ser recusado').toBeInstanceOf(BusinessRuleError);
        expect(erro.code).toBe(c.codigo);
        expect(await contagens(), 'nada escrito').toEqual(antes);
        expect(await estadoDevolucao(dev.id)).toEqual(devAntes);
      });
    }

    it('controlo positivo: NC reutilizada EMITIDA → a troca passa e reutiliza-a (nenhuma NC nova), NC LIQUIDADA', async () => {
      const { dev, ncId } = await devolucaoComNCReutilizada(false);
      const ncsAntes = await db.notaCredito.count({ where: { tenantId: TENANT } });

      await trocar(inputTroca(dev.id));

      expect(await db.notaCredito.count({ where: { tenantId: TENANT } }), 'reutiliza, não emite outra').toBe(ncsAntes);
      expect((await db.notaCredito.findFirst({ where: { id: ncId, tenantId: TENANT } })).status).toBe('LIQUIDADA');
      const d = await estadoDevolucao(dev.id);
      expect(d.status).toBe('PROCESSADA');
      expect(d.notaCreditoId).toBe(ncId);
    });
  });

  // =========================================================================
  // 1b. Corrida — a leitura da NC reutilizada espera pela tranca de quem a muda
  // =========================================================================

  describe('corrida com uma transacção que tem a NC trancada', () => {
    it('troca arranca com a NC trancada por quem a LIQUIDA → espera pelo commit e recusa NC_JA_LIQUIDADA (BusinessRuleError); nada escrito', async () => {
      const { dev, ncId } = await devolucaoComNCReutilizada(false);
      const antes = await contagens();
      const devAntes = await estadoDevolucao(dev.id);

      const { erro, terminouAntesDoCommit } = await corridaComTranca(ncId, 'LIQUIDADA', () => trocar(inputTroca(dev.id)));

      expect(terminouAntesDoCommit, 'a troca tem de esperar pela tranca da NC').toBe(false);
      expect(erro, 'a troca tinha de ser recusada').toBeInstanceOf(BusinessRuleError);
      expect(erro.code, 'o estado que decide é o lido depois da tranca').toBe('NC_JA_LIQUIDADA');
      const depois = await contagens();
      expect({ ...depois, ncPorEstado: undefined }, 'nada escrito pela troca').toEqual({ ...antes, ncPorEstado: undefined });
      expect(await estadoDevolucao(dev.id)).toEqual(devAntes);
    });

    it('processar (reembolso) arranca com a NC trancada por quem a CANCELA → espera pelo commit e recusa NC_CANCELADA (BusinessRuleError); nada escrito', async () => {
      const { dev, ncId } = await devolucaoComNCReutilizada(true);
      const antes = await contagens();
      const devAntes = await estadoDevolucao(dev.id);

      const { erro, terminouAntesDoCommit } = await corridaComTranca(ncId, 'CANCELADA', () =>
        processar(dev.id, { sessaoCaixaId: op.sessaoCaixaId }),
      );

      expect(terminouAntesDoCommit, 'o processar tem de esperar pela tranca da NC').toBe(false);
      expect(erro, 'o processar tinha de ser recusado').toBeInstanceOf(BusinessRuleError);
      expect(erro.code, 'o estado que decide é o lido depois da tranca').toBe('NC_CANCELADA');
      const depois = await contagens();
      expect({ ...depois, ncPorEstado: undefined }, 'nada escrito pelo processar').toEqual({ ...antes, ncPorEstado: undefined });
      expect(await estadoDevolucao(dev.id)).toEqual(devAntes);
    });

    it('troca arranca com a NC trancada por quem a CANCELA → espera e recusa NC_CANCELADA', async () => {
      const { dev, ncId } = await devolucaoComNCReutilizada(false);

      const { erro, terminouAntesDoCommit } = await corridaComTranca(ncId, 'CANCELADA', () => trocar(inputTroca(dev.id)));

      expect(terminouAntesDoCommit).toBe(false);
      expect(erro).toBeInstanceOf(BusinessRuleError);
      expect(erro.code).toBe('NC_CANCELADA');
      expect((await estadoDevolucao(dev.id)).status).toBe('APROVADA');
    });
  });

  // =========================================================================
  // 2. Número da troca pela série TROCA
  // =========================================================================

  describe('número da troca pela série de documento TROCA', () => {
    it('o bootstrap cria a série TROCA activa do ano, prefixo TRC, formato {prefixo}/{ano}/{numero:06}', async () => {
      const serie = await serieTroca();
      expect(serie, 'série TROCA activa no bootstrap').not.toBeNull();
      expect(serie).toMatchObject({ prefixo: 'TRC', ano: ANO, ativo: true, formatoNumero: '{prefixo}/{ano}/{numero:06}' });
    });

    it('Troca.numero = próximo número da série TROCA (TRC/aaaa/nnnnnn); a série avança 1; duas trocas → números seguidos', async () => {
      const serieAntes = await serieTroca();
      expect(serieAntes, 'série TROCA activa').not.toBeNull();
      const n0 = serieAntes.proximoNumero as number;

      const v1 = await venderA();
      const d1 = (await devolucaoAprovada(v1.venda, v1.fatura, false)).id;
      const r1: any = await trocar(inputTroca(d1));
      const t1 = await db.troca.findFirst({ where: { id: r1.id, tenantId: TENANT } });
      expect(t1.numero).toMatch(/^TRC\/\d{4}\/\d{6}$/);
      expect(t1.numero).toBe(formatar(serieAntes, n0));
      expect(r1.numero, 'o retorno traz o número gravado').toBe(t1.numero);
      expect((await serieTroca()).proximoNumero, 'série avançada 1').toBe(n0 + 1);

      const v2 = await venderA();
      const d2 = (await devolucaoAprovada(v2.venda, v2.fatura, false)).id;
      const r2: any = await trocar(inputTroca(d2));
      const t2 = await db.troca.findFirst({ where: { id: r2.id, tenantId: TENANT } });
      expect(t2.numero).toBe(formatar(serieAntes, n0 + 1));
      expect((await serieTroca()).proximoNumero).toBe(n0 + 2);
    });

    it('troca recusada não consome número da série TROCA', async () => {
      const serieAntes = await serieTroca();
      expect(serieAntes, 'série TROCA activa').not.toBeNull();
      const { dev, ncId } = await devolucaoComNCReutilizada(false);
      await cancelarNC(ncId);

      const erro = await capturarErro(() => trocar(inputTroca(dev.id)));

      expect(erro).toBeInstanceOf(BusinessRuleError);
      expect((await serieTroca()).proximoNumero).toBe(serieAntes.proximoNumero);
    });

    it('sem série TROCA activa no ano → a troca falha e nada fica (o número não se inventa)', async () => {
      const serie = await serieTroca();
      expect(serie, 'série TROCA activa').not.toBeNull();
      const { venda, fatura } = await venderA();
      const dev = await devolucaoAprovada(venda, fatura, false);
      const antes = await contagens();
      await db.serieDocumento.update({ where: { id: serie.id }, data: { ativo: false } });
      let erro: any;
      try {
        erro = await capturarErro(() => trocar(inputTroca(dev.id)));
      } finally {
        await db.serieDocumento.update({ where: { id: serie.id }, data: { ativo: true } });
      }
      expect(erro, 'sem série a troca não pode numerar').toBeDefined();
      expect(await contagens()).toEqual(antes);
      expect((await estadoDevolucao(dev.id)).status).toBe('APROVADA');
    });

    it('migração de dados: cria a série TROCA/TRC do ano nos tenants que já existem, idempotente (ON CONFLICT DO NOTHING)', async () => {
      const dir = path.resolve('prisma/migrations');
      const ficheiros = readdirSync(dir)
        .map((m) => path.join(dir, m, 'migration.sql'))
        .filter((f) => existsSync(f));
      const comInsert = ficheiros.filter((f) => {
        const sql = readFileSync(f, 'utf8');
        return /INSERT INTO "SerieDocumento"/.test(sql) && /'TROCA'/.test(sql);
      });
      expect(comInsert, 'uma migração semeia as séries TROCA dos tenants existentes').toHaveLength(1);

      const sql = readFileSync(comInsert[0], 'utf8')
        .split('\n')
        .filter((l) => !l.trim().startsWith('--'))
        .join('\n');
      const insercoes = sql
        .split(/;\s*(?:\n|$)/)
        .map((s) => s.trim())
        .filter((s) => /^INSERT INTO "SerieDocumento"/.test(s) && /'TROCA'/.test(s));
      expect(insercoes.length, 'INSERT … SELECT das séries TROCA').toBeGreaterThan(0);

      // Tenant «antigo»: sem bootstrap, logo sem série nenhuma; e o tenant do teste, já com TROCA.
      const ANTIGO = `tenant-troca331-antigo-${sufixo}`;
      await db.tenant.create({
        data: { id: ANTIGO, nome: 'Tenant antigo 331', slug: `troca331-antigo-${sufixo}`, nuit: `7${String(sufixo).slice(-8)}` },
      });
      const doTeste = await serieTroca();
      expect(doTeste, 'pré-condição: o tenant do teste já tem TROCA pelo bootstrap').not.toBeNull();

      class Desfazer extends Error {}
      let visto: any;
      try {
        await db.$transaction(async (tx: any) => {
          for (const s of insercoes) await tx.$executeRawUnsafe(s);
          const antigo1 = await tx.serieDocumento.findMany({ where: { tenantId: ANTIGO, tipo: 'TROCA' } });
          // Segunda passagem: idempotente.
          for (const s of insercoes) await tx.$executeRawUnsafe(s);
          const antigo2 = await tx.serieDocumento.findMany({ where: { tenantId: ANTIGO, tipo: 'TROCA' } });
          const teste = await tx.serieDocumento.findMany({ where: { tenantId: TENANT, tipo: 'TROCA', ano: ANO } });
          visto = { antigo1, antigo2, teste };
          throw new Desfazer();
        });
      } catch (e) {
        if (!(e instanceof Desfazer)) throw e;
      }

      const doAno = visto.antigo1.filter((s: any) => s.ano === ANO);
      expect(doAno, 'tenant antigo recebe a série TROCA do ano corrente').toHaveLength(1);
      expect(doAno[0]).toMatchObject({ prefixo: 'TRC', ativo: true, proximoNumero: 1, numeroInicial: 1, formatoNumero: '{prefixo}/{ano}/{numero:06}' });
      expect(visto.antigo2.length, 'segunda passagem não duplica').toBe(visto.antigo1.length);
      expect(visto.teste, 'tenant que já tinha a série fica com uma só, intacta').toHaveLength(1);
      expect(visto.teste[0].id).toBe(doTeste.id);
      expect(visto.teste[0].proximoNumero).toBe(doTeste.proximoNumero);
    });
  });
});
