/**
 * Oráculo do nó C:clientes-historico-comissoes-134-135 — issue #134.
 *
 * Escrito pelo verificador ANTES da implementação; quem implementa não o altera.
 *
 * Problema: `HistoricoTransacao` só é escrito pelo seed (`prisma/seed/demo-vendas.ts`), por isso
 * a ficha do cliente (`clienteService.obterHistorico`) fica vazia para tudo o que acontece pela
 * aplicação. Contrato: os pontos de negócio passam a escrever o histórico, pelo serviço, na MESMA
 * transacção da operação que o origina. Modelo seguido: o do seed (uma entrada por documento
 * emitido, `referencia` = número do documento) e o comentário do schema («append-only; nunca se
 * apaga nem se altera»).
 *
 *   H1 Factura emitida (`emitirFatura`): exactamente UMA entrada `VENDA` do cliente da factura,
 *      `referencia` = número da factura, `descricao` contém o número, `valor` = total,
 *      `dataTransacao` = dataEmissao, `status` = PENDENTE (a factura nasce por pagar),
 *      `userId` = ctx.userId, `currency` = MZN, no tenant do contexto. A ficha
 *      (`clienteService.obterHistorico`) devolve-a.
 *   H2 Pagamento de factura (`registarPagamento`): UMA entrada `PAGAMENTO` por pagamento,
 *      `referencia` = número da factura, `valor` = valor pago, `dataTransacao` = dataPagamento,
 *      `status` = CONCLUIDO, `userId` = ctx.userId. A entrada `VENDA` da factura não é alterada
 *      nem duplicada (append-only).
 *   H3 Pagamento recusado (PAGAMENTO_EXCEDE_SALDO) não escreve histórico.
 *   H4 Venda POS paga a um cliente identificado: exactamente UMA entrada `VENDA` (não uma pela
 *      venda e outra pelo documento), `referencia` = número da Factura-Recibo, `valor` = total,
 *      `status` = CONCLUIDO (o documento nasce PAGO).
 *   H5 Venda POS recusada (PAGAMENTOS_NAO_BATEM_TOTAL) não escreve histórico.
 *   H6 Atomicidade: falha injectada no lançamento (conta 711 inactiva) depois da emissão ⇒ a venda
 *      reverte e o histórico também (mesma tx, não «depois do commit»).
 *   H7 Isolamento: as entradas ficam no tenant do contexto; o outro tenant não as vê.
 *
 * Decisões conservadoras assumidas como contrato: o histórico do Consumidor Final não é afirmado
 * (nem a favor nem contra); notas de crédito, devoluções e anulações ficam fora deste nó.
 *
 * O tenant é montado pelos serviços reais (`bootstrapContabilidade`, `caixa.abrirSessao`);
 * catálogo/stock/sessão POS são dados de partida. A sessão (auth) é o único duplo.
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

describe.skipIf(skip)('#134 — histórico de transacções do cliente escrito pelos serviços — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let fat: any; // faturacao.service — acesso dinâmico
  let vendaService: any;
  let clienteService: any;
  let val: typeof import('@/lib/validations/faturacao');
  let CreateVendaSchema: (typeof import('@/lib/validations/vendas'))['CreateVendaSchema'];

  const sufixo = Date.now();
  const TENANT = `tenant-hist-134-${sufixo}`;
  const TENANT_B = `tenant-hist-134-b-${sufixo}`;
  // CreateVendaSchema exige cuid em vendedorId: forma `c` + alfanuméricos.
  const USER = `chist134${sufixo}`;
  const USER_B = `chist134b${sufixo}`;
  const TODAS = ['faturacao:fatura:pagar', 'caixa:operar', 'financas:banca:escrita'];
  const ctx = { tenantId: TENANT, userId: USER, permissions: new Set(TODAS) };
  const ctxB = { tenantId: TENANT_B, userId: USER_B, permissions: new Set(TODAS) };

  let clienteId: string; // cliente de facturas
  let clientePosId: string; // cliente identificado nas vendas POS
  let contaCorrenteId: string;
  let produtoId: string;
  let localizacaoId: string;
  let sessaoCaixaId: string;
  let sessaoPOSId: string;

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  const historicoDe = (cid: string, extra: Record<string, unknown> = {}) =>
    db.historicoTransacao.findMany({ where: { clienteId: cid, ...extra }, orderBy: { createdAt: 'asc' } });

  const contarHistorico = () => db.historicoTransacao.count({ where: { tenantId: TENANT } });

  async function emitirFatura(): Promise<any> {
    const dataEmissao = new Date();
    const input = val.EmitirFaturaSchema.parse({
      clienteId,
      dataEmissao,
      dataVencimento: new Date(dataEmissao.getTime() + 30 * 86_400_000),
      linhas: [{ descricao: 'Mercadoria', quantidade: 10, precoUnitario: 100, taxaIva: 0.16 }],
    });
    const f: any = await runCtx(ctx, () => fat.emitirFatura(input, ctx));
    return db.fatura.findFirst({ where: { id: f.id, tenantId: TENANT } });
  }

  const pagarPorBanco = (faturaId: string, valor: number, dataPagamento: Date = new Date()) =>
    runCtx(ctx, () =>
      fat.registarPagamento(
        { faturaId, valor, dataPagamento, formaPagamento: 'TRANSFERENCIA_BANCARIA', contaBancariaId: contaCorrenteId },
        ctx,
      ),
    );

  // 1 × 1000 @16% → 1160
  const itensMil = () => [
    { produtoId, nomeProduto: 'Artigo 1000', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 },
  ];

  function inputVenda(pagamentos: unknown[], extra: Record<string, unknown> = {}) {
    return CreateVendaSchema.parse({
      origem: 'POS',
      vendedorId: USER,
      sessaoPOSId,
      sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      itens: itensMil(),
      pagamentos,
      ...extra,
    });
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    fat = await import('@/server/services/financas/faturacao.service');
    ({ vendaService, clienteService } = (await import('@/server/services/comercial')) as any);
    val = await import('@/lib/validations/faturacao');
    ({ CreateVendaSchema } = await import('@/lib/validations/vendas'));
    const caixa = await import('@/server/services/financas/caixa.service');
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    for (const [id, slug, nuit, uid] of [
      [TENANT, `hist-134-${sufixo}`, `${sufixo}`.slice(-9), USER],
      [TENANT_B, `hist-134-b-${sufixo}`, `${sufixo + 1}`.slice(-9), USER_B],
    ]) {
      await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit } });
      await db.user.create({
        data: { id: uid, tenantId: id, email: `${uid}@hist134.mz`, nome: 'Operador', keycloakSub: `kc-${uid}` },
      });
      await db.$transaction((tx: any) => bootstrapContabilidade(tx, id), { timeout: 60_000 });
    }

    const c1 = await db.cliente.create({
      data: {
        tenantId: TENANT, nome: 'Cliente Facturas 134', tipo: 'JURIDICA', nuit: '400000134',
        email: `cli-fat-134-${sufixo}@test.mz`, telefone: '840000134', codigo: `CLI-H134-F-${sufixo}`,
      },
    });
    clienteId = c1.id;
    const c2 = await db.cliente.create({
      data: {
        tenantId: TENANT, nome: 'Cliente POS 134', tipo: 'JURIDICA', nuit: '400001134',
        email: `cli-pos-134-${sufixo}@test.mz`, telefone: '840001134', codigo: `CLI-H134-P-${sufixo}`,
      },
    });
    clientePosId = c2.id;

    const pgc123 = await db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo: '123' } });
    expect(pgc123, 'ContaPGC 123 no bootstrap').not.toBeNull();
    const corrente = await db.contaBancaria.create({
      data: {
        tenantId: TENANT, banco: 'Banco Oráculo', agencia: '0001', numeroConta: `CORR-134-${sufixo}`,
        tipoConta: 'CORRENTE', contaContabilId: pgc123.id, ativo: true,
      },
    });
    contaCorrenteId = corrente.id;

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const produto = await db.produto.create({
      data: {
        tenantId: TENANT, sku: `SKU-H134-${sufixo}`, nome: 'Artigo 134', categoriaId: categoria.id,
        unidadeMedida: 'UN', precoVenda: 1000, precoCompra: 700, margemLucro: 0.3, taxaIva: 0.16,
      },
    });
    produtoId = produto.id;
    const loc = await db.localizacao.create({
      data: { tenantId: TENANT, codigo: `ARM-H134-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    await db.saldoStock.create({
      data: { tenantId: TENANT, produtoId, varianteProdutoId: '', localizacaoId, saldo: 10_000, saldoReservado: 0 },
    });

    const sc: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial: 1000 }, ctx));
    sessaoCaixaId = sc.id;
    const sp = await db.sessaoPOS.create({
      data: { tenantId: TENANT, vendedorId: USER, sessaoCaixaId, status: 'ABERTA' },
    });
    sessaoPOSId = sp.id;
  });

  // ── H1 ────────────────────────────────────────────────────────────────────

  it('H1: emitir uma factura escreve UMA entrada VENDA PENDENTE com número, total, data e utilizador, e a ficha mostra-a', async () => {
    const f = await emitirFatura();
    const hs = await historicoDe(clienteId, { referencia: f.numero });
    expect(hs, `histórico da factura ${f.numero}`).toHaveLength(1);
    const h = hs[0];
    expect(h.tenantId).toBe(TENANT);
    expect(h.tipo).toBe('VENDA');
    expect(h.descricao).toContain(f.numero);
    expect(dec(h.valor).equals(dec(f.total)), `valor ${h.valor} ≠ total ${f.total}`).toBe(true);
    expect(dec(h.valor).equals(dec('1160'))).toBe(true);
    expect((h.dataTransacao as Date).getTime()).toBe((f.dataEmissao as Date).getTime());
    expect(h.status).toBe('PENDENTE');
    expect(h.userId).toBe(USER);
    expect(h.currency).toBe('MZN');

    const ficha: any = await runCtx(ctx, () => clienteService.obterHistorico(clienteId, { take: 100 }, ctx));
    expect(ficha.items.map((i: any) => i.id)).toContain(h.id);
  });

  // ── H2 / H3 ───────────────────────────────────────────────────────────────

  it('H2: cada pagamento escreve UMA entrada PAGAMENTO CONCLUIDO; a entrada VENDA fica igual e única', async () => {
    const f = await emitirFatura();
    const [venda] = await historicoDe(clienteId, { referencia: f.numero, tipo: 'VENDA' });
    expect(venda, 'entrada VENDA da factura (H1)').toBeTruthy();

    const d1 = new Date();
    await pagarPorBanco(f.id, 300, d1);
    const d2 = new Date(d1.getTime() + 1000);
    await pagarPorBanco(f.id, 860, d2);

    const pags = await historicoDe(clienteId, { referencia: f.numero, tipo: 'PAGAMENTO' });
    expect(pags, 'uma entrada PAGAMENTO por pagamento').toHaveLength(2);
    const porValor = [...pags].sort((a: any, b: any) => Number(a.valor) - Number(b.valor));
    expect(dec(porValor[0].valor).equals(dec('300'))).toBe(true);
    expect((porValor[0].dataTransacao as Date).getTime()).toBe(d1.getTime());
    expect(dec(porValor[1].valor).equals(dec('860'))).toBe(true);
    expect((porValor[1].dataTransacao as Date).getTime()).toBe(d2.getTime());
    for (const p of pags) {
      expect(p.tenantId).toBe(TENANT);
      expect(p.status).toBe('CONCLUIDO');
      expect(p.userId).toBe(USER);
    }

    const vendas = await historicoDe(clienteId, { referencia: f.numero, tipo: 'VENDA' });
    expect(vendas).toHaveLength(1);
    expect(vendas[0]).toEqual(venda); // append-only: a entrada da factura não se altera
  });

  it('H3: pagamento acima do pendente é recusado e não escreve histórico', async () => {
    const f = await emitirFatura();
    const antes = await contarHistorico();
    const e = await capturarErro(() => pagarPorBanco(f.id, 99_999));
    expect(e, 'o pagamento tinha de ser recusado').toBeDefined();
    expect(e.code).toBe('PAGAMENTO_EXCEDE_SALDO');
    expect(await contarHistorico()).toBe(antes);
    expect(await historicoDe(clienteId, { referencia: f.numero, tipo: 'PAGAMENTO' })).toHaveLength(0);
  });

  // ── H4 / H5 / H6 ──────────────────────────────────────────────────────────

  it('H4: venda POS paga a cliente identificado escreve UMA entrada VENDA CONCLUIDO pela Factura-Recibo', async () => {
    const antes = await historicoDe(clientePosId);
    const row: any = await runCtx(ctx, () =>
      vendaService.criar(inputVenda([{ tipo: 'TRANSFERENCIA', valor: 1160 }], { clienteId: clientePosId }), ctx),
    );
    const venda = await db.venda.findFirst({ where: { id: row.id, tenantId: TENANT } });
    expect(venda.faturaId, 'venda POS com documento').toBeTruthy();
    const fr = await db.fatura.findFirst({ where: { id: venda.faturaId, tenantId: TENANT } });

    const depois = await historicoDe(clientePosId);
    const novas = depois.filter((h: any) => !antes.some((a: any) => a.id === h.id));
    expect(novas, 'uma só entrada por venda POS').toHaveLength(1);
    const h = novas[0];
    expect(h.tenantId).toBe(TENANT);
    expect(h.tipo).toBe('VENDA');
    expect(h.referencia).toBe(fr.numero);
    expect(dec(h.valor).equals(dec('1160'))).toBe(true);
    expect(h.status).toBe('CONCLUIDO');
    expect(h.userId).toBe(USER);
  });

  it('H5: venda POS recusada (Σ pagamentos ≠ total) não escreve histórico', async () => {
    const antes = await contarHistorico();
    const e = await capturarErro(() =>
      runCtx(ctx, () =>
        vendaService.criar(inputVenda([{ tipo: 'DINHEIRO', valor: 1159.99 }], { clienteId: clientePosId }), ctx),
      ),
    );
    expect(e, 'a venda tinha de ser recusada').toBeDefined();
    expect(e.code).toBe('PAGAMENTOS_NAO_BATEM_TOTAL');
    expect(await contarHistorico()).toBe(antes);
  });

  it('H6: falha no lançamento (711 inactiva) reverte a venda E o histórico — escrito na mesma transacção', async () => {
    // Pré-condição: o caminho feliz escreve histórico (H4) — a falha não é vácuo.
    expect(await db.historicoTransacao.count({ where: { tenantId: TENANT, clienteId: clientePosId } })).toBeGreaterThan(0);

    const antes = await contarHistorico();
    const vendasAntes = await db.venda.count({ where: { tenantId: TENANT } });
    const conta711 = await db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo: '711' } });
    await db.contaPGC.update({ where: { id: conta711.id }, data: { ativo: false } });
    let e: any;
    try {
      e = await capturarErro(() =>
        runCtx(ctx, () =>
          vendaService.criar(inputVenda([{ tipo: 'DINHEIRO', valor: 1160 }], { clienteId: clientePosId }), ctx),
        ),
      );
    } finally {
      await db.contaPGC.update({ where: { id: conta711.id }, data: { ativo: true } });
    }
    expect(e, 'a venda tinha de falhar com a 711 inactiva').toBeDefined();
    expect(await db.venda.count({ where: { tenantId: TENANT } })).toBe(vendasAntes);
    expect(await contarHistorico()).toBe(antes);
  });

  // ── H7 ────────────────────────────────────────────────────────────────────

  it('H7: o histórico escrito fica no tenant do contexto; o outro tenant não tem nada nem vê a ficha', async () => {
    expect(await db.historicoTransacao.count({ where: { tenantId: TENANT } }), 'H1–H4 escreveram').toBeGreaterThan(0);
    expect(await db.historicoTransacao.count({ where: { tenantId: TENANT_B } })).toBe(0);
    // Nenhuma entrada aponta para cliente de outro tenant.
    const cruzadas = await db.historicoTransacao.count({
      where: { tenantId: TENANT, cliente: { tenantId: { not: TENANT } } },
    });
    expect(cruzadas).toBe(0);
    const e = await capturarErro(() => runCtx(ctxB, () => clienteService.obterHistorico(clienteId, {}, ctxB)));
    expect(e?.name ?? e?.constructor?.name).toMatch(/NotFound/);
  });
});
