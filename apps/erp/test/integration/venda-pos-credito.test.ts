/**
 * Oráculo S4 — venda POS a crédito emite Factura e debita 411 (ADR-0041 §1, §4, §7; issue #308)
 *
 * Contra Postgres real (Testcontainers), pelo caminho real `vendaService.criar`:
 *   - Qualquer pagamento CREDITO (só ou misto) exige cliente identificado: sem `clienteId`
 *     ou com o Consumidor Final → BusinessRuleError `CLIENTE_OBRIGATORIO_CREDITO`, nada
 *     escrito, nenhuma série avança.
 *   - Com cliente identificado, numa só transacção: Factura na série FATURA (não FR), ligada
 *     nos dois sentidos à venda, `lancamentoId` preenchido; partidas =
 *     `construirLancamentoVendaPOS(doc, pagamentos, {})` (CREDITO → D 411, outros meios → a
 *     sua conta, C 711, C 44331); venda FATURADA.
 *       · só crédito: Fatura EMITIDA, totalPago 0, nenhum MovimentoCaixa;
 *       · misto DINHEIRO 160 + CREDITO 1000: Fatura PARCIALMENTE_PAGA, totalPago 160,
 *         MovimentoCaixa só pelos 160;
 *       · dataVencimento = dataEmissao + cliente.diasPagamento dias;
 *       · nuitCliente = NUIT do cliente.
 *   - Regressão: venda paga continua a emitir Factura-Recibo PAGA.
 *   - Issue #317 — crédito só a cliente ATIVO, no servidor (o terminal já filtrava):
 *       · venda POS com parte CREDITO a cliente SUSPENSO/INATIVO → BusinessRuleError
 *         `CLIENTE_NAO_ATIVO` (mensagem pt-PT), nada escrito, nenhuma série avança;
 *       · a cliente apagado (deletedAt) → NotFoundError, nada escrito;
 *       · `emitirFatura` (factura FATURA não paga = a crédito) aplica a mesma regra;
 *       · controlo: venda a pronto (Factura-Recibo) a cliente SUSPENSO continua a passar.
 *
 * Substitui o oráculo provisório `venda-pos-credito-guarda.test.ts` (PAGAMENTO_CREDITO_NAO_SUPORTADO).
 * O limite de crédito do cliente não faz parte deste contrato (o cliente tem limite folgado).
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
const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_PAGAMENTO = 45; // ≠ omissão (30): prova que o prazo vem do cliente

describe.skipIf(skip)('Venda POS a crédito → Factura EMITIDA/PARCIALMENTE_PAGA + D 411 — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let vendaService: (typeof import('@/server/services/comercial'))['vendaService'];
  let CreateVendaSchema: (typeof import('@/lib/validations/vendas'))['CreateVendaSchema'];

  const sufixo = Date.now();
  const TENANT = `tenant-pos-cred-s4-${sufixo}`;
  // CreateVendaSchema exige cuid em vendedorId: forma `c` + alfanuméricos.
  const USER = `cposcreds4${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  const NUIT_CLIENTE = '400000318';

  let produtoId: string;
  let localizacaoId: string;
  let sessaoCaixaId: string;
  let sessaoPOSId: string;
  let clienteId: string;
  let consumidorFinalId: string;
  // #317: clientes que não podem receber crédito
  let clienteSuspensoId: string;
  let clienteInativoId: string;
  let clienteApagadoId: string;

  // 1 × 1000 @16% → subtotal 1000, IVA 160, total 1160
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

  async function vender(pagamentos: unknown[], extra: Record<string, unknown> = {}) {
    const row: any = await noCtx(() => vendaService.criar(inputVenda(pagamentos, extra), ctx));
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

  async function movimentosVendaCaixa() {
    return db.movimentoCaixa.findMany({ where: { tenantId: TENANT, sessaoCaixaId, tipo: 'VENDA' }, orderBy: { createdAt: 'asc' } });
  }

  async function contagens() {
    const s = await db.saldoStock.findFirst({ where: { tenantId: TENANT, produtoId, localizacaoId, varianteProdutoId: '' } });
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
      saldo: String(s.saldo),
      serieVenda: await proximoNumeroDaSerie('VENDA'),
      serieFR: await proximoNumeroDaSerie('FATURA_RECIBO'),
      serieFatura: await proximoNumeroDaSerie('FATURA'),
    };
  }

  /**
   * Factura (série FATURA) da venda a crédito: ligada nos dois sentidos, ao cliente
   * identificado, NUIT congelado, vencimento pelo prazo do cliente, lançamento LANCADO
   * igual ao da função pura.
   */
  async function esperarFacturaCreditoDe(venda: any, pagamentos: Array<{ tipo: string; valor: number }>) {
    expect(venda.faturaId, 'Venda.faturaId').toBeTruthy();
    const fatura = await db.fatura.findFirst({
      where: { id: venda.faturaId, tenantId: TENANT },
      include: { serieDocumento: true, linhas: true },
    });
    expect(fatura, 'Fatura da venda').not.toBeNull();
    expect(fatura.vendaId).toBe(venda.id);
    expect(fatura.serieDocumento.tipo).toBe('FATURA');
    expect(fatura.numero.startsWith('FR/')).toBe(false);
    expect(fatura.clienteId).toBe(clienteId);
    expect(fatura.nuitCliente).toBe(NUIT_CLIENTE);

    expect(dec(fatura.subtotal).equals(dec(venda.subtotal))).toBe(true);
    expect(dec(fatura.ivaTotal).equals(dec(venda.ivaTotal))).toBe(true);
    expect(dec(fatura.total).equals(dec(venda.total))).toBe(true);
    expect(fatura.linhas).toHaveLength(1);

    // Vencimento = emissão + prazo do cliente.
    expect(new Date(fatura.dataVencimento).getTime() - new Date(fatura.dataEmissao).getTime()).toBe(DIAS_PAGAMENTO * DIA_MS);

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
      {},
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
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');
    const { CLIENTE_CONSUMIDOR_FINAL } = await import('@/lib/consumidor-final');
    const caixa = await import('@/server/services/financas/caixa.service');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant POS crédito S4', slug: `pos-cred-s4-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `pos-cred-s4-${sufixo}@test.mz`, nome: 'Vendedor POS', keycloakSub: `kc-pos-cred-s4-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const cf = await db.cliente.findFirst({ where: { tenantId: TENANT, codigo: CLIENTE_CONSUMIDOR_FINAL.codigo } });
    expect(cf, 'Consumidor Final do bootstrap').not.toBeNull();
    consumidorFinalId = cf.id;

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const produto = await db.produto.create({
      data: {
        tenantId: TENANT,
        sku: `SKU-POS-CRED-S4-${sufixo}`,
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
      data: { tenantId: TENANT, codigo: `ARM-POS-CRED-S4-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
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
        nuit: NUIT_CLIENTE,
        email: `cliente-pos-cred-s4-${sufixo}@test.mz`,
        telefone: '840000318',
        codigo: `CLI-POS-CRED-S4-${sufixo}`,
        diasPagamento: DIAS_PAGAMENTO,
        limiteCreditoMT: 1_000_000,
      },
    });
    clienteId = cliente.id;

    // #317 — mesmo perfil do cliente a crédito, só muda o estado (ou o soft delete).
    const outroCliente = async (sufixoCodigo: string, nuit: string, extra: Record<string, unknown>) =>
      (
        await db.cliente.create({
          data: {
            tenantId: TENANT,
            nome: `Cliente ${sufixoCodigo}`,
            tipo: 'JURIDICA',
            nuit,
            email: `cliente-pos-cred-${sufixoCodigo.toLowerCase()}-${sufixo}@test.mz`,
            telefone: '840000317',
            codigo: `CLI-POS-CRED-${sufixoCodigo}-${sufixo}`,
            diasPagamento: DIAS_PAGAMENTO,
            limiteCreditoMT: 1_000_000,
            ...extra,
          },
        })
      ).id;
    clienteSuspensoId = await outroCliente('SUSP', '400000317', { status: 'SUSPENSO' });
    clienteInativoId = await outroCliente('INAT', '400000316', { status: 'INATIVO' });
    clienteApagadoId = await outroCliente('APAG', '400000315', { status: 'ATIVO', deletedAt: new Date() });

    const sessaoCaixa: any = await noCtx(() => caixa.abrirSessao({ fundoInicial: 1000 }, ctx));
    sessaoCaixaId = sessaoCaixa.id;
    const sessaoPOS = await db.sessaoPOS.create({
      data: { tenantId: TENANT, vendedorId: USER, sessaoCaixaId, status: 'ABERTA' },
    });
    sessaoPOSId = sessaoPOS.id;
  });

  // -------------------------------------------------------------------------
  // Cliente obrigatório
  // -------------------------------------------------------------------------

  it.each([
    ['só CREDITO, venda anónima', [{ tipo: 'CREDITO', valor: 1160 }], 'anonimo'],
    ['só CREDITO, ao Consumidor Final', [{ tipo: 'CREDITO', valor: 1160 }], 'cf'],
    ['misto DINHEIRO 160 + CREDITO 1000, venda anónima', [{ tipo: 'DINHEIRO', valor: 160 }, { tipo: 'CREDITO', valor: 1000 }], 'anonimo'],
    ['misto DINHEIRO 160 + CREDITO 1000, ao Consumidor Final', [{ tipo: 'DINHEIRO', valor: 160 }, { tipo: 'CREDITO', valor: 1000 }], 'cf'],
  ])('%s → CLIENTE_OBRIGATORIO_CREDITO e nada é escrito (nem número gasto)', async (_nome, pagamentos, quem) => {
    const antes = await contagens();
    const extra = quem === 'cf' ? { clienteId: consumidorFinalId } : {};

    const erro = await capturarErro(() => noCtx(() => vendaService.criar(inputVenda(pagamentos, extra), ctx)));

    expect(erro, 'a venda a crédito sem cliente identificado tinha de ser recusada').toBeDefined();
    expect(erro.name).toBe('BusinessRuleError');
    expect(erro.code).toBe('CLIENTE_OBRIGATORIO_CREDITO');
    expect(await contagens()).toEqual(antes);
  });

  // -------------------------------------------------------------------------
  // Venda a crédito com cliente identificado
  // -------------------------------------------------------------------------

  it('só CREDITO: Factura (série FATURA) EMITIDA, totalPago 0, D 411 = total, venda FATURADA, sem caixa; série FR intacta', async () => {
    const antes = await contagens();
    const pagamentos = [{ tipo: 'CREDITO', valor: 1160 }];

    const venda = await vender(pagamentos, { clienteId });

    expect(venda.status).toBe('FATURADA');
    expect(venda.clienteId).toBe(clienteId);
    const { fatura, partidas } = await esperarFacturaCreditoDe(venda, pagamentos);
    expect(fatura.status).toBe('EMITIDA');
    expect(dec(fatura.totalPago).equals(ZERO)).toBe(true);
    expect(somar(partidas, 'DEBITO', '411').equals(dec('1160'))).toBe(true);
    expect(somar(partidas, 'DEBITO', '111').equals(ZERO)).toBe(true);
    expect(somar(partidas, 'CREDITO', '711').equals(dec('1000'))).toBe(true);
    expect(somar(partidas, 'CREDITO', '44331').equals(dec('160'))).toBe(true);

    const depois = await contagens();
    expect(depois.movimentosCaixa).toBe(antes.movimentosCaixa);
    expect(depois.serieFatura).toBe(antes.serieFatura + 1);
    expect(depois.serieFR).toBe(antes.serieFR);
    expect(depois.serieVenda).toBe(antes.serieVenda + 1);
    expect(depois.faturas).toBe(antes.faturas + 1);
    expect(depois.lancamentos).toBe(antes.lancamentos + 1);
    expect(dec(depois.saldo).equals(dec(antes.saldo).minus(1))).toBe(true);
  });

  it('misto DINHEIRO 160 + CREDITO 1000: Factura PARCIALMENTE_PAGA, totalPago 160, D 111 = 160, D 411 = 1000, MovimentoCaixa só de 160', async () => {
    const antes = await contagens();
    const caixaAntes = (await movimentosVendaCaixa()).length;
    const pagamentos = [
      { tipo: 'DINHEIRO', valor: 160 },
      { tipo: 'CREDITO', valor: 1000 },
    ];

    const venda = await vender(pagamentos, { clienteId });

    expect(venda.status).toBe('FATURADA');
    const { fatura, partidas } = await esperarFacturaCreditoDe(venda, pagamentos);
    expect(fatura.status).toBe('PARCIALMENTE_PAGA');
    expect(dec(fatura.totalPago).equals(dec('160'))).toBe(true);
    expect(somar(partidas, 'DEBITO', '111').equals(dec('160'))).toBe(true);
    expect(somar(partidas, 'DEBITO', '411').equals(dec('1000'))).toBe(true);

    const mov = await movimentosVendaCaixa();
    expect(mov.length).toBe(caixaAntes + 1);
    expect(dec(mov[mov.length - 1].valor).equals(dec('160'))).toBe(true);

    const depois = await contagens();
    expect(depois.serieFatura).toBe(antes.serieFatura + 1);
    expect(depois.serieFR).toBe(antes.serieFR);
  });

  // -------------------------------------------------------------------------
  // Regressão: venda paga continua Factura-Recibo
  // -------------------------------------------------------------------------

  it('regressão: venda paga (sem CREDITO) a cliente identificado continua a emitir Factura-Recibo PAGA e a venda fica CONCLUIDA', async () => {
    const antes = await contagens();

    const venda = await vender([{ tipo: 'CARTAO', valor: 1160 }], { clienteId });

    expect(venda.status).toBe('CONCLUIDA');
    const fatura = await db.fatura.findFirst({
      where: { id: venda.faturaId, tenantId: TENANT },
      include: { serieDocumento: true },
    });
    expect(fatura.serieDocumento.tipo).toBe('FATURA_RECIBO');
    expect(fatura.status).toBe('PAGA');
    expect(dec(fatura.totalPago).equals(dec(fatura.total))).toBe(true);
    expect(fatura.lancamentoId).toBeTruthy();

    const depois = await contagens();
    expect(depois.serieFR).toBe(antes.serieFR + 1);
    expect(depois.serieFatura).toBe(antes.serieFatura);
  });

  // -------------------------------------------------------------------------
  // Issue #317 — crédito só a cliente ATIVO (o servidor decide, não o terminal)
  // -------------------------------------------------------------------------

  const SO_CREDITO = [{ tipo: 'CREDITO', valor: 1160 }];
  const MISTO = [{ tipo: 'DINHEIRO', valor: 160 }, { tipo: 'CREDITO', valor: 1000 }];

  function esperarClienteNaoAtivo(erro: any) {
    expect(erro, 'o crédito a cliente não ATIVO tinha de ser recusado').toBeDefined();
    expect(erro.name).toBe('BusinessRuleError');
    expect(erro.code).toBe('CLIENTE_NAO_ATIVO');
    expect(typeof erro.message).toBe('string');
    expect(erro.message.length, 'mensagem pt-PT para o utilizador').toBeGreaterThan(10);
    expect(erro.message).not.toBe(erro.code);
  }

  it.each([
    ['só CREDITO, cliente SUSPENSO', SO_CREDITO, 'suspenso'],
    ['só CREDITO, cliente INATIVO', SO_CREDITO, 'inativo'],
    ['misto DINHEIRO 160 + CREDITO 1000, cliente SUSPENSO', MISTO, 'suspenso'],
    ['misto DINHEIRO 160 + CREDITO 1000, cliente INATIVO', MISTO, 'inativo'],
  ])('#317 venda POS %s → CLIENTE_NAO_ATIVO e nada é escrito (nem número gasto)', async (_nome, pagamentos, quem) => {
    const antes = await contagens();
    const id = quem === 'suspenso' ? clienteSuspensoId : clienteInativoId;

    const erro = await capturarErro(() => noCtx(() => vendaService.criar(inputVenda(pagamentos, { clienteId: id }), ctx)));

    esperarClienteNaoAtivo(erro);
    expect(await contagens()).toEqual(antes);
  });

  it('#317 venda POS só CREDITO a cliente apagado (deletedAt) → NotFoundError e nada é escrito', async () => {
    const antes = await contagens();

    const erro = await capturarErro(() =>
      noCtx(() => vendaService.criar(inputVenda(SO_CREDITO, { clienteId: clienteApagadoId }), ctx)),
    );

    expect(erro, 'o crédito a cliente apagado tinha de ser recusado').toBeDefined();
    expect(erro.name).toBe('NotFoundError');
    expect(erro.code).toBe('NAO_ENCONTRADO');
    expect(await contagens()).toEqual(antes);
  });

  describe('#317 emitirFatura (factura a crédito, série FATURA não paga) aplica a mesma regra', () => {
    let fat: typeof import('@/server/services/financas/faturacao.service');
    let EmitirFaturaSchema: (typeof import('@/lib/validations/faturacao'))['EmitirFaturaSchema'];

    beforeAll(async () => {
      fat = await import('@/server/services/financas/faturacao.service');
      ({ EmitirFaturaSchema } = await import('@/lib/validations/faturacao'));
    });

    const inputFatura = (cid: string) =>
      EmitirFaturaSchema.parse({
        clienteId: cid,
        dataEmissao: new Date(),
        dataVencimento: new Date(Date.now() + 30 * DIA_MS),
        linhas: [{ descricao: 'Serviço', quantidade: 1, precoUnitario: 1000, taxaIva: 0.16 }],
      });

    it.each([
      ['SUSPENSO', 'suspenso'],
      ['INATIVO', 'inativo'],
    ])('cliente %s → CLIENTE_NAO_ATIVO e nada é escrito (nem número gasto)', async (_nome, quem) => {
      const antes = await contagens();
      const id = quem === 'suspenso' ? clienteSuspensoId : clienteInativoId;

      const erro = await capturarErro(() => noCtx(() => (fat as any).emitirFatura(inputFatura(id), ctx)));

      esperarClienteNaoAtivo(erro);
      expect(await contagens()).toEqual(antes);
    });

    it('cliente apagado (deletedAt) → NotFoundError e nada é escrito', async () => {
      const antes = await contagens();

      const erro = await capturarErro(() => noCtx(() => (fat as any).emitirFatura(inputFatura(clienteApagadoId), ctx)));

      expect(erro, 'a factura a crédito a cliente apagado tinha de ser recusada').toBeDefined();
      expect(erro.name).toBe('NotFoundError');
      expect(erro.code).toBe('NAO_ENCONTRADO');
      expect(await contagens()).toEqual(antes);
    });

    it('controlo: cliente ATIVO continua a receber factura a crédito EMITIDA', async () => {
      const antes = await contagens();

      const f: any = await noCtx(() => fat.emitirFatura(inputFatura(clienteId), ctx));

      expect(f.status).toBe('EMITIDA');
      expect(f.lancamentoId).toBeTruthy();
      const depois = await contagens();
      expect(depois.faturas).toBe(antes.faturas + 1);
      expect(depois.serieFatura).toBe(antes.serieFatura + 1);
    });
  });

  it.each([
    ['DINHEIRO', 'suspenso'],
    ['CARTAO', 'suspenso'],
    ['DINHEIRO', 'inativo'],
  ])('#317 controlo: venda a pronto (%s) a cliente %s continua a emitir Factura-Recibo PAGA', async (meio, quem) => {
    const antes = await contagens();
    const id = quem === 'suspenso' ? clienteSuspensoId : clienteInativoId;

    const venda = await vender([{ tipo: meio, valor: 1160 }], { clienteId: id });

    expect(venda.status).toBe('CONCLUIDA');
    expect(venda.clienteId).toBe(id);
    const fatura = await db.fatura.findFirst({
      where: { id: venda.faturaId, tenantId: TENANT },
      include: { serieDocumento: true },
    });
    expect(fatura.serieDocumento.tipo).toBe('FATURA_RECIBO');
    expect(fatura.status).toBe('PAGA');
    expect(fatura.clienteId).toBe(id);
    expect(fatura.lancamentoId).toBeTruthy();

    const depois = await contagens();
    expect(depois.serieFR).toBe(antes.serieFR + 1);
    expect(depois.serieFatura).toBe(antes.serieFatura);
  });

  it('nenhuma venda POS do tenant fica sem documento, e nenhuma factura fica sem lançamento', async () => {
    expect(await db.venda.count({ where: { tenantId: TENANT, origem: 'POS', faturaId: null } })).toBe(0);
    expect(await db.fatura.count({ where: { tenantId: TENANT, lancamentoId: null } })).toBe(0);
  });
});
