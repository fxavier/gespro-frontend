/**
 * Teste de integração — Cancelar conta a pagar (#566)
 *
 * Cancelar uma conta a pagar fazia só `status = CANCELADA`: o lançamento de
 * reconhecimento (D gasto / D 4432x / C 421) ficava no razão — a 421 continuava
 * credora, o gasto na DRE e o IVA dedutível no apuramento. E aceitava contas já
 * com pagamentos, deixando pagamentos reais sem dívida.
 *
 * Casos:
 *  (a) criar 1 160 (1 000 + IVA 160) e cancelar → 421, 4432x e gasto com Σ zero;
 *  (b) cancelar conta com valorPago > 0 → BusinessRuleError, nada escrito;
 *  (c) conta nova (à mão e pela recepção total) guarda o `lancamentoId`;
 *  (d) o motivo do cancelamento fica em `motivoCancelamento`.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true ou sem INTEGRATION_DB_URL → saltado.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

describe.skipIf(skip)('#566 — cancelar conta a pagar estorna o reconhecimento', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let svc: any; // contaPagarService
  let compras: any; // comprasService

  const sufixo = Date.now();
  const TENANT = `tenant-cp566-${sufixo}`;
  const USER = `user-cp566-${sufixo}`;
  const CTX = { tenantId: TENANT, userId: USER };
  let fornecedorId = '';
  let contaGasto: { id: string; codigo: string } = { id: '', codigo: '' };
  let contaBancariaId = '';
  let produtoId = '';
  let loc = '';

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ contaPagarService: svc } = await import('@/server/services/compras/conta-pagar.service'));
    ({ comprasService: compras } = (await import('@/server/services/compras/compras.service')) as any);
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({ data: { id: TENANT, nome: 'Tenant CP 566', slug: `cp566-${sufixo}`, nuit: `${sufixo}`.slice(-9) } });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `${USER}@test.mz`, nome: 'Financeiro', keycloakSub: `kc-${USER}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    fornecedorId = (
      await db.fornecedor.create({
        data: {
          tenantId: TENANT,
          codigo: `FOR-566-${sufixo}`,
          nome: 'Fornecedor 566',
          tipo: 'PESSOA_JURIDICA',
          nuit: '400000566',
          email: `for-566-${sufixo}@test.mz`,
        },
      })
    ).id;

    const folha = await db.contaPGC.findFirst({
      where: { tenantId: TENANT, codigo: { startsWith: '6' }, aceitaLancamento: true, ativo: true },
      orderBy: { codigo: 'asc' },
    });
    expect(folha, 'conta de gasto folha no bootstrap').toBeTruthy();
    contaGasto = { id: folha.id, codigo: folha.codigo };

    const pgc123 = await db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo: '123' } });
    contaBancariaId = (
      await db.contaBancaria.create({
        data: {
          tenantId: TENANT, banco: 'Banco 566', agencia: '0001', numeroConta: `CORR-566-${sufixo}`,
          tipoConta: 'CORRENTE', contaContabilId: pgc123.id, ativo: true,
        },
      })
    ).id;

    const cat = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: `Cat 566 ${sufixo}` } });
    produtoId = (
      await db.produto.create({
        data: {
          tenantId: TENANT, sku: `SKU-566-${sufixo}`, nome: 'Resma A4', categoriaId: cat.id,
          unidadeMedida: 'UN', precoVenda: '450', precoCompra: '300', margemLucro: '0.5',
        },
      })
    ).id;
    loc = (await db.localizacao.create({ data: { tenantId: TENANT, codigo: `ARM-566-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM' } })).id;
  }, 180_000);

  let seq = 0;
  const criarConta1160 = () =>
    runCtx(CTX, () =>
      svc.criar(
        {
          fornecedorId,
          descricao: `Factura 566 #${++seq}`,
          valorOriginal: 1160,
          dataEmissao: new Date(),
          dataVencimento: new Date(Date.now() + 30 * 86_400_000),
          contaContabilId: contaGasto.id,
          tipoAquisicao: 'OUTROS_BENS_SERVICOS',
          baseIva: 1000,
          taxaIva: 0.16,
          valorIva: 160,
          numeroDocumento: `FRN-566-${sufixo}-${seq}`,
          dataDocumento: new Date(),
        },
        CTX,
      ),
    );

  /** Σ (débito − crédito) das partidas de todos os lançamentos ligados à conta (reconhecimento + estorno). */
  async function somaPorConta(contaPagarId: string): Promise<Record<string, number>> {
    const rec = await db.lancamento.findMany({
      where: { tenantId: TENANT, documentoOrigemTipo: 'ContaPagar', documentoOrigemId: contaPagarId },
      select: { id: true },
    });
    const ids = rec.map((l: any) => l.id);
    const estornos = await db.lancamento.findMany({
      where: { tenantId: TENANT, lancamentoEstornoId: { in: ids } },
      select: { id: true },
    });
    const partidas = await db.partidaLancamento.findMany({
      where: { tenantId: TENANT, lancamentoId: { in: [...ids, ...estornos.map((l: any) => l.id)] } },
      include: { conta: { select: { codigo: true } } },
    });
    const soma: Record<string, number> = {};
    for (const p of partidas) {
      const v = Number(String(p.valor)) * (p.tipo === 'DEBITO' ? 1 : -1);
      soma[p.conta.codigo] = (soma[p.conta.codigo] ?? 0) + v;
    }
    return soma;
  }

  it('(a) criar 1 160 e cancelar deixa 421, 44323 e gasto com soma zero', async () => {
    const conta = await criarConta1160();
    const antes = await somaPorConta(conta.id);
    expect(antes['421']).toBeCloseTo(-1160, 2);
    expect(antes['44323']).toBeCloseTo(160, 2);
    expect(antes[contaGasto.codigo]).toBeCloseTo(1000, 2);

    await runCtx(CTX, () => svc.cancelar(conta.id, 'Factura emitida por engano', CTX));

    const depois = await somaPorConta(conta.id);
    expect(depois['421'], '421').toBeCloseTo(0, 2);
    expect(depois['44323'], '44323').toBeCloseTo(0, 2);
    expect(depois[contaGasto.codigo], 'gasto').toBeCloseTo(0, 2);
    const cp = await db.contaPagar.findFirst({ where: { id: conta.id, tenantId: TENANT } });
    expect(cp.status).toBe('CANCELADA');
  }, 60_000);

  it('(b) cancelar conta com pagamentos → BusinessRuleError, nada escrito', async () => {
    const conta = await criarConta1160();
    await runCtx(CTX, () =>
      svc.registarPagamento(
        { contaPagarId: conta.id, valor: 500, dataPagamento: new Date(), formaPagamento: 'TRANSFERENCIA_BANCARIA', contaBancariaId },
        CTX,
      ),
    );
    const antes = await db.contaPagar.findFirst({ where: { id: conta.id, tenantId: TENANT } });
    const lancAntes = await db.lancamento.count({ where: { tenantId: TENANT } });

    await expect(runCtx(CTX, () => svc.cancelar(conta.id, 'Tentativa', CTX))).rejects.toMatchObject({
      name: 'BusinessRuleError',
      code: 'CONTA_COM_PAGAMENTOS',
    });

    const depois = await db.contaPagar.findFirst({ where: { id: conta.id, tenantId: TENANT } });
    expect(depois.status).toBe(antes.status);
    expect(depois.observacoes).toBe(antes.observacoes);
    expect(await db.lancamento.count({ where: { tenantId: TENANT } })).toBe(lancAntes);
    expect(await somaPorConta(conta.id)).toMatchObject({ '421': expect.closeTo(-1160, 2) });
  }, 60_000);

  it('(c) conta criada à mão guarda o lancamentoId do reconhecimento', async () => {
    const conta = await criarConta1160();
    const cp = await db.contaPagar.findFirst({ where: { id: conta.id, tenantId: TENANT } });
    expect(cp.lancamentoId, 'lancamentoId preenchido').toBeTruthy();
    const l = await db.lancamento.findFirst({ where: { id: cp.lancamentoId, tenantId: TENANT } });
    expect(l).toMatchObject({ origem: 'COMPRA', documentoOrigemTipo: 'ContaPagar', documentoOrigemId: conta.id });
  }, 60_000);

  it('(c) conta criada pela recepção total guarda o lancamentoId do reconhecimento', async () => {
    const p = await runCtx(CTX, () =>
      compras.criarPedido(
        {
          fornecedorId,
          data: new Date(),
          condicoesPagamento: '30 dias',
          prazoEntregaDias: 10,
          dataEntregaPrevista: new Date(Date.now() + 10 * 86_400_000),
          enderecoEntrega: 'Av. 25 de Setembro, Maputo',
          itens: [{ produtoId, descricao: 'Resma A4', quantidade: 4, unidadeMedida: 'UN', precoUnitario: 250, desconto: 0, taxaIva: 0.16 }],
        },
        CTX,
      ),
    );
    await runCtx(CTX, () => compras.enviarPedido(p.id, CTX));
    await runCtx(CTX, () => compras.confirmarPedido(p.id, CTX));
    await runCtx(CTX, () => compras.marcarPedidoEmTransito(p.id, CTX));
    const [item] = await db.itemPedidoCompra.findMany({ where: { pedidoCompraId: p.id } });
    await runCtx(CTX, () =>
      compras.registarRecebimento(
        {
          pedidoCompraId: p.id,
          data: new Date(),
          numeroDocumento: `GR-566-${sufixo}`,
          itens: [{ itemPedidoCompraId: item.id, localizacaoDestinoId: loc, quantidadeRecebida: 4, quantidadeAceita: 4, quantidadeRejeitada: 0 }],
        },
        CTX,
      ),
    );

    const cp = await db.contaPagar.findFirst({ where: { tenantId: TENANT, pedidoCompraId: p.id } });
    expect(cp, 'conta a pagar da recepção total').toBeTruthy();
    expect(cp.lancamentoId, 'lancamentoId preenchido').toBeTruthy();
    const l = await db.lancamento.findFirst({ where: { id: cp.lancamentoId, tenantId: TENANT } });
    expect(l).toMatchObject({ origem: 'COMPRA', documentoOrigemTipo: 'ContaPagar', documentoOrigemId: cp.id });
  }, 90_000);

  it('(d) o motivo do cancelamento fica em motivoCancelamento', async () => {
    const conta = await criarConta1160();
    await runCtx(CTX, () => svc.cancelar(conta.id, 'Duplicada da FRN-1', CTX));
    const cp = await db.contaPagar.findFirst({ where: { id: conta.id, tenantId: TENANT } });
    expect(cp.motivoCancelamento).toBe('Duplicada da FRN-1');
  }, 60_000);
});
