/**
 * Oráculo da issue #132 (lado do servidor) — submeter uma venda em Rascunho.
 *
 * Uma venda de origem ENCOMENDA nasce RASCUNHO (`vendaService.criar`). O botão «Submeter» do
 * detalhe tem de a levar ao passo seguinte da máquina, PENDENTE, pela mesma porta que a UI usa
 * (`TransitarVendaSchema` → `vendaService.transitar`). Contrato (conservador): a máquina de
 * estados NÃO é alargada — RASCUNHO → CONFIRMADA continua recusada; a correcção está no pedido
 * que a UI faz (ver o oráculo unitário `venda-acoes-submeter-132.test.ts`).
 *
 * Contra Postgres real (Testcontainers):
 *   - ENCOMENDA criada pelo serviço → RASCUNHO, com reserva de stock activa.
 *   - Submeter (RASCUNHO → PENDENTE): passa no schema da action, muda o estado, regista o
 *     histórico, e não mexe em stock, documento nem contabilidade (a reserva continua activa).
 *   - Depois de submetida, «Confirmar» (PENDENTE → CONFIRMADA) funciona.
 *   - RASCUNHO → CONFIRMADA directo continua recusado com TRANSICAO_INVALIDA e nada muda.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

describe.skipIf(skip)('#132 — submeter uma venda ENCOMENDA em Rascunho — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let vendaService: (typeof import('@/server/services/comercial'))['vendaService'];
  let CreateVendaSchema: (typeof import('@/lib/validations/vendas'))['CreateVendaSchema'];
  let TransitarVendaSchema: (typeof import('@/lib/validations/vendas'))['TransitarVendaSchema'];

  const sufixo = Date.now();
  const TENANT = `tenant-venda-submeter-132-${sufixo}`;
  const USER = `cvendasub132${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  let produtoId: string;
  let localizacaoId: string;
  let clienteId: string;

  async function encomendaEmRascunho() {
    const input = CreateVendaSchema.parse({
      origem: 'ENCOMENDA',
      vendedorId: USER,
      clienteId,
      localizacaoOrigemId: localizacaoId,
      itens: [{ produtoId, nomeProduto: 'Artigo 1000', quantidade: 2, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 }],
      pagamentos: [{ tipo: 'CREDITO', valor: 2320 }],
    });
    const row: any = await noCtx(() => vendaService.criar(input, ctx));
    const venda = await db.venda.findFirst({ where: { id: row.id, tenantId: TENANT } });
    expect(venda.status, 'fixture: ENCOMENDA nasce RASCUNHO').toBe('RASCUNHO');
    expect(venda.faturaId, 'fixture: encomenda sem documento').toBeNull();
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

  async function retrato(vendaId: string) {
    const v = await db.venda.findFirst({ where: { id: vendaId, tenantId: TENANT } });
    const saldos = await db.saldoStock.findMany({ where: { tenantId: TENANT, produtoId }, orderBy: { localizacaoId: 'asc' } });
    const reservas = await db.reservaStock.findMany({
      where: { tenantId: TENANT, documentoReferenciaId: vendaId },
      orderBy: { id: 'asc' },
    });
    return {
      status: v.status,
      faturaId: v.faturaId,
      saldos: saldos.map((s: any) => `${s.localizacaoId}|${String(s.saldo)}|${String(s.saldoReservado)}`),
      reservas: reservas.map((r: any) => `${r.status}|${String(r.quantidade)}`),
      movimentosStock: await db.movimentoStock.count({ where: { tenantId: TENANT } }),
      faturas: await db.fatura.count({ where: { tenantId: TENANT } }),
      lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
      movimentosCaixa: await db.movimentoCaixa.count({ where: { tenantId: TENANT } }),
      historico: await db.historicoEstadoVenda.count({ where: { tenantId: TENANT, vendaId } }),
    };
  }

  /** O mesmo caminho da `transitarVendaAction`: schema da action e depois o serviço. */
  function transitarComoAAction(vendaId: string, paraStatus: string) {
    const input = TransitarVendaSchema.parse({ vendaId, paraStatus });
    return noCtx(() => vendaService.transitar(input, ctx));
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ vendaService } = await import('@/server/services/comercial'));
    ({ CreateVendaSchema, TransitarVendaSchema } = await import('@/lib/validations/vendas'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant submeter venda #132', slug: `venda-submeter-132-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `venda-submeter-132-${sufixo}@test.mz`, nome: 'Vendedor', keycloakSub: `kc-venda-submeter-132-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const produto = await db.produto.create({
      data: {
        tenantId: TENANT,
        sku: `SKU-VENDA-SUBMETER-132-${sufixo}`,
        nome: 'Artigo de encomenda',
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
      data: { tenantId: TENANT, codigo: `ARM-VENDA-SUBMETER-132-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    await db.saldoStock.create({
      data: { tenantId: TENANT, produtoId, varianteProdutoId: '', localizacaoId, saldo: 1_000, saldoReservado: 0 },
    });

    const cliente = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente da Encomenda',
        tipo: 'JURIDICA',
        nuit: '400000132',
        email: `cliente-venda-submeter-132-${sufixo}@test.mz`,
        telefone: '840000132',
        codigo: `CLI-VENDA-SUBMETER-132-${sufixo}`,
        diasPagamento: 30,
        limiteCreditoMT: 1_000_000,
      },
    });
    clienteId = cliente.id;
  });

  it('submeter: RASCUNHO → PENDENTE passa pela porta da action, regista histórico e não mexe em stock, documento nem contabilidade', async () => {
    const venda = await encomendaEmRascunho();
    const antes = await retrato(venda.id);
    expect(antes.reservas.length, 'fixture: a encomenda reservou stock').toBeGreaterThan(0);
    expect(antes.reservas.every((r: string) => r.startsWith('ATIVA|'))).toBe(true);

    await transitarComoAAction(venda.id, 'PENDENTE');

    const depois = await retrato(venda.id);
    expect(depois.status).toBe('PENDENTE');
    expect(depois.historico).toBe(antes.historico + 1);
    expect(
      await db.historicoEstadoVenda.count({
        where: { tenantId: TENANT, vendaId: venda.id, estadoAntes: 'RASCUNHO', estadoDepois: 'PENDENTE' },
      }),
    ).toBe(1);
    expect(depois.reservas).toEqual(antes.reservas);
    expect(depois.saldos).toEqual(antes.saldos);
    expect(depois.movimentosStock).toBe(antes.movimentosStock);
    expect(depois.faturaId).toBeNull();
    expect(depois.faturas).toBe(antes.faturas);
    expect(depois.lancamentos).toBe(antes.lancamentos);
    expect(depois.movimentosCaixa).toBe(antes.movimentosCaixa);
  });

  it('depois de submetida, «Confirmar» (PENDENTE → CONFIRMADA) funciona', async () => {
    const venda = await encomendaEmRascunho();
    await transitarComoAAction(venda.id, 'PENDENTE');

    await transitarComoAAction(venda.id, 'CONFIRMADA');

    const depois = await retrato(venda.id);
    expect(depois.status).toBe('CONFIRMADA');
    expect(depois.reservas.every((r: string) => r.startsWith('ATIVA|'))).toBe(true);
  });

  it('a máquina não é alargada: RASCUNHO → CONFIRMADA directo continua recusado e nada muda', async () => {
    const venda = await encomendaEmRascunho();
    const antes = await retrato(venda.id);

    const erro = await capturarErro(() => transitarComoAAction(venda.id, 'CONFIRMADA'));

    expect(erro, 'RASCUNHO → CONFIRMADA tinha de ser recusado').toBeDefined();
    expect(erro.name).toBe('BusinessRuleError');
    expect(erro.code).toBe('TRANSICAO_INVALIDA');
    expect(await retrato(venda.id)).toEqual(antes);
  });
});
