/**
 * Oráculo S9 — anular uma venda POS é emitir um documento fiscal: aplica o travão do e-mail
 * (ADR-0041 §6, §8)
 *
 * Contrato: `vendaService.anular(vendaId, { motivo }, ctx)` emite uma nota de crédito — documento
 * fiscal irreversível com efeito para terceiros. Como qualquer emissão com sessão, exige o e-mail
 * da conta confirmado (`exigirEmailConfirmadoParaEmitir`, fail-closed): a abertura da sessão POS
 * não cobre a anulação, porque o e-mail pode deixar de constar como confirmado na sessão
 * entretanto e a anulação também se faz fora do POS (detalhe da venda).
 *
 * Com a sessão a dizer `emailVerificado: false`, ou sem o campo, a anulação de uma venda POS paga
 * (a dinheiro, CONCLUIDA, com Factura-Recibo) recusa com BusinessRuleError
 * `EMAIL_POR_CONFIRMAR_EMISSAO` e não escreve nada: nenhuma NotaCredito/linha, série NOTA_CREDITO
 * por avançar, venda CONCLUIDA, factura e o seu lançamento intactos, nenhum Lancamento/Partida,
 * MovimentoCaixa ou MovimentoStock novo, saldo de stock igual.
 * Controlo positivo: reposta a sessão confirmada, a MESMA venda anula-se (CANCELADA, uma NC) —
 * a recusa era o travão e não outra coisa.
 *
 * Contra Postgres real (Testcontainers), harness do oráculo S7 (`venda-pos-anulacao.test.ts`).
 * A sessão (auth) é fronteira e é o único duplo — mutável (`vi.hoisted`), como no oráculo S6
 * (`sessao-pos-abertura.test.ts`): a venda faz-se com a sessão confirmada e só depois se troca.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

// Mutável: cada caso parte de sessão confirmada; a recusa troca-a depois de vender.
const h = vi.hoisted(() => ({ sessao: null as null | { user: { emailVerificado?: boolean } } }));
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => h.sessao),
}));

const SESSAO_CONFIRMADA = { user: { emailVerificado: true } };

const dec = (v: unknown) => new Prisma.Decimal(String(v));

type Ctx = { tenantId: string; userId: string };
type Operador = { ctx: Ctx; sessaoCaixaId: string; sessaoPOSId: string };

describe.skipIf(skip)('Anular venda POS exige e-mail confirmado (travão de emissão) — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let vendaService: (typeof import('@/server/services/comercial'))['vendaService'];
  let CreateVendaSchema: (typeof import('@/lib/validations/vendas'))['CreateVendaSchema'];
  let caixa: typeof import('@/server/services/financas/caixa.service');
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];

  const sufixo = Date.now();
  const TENANT = `tenant-pos-anul-email-${sufixo}`;
  let seq = 0;

  let produtoId: string;
  let localizacaoId: string;
  let op: Operador;

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
    expect(erro.code).toBe(codigo);
  }

  async function novoOperador(): Promise<Operador> {
    seq += 1;
    // Os schemas de vendas exigem cuid em vendedorId: forma `c` + alfanuméricos.
    const userId = `cposanulemail${sufixo}u${seq}`;
    await db.user.create({
      data: {
        id: userId,
        tenantId: TENANT,
        email: `pos-anul-email-${sufixo}-${seq}@test.mz`,
        nome: `Vendedor ${seq}`,
        keycloakSub: `kc-pos-anul-email-${sufixo}-${seq}`,
      },
    });
    const ctx = { tenantId: TENANT, userId };
    const sc: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial: 1000 }, ctx));
    const sp = await db.sessaoPOS.create({ data: { tenantId: TENANT, vendedorId: userId, sessaoCaixaId: sc.id, status: 'ABERTA' } });
    return { ctx, sessaoCaixaId: sc.id, sessaoPOSId: sp.id };
  }

  async function venderADinheiro() {
    const input = CreateVendaSchema.parse({
      origem: 'POS',
      vendedorId: op.ctx.userId,
      sessaoPOSId: op.sessaoPOSId,
      sessaoCaixaId: op.sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      itens: itensMil(),
      pagamentos: [{ tipo: 'DINHEIRO', valor: 1160 }],
    });
    const row: any = await runCtx(op.ctx, () => vendaService.criar(input, op.ctx));
    const venda = await db.venda.findFirst({ where: { id: row.id, tenantId: TENANT } });
    expect(venda?.status).toBe('CONCLUIDA');
    expect(venda?.faturaId, 'pré-condição: venda com Factura-Recibo').toBeTruthy();
    return venda;
  }

  function anular(vendaId: string, motivo: string) {
    expect(typeof (vendaService as any).anular, 'vendaService.anular publicado').toBe('function');
    return runCtx(op.ctx, () => (vendaService as any).anular(vendaId, { motivo }, op.ctx));
  }

  async function proximoNumeroDaSerie(tipo: string): Promise<number> {
    const series = await db.serieDocumento.findMany({ where: { tenantId: TENANT, tipo, ativo: true } });
    expect(series.length, `série activa ${tipo}`).toBeGreaterThan(0);
    return series.reduce((a: number, s: any) => a + s.proximoNumero, 0);
  }

  async function saldoStock() {
    const s = await db.saldoStock.findFirst({ where: { tenantId: TENANT, produtoId, localizacaoId, varianteProdutoId: '' } });
    return dec(s.saldo).toString();
  }

  async function contagens() {
    return {
      notasCredito: await db.notaCredito.count({ where: { tenantId: TENANT } }),
      linhasNotaCredito: await db.linhaNotaCredito.count({ where: { tenantId: TENANT } }),
      lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
      partidas: await db.partidaLancamento.count({ where: { tenantId: TENANT } }),
      movimentosStock: await db.movimentoStock.count({ where: { tenantId: TENANT } }),
      movimentosCaixa: await db.movimentoCaixa.count({ where: { tenantId: TENANT } }),
      faturas: await db.fatura.count({ where: { tenantId: TENANT } }),
      vendasCanceladas: await db.venda.count({ where: { tenantId: TENANT, status: 'CANCELADA' } }),
      saldo: await saldoStock(),
      serieNC: await proximoNumeroDaSerie('NOTA_CREDITO'),
    };
  }

  async function fotografiaFatura(faturaId: string) {
    const fatura = await db.fatura.findFirst({ where: { id: faturaId, tenantId: TENANT } });
    const linhas = await db.linhaFatura.findMany({ where: { faturaId, tenantId: TENANT }, orderBy: { id: 'asc' } });
    const lanc = await db.lancamento.findFirst({ where: { id: fatura.lancamentoId, tenantId: TENANT } });
    return { fatura, linhas, lanc };
  }

  beforeAll(async () => {
    h.sessao = SESSAO_CONFIRMADA;
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ vendaService } = await import('@/server/services/comercial'));
    ({ CreateVendaSchema } = await import('@/lib/validations/vendas'));
    caixa = await import('@/server/services/financas/caixa.service');
    ({ BusinessRuleError } = await import('@/lib/errors'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant POS Anulação E-mail', slug: `pos-anul-email-${sufixo}`, nuit: `4${String(sufixo).slice(-8)}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const produto = await db.produto.create({
      data: {
        tenantId: TENANT,
        sku: `SKU-POS-ANUL-EMAIL-${sufixo}`,
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
      data: { tenantId: TENANT, codigo: `ARM-POS-ANUL-EMAIL-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    await db.saldoStock.create({
      data: { tenantId: TENANT, produtoId, varianteProdutoId: '', localizacaoId, saldo: 10_000, saldoReservado: 0 },
    });

    op = await novoOperador();
  });

  beforeEach(() => {
    h.sessao = SESSAO_CONFIRMADA;
  });

  it.each([
    ['emailVerificado: false', { user: { emailVerificado: false } }],
    ['sem o campo emailVerificado', { user: {} }],
  ])(
    'sessão com %s → EMAIL_POR_CONFIRMAR_EMISSAO, nada escrito (sem NC, série NC intacta, venda CONCLUIDA, sem caixa/stock/lançamento); com e-mail confirmado a mesma anulação passa',
    async (_rotulo, sessaoSemConfirmacao) => {
      const venda = await venderADinheiro();
      const antes = await contagens();
      const foto = await fotografiaFatura(venda.faturaId);

      h.sessao = sessaoSemConfirmacao as any;
      const erro = await capturarErro(() => anular(venda.id, 'Cliente desistiu'));
      h.sessao = SESSAO_CONFIRMADA;

      esperarRegra(erro, 'EMAIL_POR_CONFIRMAR_EMISSAO');
      expect(await contagens(), 'nada escrito').toEqual(antes);
      expect(await fotografiaFatura(venda.faturaId), 'factura e lançamento intactos').toEqual(foto);
      expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: venda.faturaId } })).toBe(0);
      expect((await db.venda.findFirst({ where: { id: venda.id, tenantId: TENANT } })).status).toBe('CONCLUIDA');

      // Controlo positivo: com o e-mail confirmado, a mesma venda anula-se.
      await anular(venda.id, 'Cliente desistiu');
      expect((await db.venda.findFirst({ where: { id: venda.id, tenantId: TENANT } })).status).toBe('CANCELADA');
      expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: venda.faturaId } })).toBe(1);
      const depois = await contagens();
      expect(depois.serieNC).toBe(antes.serieNC + 1);
      expect(depois.movimentosCaixa).toBe(antes.movimentosCaixa + 1);
    },
  );
});
