/**
 * Oráculo S7 (iteração 2) — `vendaService.transitar` não tira do estado uma venda com
 * documento fiscal (ADR-0041 §8; issue #311).
 *
 * Uma venda POS que tem Factura (`faturaId`) só sai pela nota de crédito: `anular` ou
 * devolução. `transitar` é alcançável pela `transitarVendaAction` com qualquer `paraStatus`;
 * levá-la a DEVOLVIDA reentrava stock sem NC, e a CANCELADA deixava a factura viva.
 *
 * Contra Postgres real (Testcontainers), pelo caminho real `vendaService.criar` (venda a crédito
 * com cliente identificado → FATURADA com Factura):
 *   - FATURADA + faturaId → DEVOLVIDA: BusinessRuleError `VENDA_COM_DOCUMENTO`; nada muda
 *     (estado da venda, saldo e movimentos de stock, linha da Factura, NC, histórico, lançamentos,
 *     caixa).
 *   - FATURADA + faturaId → CANCELADA: `VENDA_COM_DOCUMENTO` (não o genérico
 *     TRANSICAO_INVALIDA); nada muda.
 *   - Controlo: FATURADA → CONCLUIDA continua permitido (não toca no documento).
 *   - Controlo: venda SEM faturaId (ENCOMENDA PENDENTE inserida directamente) → CANCELADA
 *     continua a funcionar.
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

describe.skipIf(skip)('transitar não mexe numa venda com documento fiscal (ADR-0041 §8) — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let vendaService: (typeof import('@/server/services/comercial'))['vendaService'];
  let CreateVendaSchema: (typeof import('@/lib/validations/vendas'))['CreateVendaSchema'];

  const sufixo = Date.now();
  const TENANT = `tenant-venda-doc-s7-${sufixo}`;
  const USER = `cvendadocs7${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  let produtoId: string;
  let localizacaoId: string;
  let sessaoCaixaId: string;
  let sessaoPOSId: string;
  let clienteId: string;

  async function vendaACredito() {
    const input = CreateVendaSchema.parse({
      origem: 'POS',
      vendedorId: USER,
      sessaoPOSId,
      sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      clienteId,
      itens: [{ produtoId, nomeProduto: 'Artigo 1000', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 }],
      pagamentos: [{ tipo: 'CREDITO', valor: 1160 }],
    });
    const row: any = await noCtx(() => vendaService.criar(input, ctx));
    const venda = await db.venda.findFirst({ where: { id: row.id, tenantId: TENANT } });
    expect(venda.status, 'fixture: venda a crédito FATURADA').toBe('FATURADA');
    expect(venda.faturaId, 'fixture: venda com Factura').toBeTruthy();
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

  async function retrato(venda: { id: string; faturaId: string }) {
    const saldos = await db.saldoStock.findMany({
      where: { tenantId: TENANT, produtoId },
      orderBy: { localizacaoId: 'asc' },
    });
    const fatura = await db.fatura.findFirst({ where: { id: venda.faturaId, tenantId: TENANT } });
    const v = await db.venda.findFirst({ where: { id: venda.id, tenantId: TENANT } });
    return {
      vendaStatus: v.status,
      vendaFaturaId: v.faturaId,
      saldos: saldos.map((s: any) => `${s.localizacaoId}|${String(s.saldo)}|${String(s.saldoReservado)}`),
      movimentosStock: await db.movimentoStock.count({ where: { tenantId: TENANT } }),
      fatura: {
        status: fatura.status,
        total: String(fatura.total),
        totalPago: String(fatura.totalPago),
        lancamentoId: fatura.lancamentoId,
        vendaId: fatura.vendaId,
        updatedAt: fatura.updatedAt?.toISOString?.() ?? null,
      },
      faturas: await db.fatura.count({ where: { tenantId: TENANT } }),
      notasCredito: await db.notaCredito.count({ where: { tenantId: TENANT } }),
      historico: await db.historicoEstadoVenda.count({ where: { tenantId: TENANT } }),
      historicoDaVenda: await db.historicoEstadoVenda.count({ where: { tenantId: TENANT, vendaId: venda.id } }),
      lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
      movimentosCaixa: await db.movimentoCaixa.count({ where: { tenantId: TENANT } }),
    };
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ vendaService } = await import('@/server/services/comercial'));
    ({ CreateVendaSchema } = await import('@/lib/validations/vendas'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');
    const caixa = await import('@/server/services/financas/caixa.service');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant venda c/ documento S7', slug: `venda-doc-s7-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `venda-doc-s7-${sufixo}@test.mz`, nome: 'Vendedor POS', keycloakSub: `kc-venda-doc-s7-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const produto = await db.produto.create({
      data: {
        tenantId: TENANT,
        sku: `SKU-VENDA-DOC-S7-${sufixo}`,
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
    // Armazém activo: sem ele o ramo DEVOLVIDA falharia por LOCALIZACAO_NAO_ENCONTRADA e o
    // RED não provaria nada — com ele, o código actual reentra stock sem NC.
    const loc = await db.localizacao.create({
      data: { tenantId: TENANT, codigo: `ARM-VENDA-DOC-S7-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    await db.saldoStock.create({
      data: { tenantId: TENANT, produtoId, varianteProdutoId: '', localizacaoId, saldo: 1_000, saldoReservado: 0 },
    });

    const cliente = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente a Crédito',
        tipo: 'JURIDICA',
        nuit: '400000327',
        email: `cliente-venda-doc-s7-${sufixo}@test.mz`,
        telefone: '840000327',
        codigo: `CLI-VENDA-DOC-S7-${sufixo}`,
        diasPagamento: 30,
        limiteCreditoMT: 1_000_000,
      },
    });
    clienteId = cliente.id;

    const sessaoCaixa: any = await noCtx(() => caixa.abrirSessao({ fundoInicial: 1000 }, ctx));
    sessaoCaixaId = sessaoCaixa.id;
    const sessaoPOS = await db.sessaoPOS.create({
      data: { tenantId: TENANT, vendedorId: USER, sessaoCaixaId, status: 'ABERTA' },
    });
    sessaoPOSId = sessaoPOS.id;
  });

  it.each([['DEVOLVIDA'], ['CANCELADA']] as const)(
    'venda POS FATURADA com Factura → %s: VENDA_COM_DOCUMENTO e nada muda',
    async (paraStatus) => {
      const venda = await vendaACredito();
      const antes = await retrato(venda);

      const erro = await capturarErro(() =>
        noCtx(() => vendaService.transitar({ vendaId: venda.id, paraStatus, motivo: 'tentativa' } as never, ctx)),
      );

      expect(erro, `transitar para ${paraStatus} uma venda com documento tinha de ser recusado`).toBeDefined();
      expect(erro.name).toBe('BusinessRuleError');
      expect(erro.code).toBe('VENDA_COM_DOCUMENTO');
      expect(await retrato(venda)).toEqual(antes);
      expect(antes.vendaStatus).toBe('FATURADA');
    },
  );

  it('controlo: FATURADA → CONCLUIDA continua permitido e não toca no documento', async () => {
    const venda = await vendaACredito();
    const antes = await retrato(venda);

    await noCtx(() => vendaService.transitar({ vendaId: venda.id, paraStatus: 'CONCLUIDA' } as never, ctx));

    const depois = await retrato(venda);
    expect(depois.vendaStatus).toBe('CONCLUIDA');
    expect(depois.vendaFaturaId).toBe(venda.faturaId);
    expect(depois.fatura).toEqual(antes.fatura);
    expect(depois.saldos).toEqual(antes.saldos);
    expect(depois.movimentosStock).toBe(antes.movimentosStock);
    expect(depois.notasCredito).toBe(antes.notasCredito);
    expect(depois.historicoDaVenda).toBe(antes.historicoDaVenda + 1);
  });

  it('controlo: venda SEM faturaId (ENCOMENDA PENDENTE) → CANCELADA continua a funcionar', async () => {
    const encomenda = await db.venda.create({
      data: {
        tenantId: TENANT,
        numero: `ENC-S7-TESTE-${sufixo}`,
        origem: 'ENCOMENDA',
        status: 'PENDENTE',
        clienteId,
        vendedorId: USER,
        subtotal: new Prisma.Decimal(1000),
        ivaTotal: new Prisma.Decimal(160),
        total: new Prisma.Decimal(1160),
      },
    });
    expect(encomenda.faturaId).toBeNull();

    await noCtx(() => vendaService.transitar({ vendaId: encomenda.id, paraStatus: 'CANCELADA' } as never, ctx));

    const depois = await db.venda.findFirst({ where: { id: encomenda.id, tenantId: TENANT } });
    expect(depois.status).toBe('CANCELADA');
    expect(
      await db.historicoEstadoVenda.count({ where: { tenantId: TENANT, vendaId: encomenda.id, estadoDepois: 'CANCELADA' } }),
    ).toBe(1);
  });
});
