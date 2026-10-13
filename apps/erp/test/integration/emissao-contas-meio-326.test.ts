/**
 * Oráculo #326 — o núcleo de emissão resolve as contas por meio (refactor, ADR-0041 §1, §3, §4)
 *
 * Contrato (decidido pelo orquestrador; ver issue #326):
 *   `emitirDocumentoEmTx(tx, input, ctx, opcoes)` recebe os PAGAMENTOS do documento
 *   (`opcoes.pagamentos: Array<{ tipo: MetodoPagamentoTipo; valor: Decimal }>`) e, sem
 *   `construirLancamento` nem `status` do chamador:
 *     (E) deriva o estado dos pagamentos — FATURA_RECIBO nasce PAGA; FATURA com parte
 *         a CREDITO nasce PARCIALMENTE_PAGA (totalPago = Σ não-CREDITO) ou EMITIDA (tudo a CREDITO);
 *     (C) lança D conta do meio por pagamento / C 711 / C 44331, com a conta do meio
 *         resolvida pelo resolver ÚNICO (a configuração `ContaMeioPagamentoPOS` do tenant,
 *         a mesma conta contabilística que o recebimento de factura debita para a mesma
 *         ContaBancaria);
 *     (T) recusa Σ pagamentos ≠ total com PAGAMENTOS_NAO_BATEM_TOTAL, sem deixar nada.
 *   (U) Mesma conta para o pagamento de factura e a venda POS com o mesmo meio configurado.
 *
 * Não-regressão (oráculo existente, intocado): venda-pos-documento, venda-pos-credito,
 * pos-contabilidade-ponta-a-ponta, conta-meio-pagamento-pos, emitir-documento-em-tx.
 *
 * `fat` é acedido dinamicamente (`any`): `opcoes.pagamentos` ainda não existe no tipo e o
 * ficheiro tem de compilar e falhar pelo CASO, não pelo import.
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

describe.skipIf(skip)('#326 — núcleo de emissão resolve as contas por meio — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let fat: any; // '@/server/services/financas/faturacao.service' — contrato novo por acesso dinâmico
  let mp: any; // '@/server/services/financas/meio-pagamento.service'
  let val: typeof import('@/lib/validations/faturacao');
  let vendaService: (typeof import('@/server/services/comercial'))['vendaService'];
  let CreateVendaSchema: (typeof import('@/lib/validations/vendas'))['CreateVendaSchema'];

  const sufixo = Date.now();
  const TENANT = `tenant-emis-meio-326-${sufixo}`;
  // CreateVendaSchema exige cuid em vendedorId: forma `c` + alfanuméricos.
  const USER = `cemismeio326${sufixo}`;
  const PERMS = new Set(['faturacao:fatura:pagar', 'caixa:operar', 'financas:banca:escrita']);
  const ctx = { tenantId: TENANT, userId: USER };
  const ctxPag = { ...ctx, permissions: PERMS };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  let clienteId: string;
  let produtoId: string;
  let localizacaoId: string;
  let sessaoCaixaId: string;
  let sessaoPOSId: string;
  let carteira: { id: string }; // CARTEIRA_MOVEL → PGC 122 (≠ omissão 121)

  type Partida = { codigo: string; tipo: string; valor: Prisma.Decimal };

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
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

  /** 1 × 1000 a 16% → subtotal 1000, IVA 160, total 1160. */
  function inputDocumento() {
    const hoje = new Date();
    return val.EmitirFaturaSchema.parse({
      clienteId,
      dataEmissao: hoje,
      dataVencimento: new Date(hoje.getTime() + 30 * 86_400_000),
      linhas: [{ descricao: 'Artigo 1000', quantidade: 1, precoUnitario: 1000, taxaIva: 0.16 }],
    });
  }

  const pag = (tipo: string, valor: string) => ({ tipo, valor: dec(valor) });

  /** Emite pelo núcleo com os pagamentos, SEM construirLancamento nem status do chamador. */
  function emitirComPagamentos(tipoSerie: 'FATURA' | 'FATURA_RECIBO', pagamentos: Array<{ tipo: string; valor: Prisma.Decimal }>) {
    return noCtx(() =>
      db.$transaction((tx: Prisma.TransactionClient) =>
        fat.emitirDocumentoEmTx(tx, inputDocumento(), ctx, { tipoSerie, pagamentos }),
      ),
    ) as Promise<any>;
  }

  async function lerDocumento(id: string) {
    const f = await db.fatura.findFirst({ where: { id, tenantId: TENANT } });
    expect(f, 'Fatura gravada').not.toBeNull();
    expect(f.lancamentoId, 'Fatura.lancamentoId').toBeTruthy();
    return { fatura: f, partidas: await partidasDe(f.lancamentoId) };
  }

  /** C 711 = subtotal, C 44331 = IVA, Σ D = Σ C = total. */
  function esperarCreditosEEquilibrio(fatura: any, partidas: Partida[]) {
    expect(somar(partidas, 'CREDITO', '711').equals(dec(fatura.subtotal))).toBe(true);
    expect(somar(partidas, 'CREDITO', '44331').equals(dec(fatura.ivaTotal))).toBe(true);
    expect(somar(partidas, 'DEBITO').equals(dec(fatura.total))).toBe(true);
    expect(somar(partidas, 'DEBITO').equals(somar(partidas, 'CREDITO'))).toBe(true);
  }

  async function contagens() {
    return {
      faturas: await db.fatura.count({ where: { tenantId: TENANT } }),
      linhas: await db.linhaFatura.count({ where: { tenantId: TENANT } }),
      lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
      partidas: await db.partidaLancamento.count({ where: { tenantId: TENANT } }),
      series: (await db.serieDocumento.findMany({ where: { tenantId: TENANT }, orderBy: { id: 'asc' } })).map(
        (s: any) => `${s.id}:${s.proximoNumero}`,
      ),
    };
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    fat = await import('@/server/services/financas/faturacao.service');
    mp = await import('@/server/services/financas/meio-pagamento.service');
    val = await import('@/lib/validations/faturacao');
    ({ vendaService } = await import('@/server/services/comercial'));
    ({ CreateVendaSchema } = await import('@/lib/validations/vendas'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');
    const caixa = await import('@/server/services/financas/caixa.service');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant #326', slug: `emis-meio-326-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `emis-meio-326-${sufixo}@test.mz`, nome: 'Vendedor 326', keycloakSub: `kc-emis-meio-326-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const cliente = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente 326',
        tipo: 'JURIDICA',
        nuit: '400000326',
        email: `cliente-326-${sufixo}@test.mz`,
        telefone: '840000326',
        codigo: `CLI-326-${sufixo}`,
      },
    });
    clienteId = cliente.id;

    const pgc122 = await db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo: '122' } });
    expect(pgc122, 'ContaPGC 122').not.toBeNull();
    carteira = await db.contaBancaria.create({
      data: {
        tenantId: TENANT,
        banco: 'Carteira M-Pesa',
        agencia: '0001',
        numeroConta: `MPESA-326-${sufixo}`,
        tipoConta: 'CARTEIRA_MOVEL',
        contaContabilId: pgc122.id,
        ativo: true,
      },
    });
    await noCtx(() => mp.definirContaMeioPagamentoPOS({ metodo: 'MPESA', contaBancariaId: carteira.id }, ctx));

    // Catálogo, stock, caixa e sessão POS (como no oráculo de conta-meio-pagamento-pos).
    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const produto = await db.produto.create({
      data: {
        tenantId: TENANT,
        sku: `SKU-326-${sufixo}`,
        nome: 'Artigo 1000',
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
      data: { tenantId: TENANT, codigo: `ARM-326-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    await db.saldoStock.create({
      data: { tenantId: TENANT, produtoId, varianteProdutoId: '', localizacaoId, saldo: 10_000, saldoReservado: 0 },
    });
    // Sessão de caixa aberta: o POS tem sempre uma; o núcleo pode resolver DINHEIRO por ela.
    const sessaoCaixa: any = await noCtx(() => caixa.abrirSessao({ fundoInicial: 1000 }, ctx));
    sessaoCaixaId = sessaoCaixa.id;
    const sessaoPOS = await db.sessaoPOS.create({
      data: { tenantId: TENANT, vendedorId: USER, sessaoCaixaId, status: 'ABERTA' },
    });
    sessaoPOSId = sessaoPOS.id;
  });

  // -------------------------------------------------------------------------
  // (U) resolver único: mesma conta no recebimento de factura e na venda POS
  // -------------------------------------------------------------------------

  it('M-Pesa → mesma conta (122) no recebimento de factura pela carteira configurada, na venda POS e na emissão pelo núcleo', async () => {
    // 1) Recebimento de factura: forma M-PESA pela ContaBancaria configurada para MPESA.
    const f: any = await noCtx(() => fat.emitirFatura(inputDocumento(), ctx));
    await runCtx(ctxPag, () =>
      fat.registarPagamento(
        { faturaId: f.id, valor: 1160, dataPagamento: new Date(), formaPagamento: 'M-PESA', contaBancariaId: carteira.id },
        ctxPag,
      ),
    );
    const lancPag = await db.lancamento.findFirst({
      where: { tenantId: TENANT, documentoOrigemId: f.id, origem: 'PAGAMENTO' },
    });
    expect(lancPag, 'lançamento do recebimento').not.toBeNull();
    const debitosPagamento = (await partidasDe(lancPag.id)).filter((p) => p.tipo === 'DEBITO');
    expect(debitosPagamento).toHaveLength(1);
    const contaDoRecebimento = debitosPagamento[0].codigo;

    // 2) Venda POS pelo caminho real com o mesmo meio.
    const venda: any = await noCtx(() =>
      vendaService.criar(
        CreateVendaSchema.parse({
          origem: 'POS',
          vendedorId: USER,
          sessaoPOSId,
          sessaoCaixaId,
          localizacaoOrigemId: localizacaoId,
          itens: [{ produtoId, nomeProduto: 'Artigo 1000', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 }],
          pagamentos: [{ tipo: 'MPESA', valor: 1160, referencia: 'MP-326' }],
        }),
        ctx,
      ),
    );
    const v = await db.venda.findFirst({ where: { id: venda.id, tenantId: TENANT } });
    const { partidas: partidasPOS } = await lerDocumento(v.faturaId);
    const contasPOS = [...new Set(partidasPOS.filter((p) => p.tipo === 'DEBITO').map((p) => p.codigo))];

    // 3) Emissão pelo núcleo, só com os pagamentos (sem construirLancamento do chamador).
    const doc = await emitirComPagamentos('FATURA_RECIBO', [pag('MPESA', '1160')]);
    const { partidas: partidasNucleo } = await lerDocumento(doc.id);
    const contasNucleo = [...new Set(partidasNucleo.filter((p) => p.tipo === 'DEBITO').map((p) => p.codigo))];

    expect(contaDoRecebimento).toBe('122');
    expect(contasPOS).toEqual([contaDoRecebimento]);
    expect(contasNucleo).toEqual([contaDoRecebimento]);
  });

  // -------------------------------------------------------------------------
  // (E) + (C) o núcleo deriva o estado e o lançamento dos pagamentos
  // -------------------------------------------------------------------------

  it('FATURA_RECIBO com pagamentos MPESA + DINHEIRO nasce PAGA e debita 122 + 111 (não 411)', async () => {
    const doc = await emitirComPagamentos('FATURA_RECIBO', [pag('MPESA', '1000'), pag('DINHEIRO', '160')]);
    const { fatura, partidas } = await lerDocumento(doc.id);

    expect(fatura.status).toBe('PAGA');
    expect(dec(fatura.totalPago).equals(dec('1160'))).toBe(true);
    expect(somar(partidas, 'DEBITO', '122').equals(dec('1000'))).toBe(true);
    expect(somar(partidas, 'DEBITO', '111').equals(dec('160'))).toBe(true);
    expect(somar(partidas, 'DEBITO', '411').equals(ZERO)).toBe(true);
    esperarCreditosEEquilibrio(fatura, partidas);
  });

  it('FATURA mista (DINHEIRO 160 + CREDITO 1000) nasce PARCIALMENTE_PAGA com totalPago 160: D 111 160, D 411 1000', async () => {
    const doc = await emitirComPagamentos('FATURA', [pag('DINHEIRO', '160'), pag('CREDITO', '1000')]);
    const { fatura, partidas } = await lerDocumento(doc.id);

    expect(fatura.status).toBe('PARCIALMENTE_PAGA');
    expect(dec(fatura.totalPago).equals(dec('160'))).toBe(true);
    expect(somar(partidas, 'DEBITO', '111').equals(dec('160'))).toBe(true);
    expect(somar(partidas, 'DEBITO', '411').equals(dec('1000'))).toBe(true);
    esperarCreditosEEquilibrio(fatura, partidas);
  });

  it('FATURA toda a CREDITO nasce EMITIDA com totalPago 0: D 411 = total', async () => {
    const doc = await emitirComPagamentos('FATURA', [pag('CREDITO', '1160')]);
    const { fatura, partidas } = await lerDocumento(doc.id);

    expect(fatura.status).toBe('EMITIDA');
    expect(dec(fatura.totalPago).equals(ZERO)).toBe(true);
    expect(somar(partidas, 'DEBITO', '411').equals(dec('1160'))).toBe(true);
    esperarCreditosEEquilibrio(fatura, partidas);
  });

  // -------------------------------------------------------------------------
  // (T) Σ pagamentos ≠ total é recusado pelo núcleo, sem deixar nada
  // -------------------------------------------------------------------------

  it.each([
    ['FATURA_RECIBO', [['MPESA', '1000']]],
    ['FATURA', [['DINHEIRO', '100'], ['CREDITO', '1000']]],
  ] as const)('%s com Σ pagamentos ≠ total → PAGAMENTOS_NAO_BATEM_TOTAL; nada gravado, série intacta', async (serie, linhas) => {
    const antes = await contagens();
    const erro = await capturarErro(() => emitirComPagamentos(serie, linhas.map(([t, v]) => pag(t, v))));
    expect(erro, 'o núcleo tinha de recusar').toBeDefined();
    expect(erro.code).toBe('PAGAMENTOS_NAO_BATEM_TOTAL');
    expect(await contagens()).toEqual(antes);
  });
});
