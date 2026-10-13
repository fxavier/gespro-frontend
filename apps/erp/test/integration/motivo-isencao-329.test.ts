/**
 * Oráculo da issue #329 — `motivoIsencao` exigido e gravado em linhas a 0% (ADR-0039 §4).
 *
 * Contra Postgres real (Testcontainers), pelos caminhos reais:
 *   (M) Emissão MANUAL — `emitirFatura`, `emitirNotaCredito`, `emitirNotaDebito` e os núcleos
 *       `emitirDocumentoEmTx` / `emitirNotaCreditoEmTx` (sem sessão): uma linha a 0% sem motivo
 *       (ou só com espaços) é recusada com BusinessRuleError `MOTIVO_ISENCAO_EM_FALTA`
 *       (mensagem pt-PT), sem escrever nada nem gastar número; com motivo, o motivo fica
 *       gravado na linha (`LinhaFatura`/`LinhaNotaCredito`/`LinhaNotaDebito.motivoIsencao`).
 *   (A) Caminhos AUTOMÁTICOS — venda POS (Factura-Recibo), anulação POS (NC), devolução (NC) e
 *       troca (NC + Factura-Recibo): a linha a 0% leva um texto legal fixo, derivado do regime
 *       fiscal do tenant, e o POS NUNCA falha por falta de motivo — também num tenant ISENTO.
 *   (P) O modelo do PDF da factura (`obterModeloFatura`) mostra o motivo na linha.
 *   (I) Invariante final: nenhuma linha a 0% de Fatura/NC/ND destes tenants fica sem motivo.
 *
 * O texto legal exacto NÃO é fixado aqui (é do implementador); fixa-se que existe, que não é
 * só espaços, e que é o MESMO texto na factura e na NC que a anula (mesma derivação).
 *
 * O tenant é montado pelos serviços reais (`bootstrapContabilidade`, `abrirSessao` do caixa);
 * catálogo/stock/sessão POS são dados de partida. A sessão (auth) é o único duplo.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

// Mutável: os núcleos correm SEM sessão (provam que a regra vive no núcleo, não no wrapper).
const h = vi.hoisted(() => ({ sessao: { user: { emailVerificado: true } } as null | { user: { emailVerificado: boolean } } }));
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => h.sessao),
}));

const SESSAO_CONFIRMADA = { user: { emailVerificado: true } };
const MOTIVO = 'Isento nos termos do artigo 9.º do Código do IVA';
const dec = (v: unknown) => new Prisma.Decimal(String(v));

type Ctx = { tenantId: string; userId: string };
type Montado = {
  ctx: Ctx;
  clienteId: string;
  produto16: string;
  produto0: string;
  localizacaoId: string;
  sessaoCaixaId: string;
  sessaoPOSId: string;
};

describe.skipIf(skip)('#329 — motivo de isenção em linhas a 0% — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let fat: any;
  let val: any;
  let comercial: any;
  let vendas: any;
  let caixa: any;
  let documentos: any;
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];
  let motivoIsencaoEmFalta: (typeof import('@/lib/nota-debito'))['motivoIsencaoEmFalta'];

  const sufixo = Date.now();
  let seq = 0;
  let T: Montado; // regime NORMAL
  let TI: Montado; // regime ISENTO
  const tenants: string[] = [];

  const noCtx = <R>(m: Montado, fn: () => Promise<R>) => runCtx(m.ctx, fn);

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  function esperarRecusaMotivo(erro: any) {
    expect(erro, 'devia recusar a linha a 0% sem motivo').toBeDefined();
    expect(erro?.code, `erro inesperado: ${erro?.message}`).toBe('MOTIVO_ISENCAO_EM_FALTA');
    expect(erro).toBeInstanceOf(BusinessRuleError);
    expect(String(erro?.message)).toMatch(/isen[cç][aã]o/i);
  }

  async function proximoNumeroDaSerie(tenantId: string, tipo: string): Promise<number> {
    const series = await db.serieDocumento.findMany({ where: { tenantId, tipo, ativo: true } });
    expect(series.length, `série activa ${tipo}`).toBeGreaterThan(0);
    return series.reduce((a: number, s: any) => a + s.proximoNumero, 0);
  }

  async function contagens(tenantId: string) {
    return {
      faturas: await db.fatura.count({ where: { tenantId } }),
      linhasFatura: await db.linhaFatura.count({ where: { tenantId } }),
      notasCredito: await db.notaCredito.count({ where: { tenantId } }),
      linhasNotaCredito: await db.linhaNotaCredito.count({ where: { tenantId } }),
      notasDebito: await db.notaDebito.count({ where: { tenantId } }),
      linhasNotaDebito: await db.linhaNotaDebito.count({ where: { tenantId } }),
      lancamentos: await db.lancamento.count({ where: { tenantId } }),
      serieFatura: await proximoNumeroDaSerie(tenantId, 'FATURA'),
      serieNC: await proximoNumeroDaSerie(tenantId, 'NOTA_CREDITO'),
      serieND: await proximoNumeroDaSerie(tenantId, 'NOTA_DEBITO'),
    };
  }

  async function montarTenant(rotulo: string, regimeIva: 'NORMAL' | 'ISENTO'): Promise<Montado> {
    seq += 1;
    const tenantId = `tenant-mi329-${rotulo}-${sufixo}`;
    // CreateVendaSchema exige cuid em vendedorId: forma `c` + alfanuméricos.
    const userId = `cmi329${rotulo}${sufixo}`;
    const ctx = { tenantId, userId };
    tenants.push(tenantId);
    await db.tenant.create({
      data: { id: tenantId, nome: `Tenant #329 ${rotulo}`, slug: `mi329-${rotulo}-${sufixo}`, nuit: `${seq}${String(sufixo).slice(-8)}` },
    });
    await db.user.create({
      data: { id: userId, tenantId, email: `mi329-${rotulo}-${sufixo}@test.mz`, nome: `Operador ${rotulo}`, keycloakSub: `kc-mi329-${rotulo}-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, tenantId), { timeout: 60_000 });
    await db.configuracaoFiscal.create({ data: { tenantId, regimeIva } });

    const categoria = await db.categoriaProduto.create({ data: { tenantId, nome: 'Mercadorias' } });
    const loc = await db.localizacao.create({
      data: { tenantId, codigo: `ARM-MI329-${rotulo}-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    const ids: Record<string, string> = {};
    for (const [chave, taxaIva, preco] of [
      ['p16', 0.16, 1000],
      ['p0', 0, 500],
    ] as const) {
      const p = await db.produto.create({
        data: {
          tenantId,
          sku: `SKU-MI329-${rotulo}-${chave}-${sufixo}`,
          nome: taxaIva === 0 ? 'Livro escolar (isento)' : 'Artigo normal',
          categoriaId: categoria.id,
          unidadeMedida: 'UN',
          precoVenda: preco,
          precoCompra: preco * 0.7,
          margemLucro: 0.3,
          taxaIva,
        },
      });
      await db.saldoStock.create({
        data: { tenantId, produtoId: p.id, varianteProdutoId: '', localizacaoId: loc.id, saldo: 10_000, saldoReservado: 0 },
      });
      ids[chave] = p.id;
    }

    const cliente = await db.cliente.create({
      data: {
        tenantId,
        nome: `Cliente #329 ${rotulo}`,
        tipo: 'JURIDICA',
        nuit: `40032900${seq}`,
        email: `cliente-mi329-${rotulo}-${sufixo}@test.mz`,
        telefone: '840000329',
        codigo: `CLI-MI329-${rotulo}-${sufixo}`,
      },
    });

    const sc: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial: 5000 }, ctx));
    const sp = await db.sessaoPOS.create({ data: { tenantId, vendedorId: userId, sessaoCaixaId: sc.id, status: 'ABERTA' } });
    const serieNC = await db.serieDocumento.findFirst({ where: { tenantId, tipo: 'NOTA_CREDITO', ativo: true } });
    expect(serieNC, 'série NOTA_CREDITO activa no bootstrap').not.toBeNull();

    return {
      ctx,
      clienteId: cliente.id,
      produto16: ids.p16,
      produto0: ids.p0,
      localizacaoId: loc.id,
      sessaoCaixaId: sc.id,
      sessaoPOSId: sp.id,
    };
  }

  let bootstrapContabilidade: (typeof import('@/server/provisioning/tenant-bootstrap'))['bootstrapContabilidade'];

  // ── inputs ────────────────────────────────────────────────────────────────
  const LINHA_16 = { descricao: 'Serviço normal', quantidade: 1, precoUnitario: 1000, taxaIva: 0.16 };
  const linha0 = (motivoIsencao?: string, precoUnitario = 1000) => ({
    descricao: 'Livro escolar (isento)',
    quantidade: 1,
    precoUnitario,
    taxaIva: 0,
    ...(motivoIsencao === undefined ? {} : { motivoIsencao }),
  });

  function inputFatura(m: Montado, linhas: unknown[]) {
    const hoje = new Date();
    return val.EmitirFaturaSchema.parse({
      clienteId: m.clienteId,
      dataEmissao: hoje,
      dataVencimento: new Date(hoje.getTime() + 30 * 86_400_000),
      linhas,
    });
  }

  function inputNC(faturaOriginalId: string, linhas: unknown[]) {
    return val.EmitirNotaCreditoSchema.parse({ faturaOriginalId, motivo: 'Correcção #329', dataEmissao: new Date(), linhas });
  }

  function inputND(m: Montado, linhas: unknown[]) {
    return val.EmitirNotaDebitoSchema.parse({ clienteId: m.clienteId, motivo: 'Débito #329', dataEmissao: new Date(), linhas });
  }

  /** Factura EMITIDA (16%) para servir de original às NC — não depende do #329. */
  async function faturaOriginal(m: Montado): Promise<string> {
    h.sessao = SESSAO_CONFIRMADA;
    const f: any = await noCtx(m, () => fat.emitirFatura(inputFatura(m, [{ ...LINHA_16, quantidade: 5 }]), m.ctx));
    return f.id;
  }

  async function venderPOS(m: Montado, itens: Array<{ produtoId: string; nome: string; preco: number; taxaIva: number; quantidade?: number }>) {
    h.sessao = SESSAO_CONFIRMADA;
    const linhas = itens.map((i) => ({
      produtoId: i.produtoId,
      nomeProduto: i.nome,
      quantidade: i.quantidade ?? 1,
      precoUnitario: i.preco,
      desconto: 0,
      taxaIva: i.taxaIva,
    }));
    const total = itens.reduce((a, i) => a + (i.quantidade ?? 1) * i.preco * (1 + i.taxaIva), 0);
    const input = vendas.CreateVendaSchema.parse({
      origem: 'POS',
      vendedorId: m.ctx.userId,
      sessaoPOSId: m.sessaoPOSId,
      sessaoCaixaId: m.sessaoCaixaId,
      localizacaoOrigemId: m.localizacaoId,
      itens: linhas,
      pagamentos: [{ tipo: 'DINHEIRO', valor: Math.round(total * 100) / 100 }],
    });
    const row: any = await noCtx(m, () => comercial.vendaService.criar(input, m.ctx));
    const venda = await db.venda.findFirst({ where: { id: row.id, tenantId: m.ctx.tenantId } });
    expect(venda?.faturaId, 'pré-condição: venda POS com Factura-Recibo').toBeTruthy();
    const fatura = await db.fatura.findFirst({ where: { id: venda.faturaId, tenantId: m.ctx.tenantId }, include: { linhas: true } });
    return { venda, fatura };
  }

  const isenta = (linhas: any[]) => linhas.filter((l) => dec(l.taxaIva).isZero());
  const tributadas = (linhas: any[]) => linhas.filter((l) => !dec(l.taxaIva).isZero());

  function esperarMotivoAutomatico(linha: any, onde: string) {
    expect(typeof linha.motivoIsencao, `${onde}: motivoIsencao gravado`).toBe('string');
    expect(String(linha.motivoIsencao).trim().length, `${onde}: motivoIsencao não vazio`).toBeGreaterThan(0);
    expect(motivoIsencaoEmFalta(linha), `${onde}: motivoIsencaoEmFalta`).toBe(false);
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    fat = await import('@/server/services/financas/faturacao.service');
    val = await import('@/lib/validations/faturacao');
    comercial = await import('@/server/services/comercial');
    vendas = await import('@/lib/validations/vendas');
    caixa = await import('@/server/services/financas/caixa.service');
    documentos = await import('@/server/services/plataforma/documentos.service');
    ({ motivoIsencaoEmFalta } = await import('@/lib/nota-debito'));
    ({ BusinessRuleError } = await import('@/lib/errors'));
    ({ bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap'));

    T = await montarTenant('n', 'NORMAL');
    TI = await montarTenant('i', 'ISENTO');
  });

  // ===========================================================================
  // (M) Emissão manual — factura
  // ===========================================================================

  it('emitirFatura: linha a 0% sem motivo → MOTIVO_ISENCAO_EM_FALTA; nada escrito, número intacto', async () => {
    h.sessao = SESSAO_CONFIRMADA;
    const antes = await contagens(T.ctx.tenantId);
    const erro = await capturarErro(() => noCtx(T, () => fat.emitirFatura(inputFatura(T, [LINHA_16, linha0()]), T.ctx)));
    esperarRecusaMotivo(erro);
    expect(await contagens(T.ctx.tenantId)).toEqual(antes);
  });

  it('emitirFatura: motivo só com espaços conta como em falta', async () => {
    h.sessao = SESSAO_CONFIRMADA;
    const antes = await contagens(T.ctx.tenantId);
    const erro = await capturarErro(() => noCtx(T, () => fat.emitirFatura(inputFatura(T, [linha0('   ')]), T.ctx)));
    esperarRecusaMotivo(erro);
    expect(await contagens(T.ctx.tenantId)).toEqual(antes);
  });

  it('emitirDocumentoEmTx (núcleo, sem sessão): linha a 0% sem motivo → recusa na tx do chamador; nada fica', async () => {
    h.sessao = null;
    const antes = await contagens(T.ctx.tenantId);
    const erro = await capturarErro(() =>
      noCtx(T, () => db.$transaction((tx: Prisma.TransactionClient) => fat.emitirDocumentoEmTx(tx, inputFatura(T, [linha0()]), T.ctx))),
    );
    esperarRecusaMotivo(erro);
    expect(await contagens(T.ctx.tenantId)).toEqual(antes);
  });

  it('emitirFatura: com motivo, a linha a 0% grava-o em LinhaFatura.motivoIsencao; a de 16% fica sem motivo', async () => {
    h.sessao = SESSAO_CONFIRMADA;
    const f: any = await noCtx(T, () => fat.emitirFatura(inputFatura(T, [LINHA_16, linha0(MOTIVO)]), T.ctx));
    const linhas = await db.linhaFatura.findMany({ where: { faturaId: f.id, tenantId: T.ctx.tenantId } });
    expect(linhas).toHaveLength(2);
    expect(isenta(linhas)[0].motivoIsencao).toBe(MOTIVO);
    expect(tributadas(linhas)[0].motivoIsencao ?? null).toBeNull();
  });

  // ===========================================================================
  // (M) Emissão manual — nota de crédito
  // ===========================================================================

  it('emitirNotaCredito: linha a 0% sem motivo → MOTIVO_ISENCAO_EM_FALTA; nada escrito, número intacto', async () => {
    const original = await faturaOriginal(T);
    h.sessao = SESSAO_CONFIRMADA;
    const antes = await contagens(T.ctx.tenantId);
    const erro = await capturarErro(() => noCtx(T, () => fat.emitirNotaCredito(inputNC(original, [linha0(undefined, 100)]), T.ctx)));
    esperarRecusaMotivo(erro);
    expect(await contagens(T.ctx.tenantId)).toEqual(antes);
  });

  it('emitirNotaCreditoEmTx (núcleo, sem sessão): linha a 0% sem motivo → recusa; nada fica', async () => {
    const original = await faturaOriginal(T);
    h.sessao = null;
    const antes = await contagens(T.ctx.tenantId);
    const erro = await capturarErro(() =>
      noCtx(T, () =>
        db.$transaction((tx: Prisma.TransactionClient) => fat.emitirNotaCreditoEmTx(tx, inputNC(original, [linha0(undefined, 100)]), T.ctx)),
      ),
    );
    esperarRecusaMotivo(erro);
    expect(await contagens(T.ctx.tenantId)).toEqual(antes);
  });

  it('emitirNotaCredito: com motivo, grava-o em LinhaNotaCredito.motivoIsencao', async () => {
    const original = await faturaOriginal(T);
    h.sessao = SESSAO_CONFIRMADA;
    const nc: any = await noCtx(T, () => fat.emitirNotaCredito(inputNC(original, [linha0(MOTIVO, 100)]), T.ctx));
    const linhas = await db.linhaNotaCredito.findMany({ where: { notaCreditoId: nc.id, tenantId: T.ctx.tenantId } });
    expect(linhas).toHaveLength(1);
    expect(linhas[0].motivoIsencao).toBe(MOTIVO);
  });

  // ===========================================================================
  // (M) Emissão manual — nota de débito
  // ===========================================================================

  it('emitirNotaDebito: linha a 0% sem motivo → MOTIVO_ISENCAO_EM_FALTA; nada escrito, número intacto', async () => {
    h.sessao = SESSAO_CONFIRMADA;
    const antes = await contagens(T.ctx.tenantId);
    const erro = await capturarErro(() => noCtx(T, () => fat.emitirNotaDebito(inputND(T, [LINHA_16, linha0()]), T.ctx)));
    esperarRecusaMotivo(erro);
    expect(await contagens(T.ctx.tenantId)).toEqual(antes);
  });

  it('emitirNotaDebito: com motivo, grava-o em LinhaNotaDebito.motivoIsencao; a de 16% fica sem motivo', async () => {
    h.sessao = SESSAO_CONFIRMADA;
    const nd: any = await noCtx(T, () => fat.emitirNotaDebito(inputND(T, [LINHA_16, linha0(MOTIVO)]), T.ctx));
    const linhas = await db.linhaNotaDebito.findMany({ where: { notaDebitoId: nd.id, tenantId: T.ctx.tenantId } });
    expect(linhas).toHaveLength(2);
    expect(isenta(linhas)[0].motivoIsencao).toBe(MOTIVO);
    expect(tributadas(linhas)[0].motivoIsencao ?? null).toBeNull();
  });

  // ===========================================================================
  // (P) PDF da factura mostra o motivo na linha
  // ===========================================================================

  it('obterModeloFatura: a linha a 0% do modelo do PDF traz o motivo gravado; a de 16% não', async () => {
    h.sessao = SESSAO_CONFIRMADA;
    const f: any = await noCtx(T, () => fat.emitirFatura(inputFatura(T, [LINHA_16, linha0(MOTIVO)]), T.ctx));
    const modelo: any = await noCtx(T, () => documentos.obterModeloFatura(f.id, T.ctx));
    const linha0Modelo = modelo.linhas.find((l: any) => l.taxaIvaPercent === '0%');
    const linha16Modelo = modelo.linhas.find((l: any) => l.taxaIvaPercent === '16%');
    expect(linha0Modelo, 'linha a 0% no modelo').toBeDefined();
    expect(linha0Modelo.motivoIsencao).toBe(MOTIVO);
    expect(linha16Modelo.motivoIsencao ?? null).toBeNull();
  });

  // ===========================================================================
  // (A) Caminhos automáticos — POS, anulação, devolução, troca
  // ===========================================================================

  it('venda POS com linha a 0% (regime NORMAL): não falha; a linha a 0% da Factura-Recibo leva texto legal; a de 16% não', async () => {
    const { fatura } = await venderPOS(T, [
      { produtoId: T.produto16, nome: 'Artigo normal', preco: 1000, taxaIva: 0.16 },
      { produtoId: T.produto0, nome: 'Livro escolar (isento)', preco: 500, taxaIva: 0 },
    ]);
    expect(fatura.status).toBe('PAGA');
    expect(isenta(fatura.linhas)).toHaveLength(1);
    esperarMotivoAutomatico(isenta(fatura.linhas)[0], 'FR POS (NORMAL)');
    expect(tributadas(fatura.linhas)[0].motivoIsencao ?? null).toBeNull();
  });

  it('venda POS a 0% num tenant de regime ISENTO: não falha e a linha leva texto legal', async () => {
    const { fatura } = await venderPOS(TI, [{ produtoId: TI.produto0, nome: 'Livro escolar (isento)', preco: 500, taxaIva: 0 }]);
    expect(fatura.status).toBe('PAGA');
    expect(fatura.linhas).toHaveLength(1);
    esperarMotivoAutomatico(fatura.linhas[0], 'FR POS (ISENTO)');
  });

  it('o texto legal automático é fixo por tenant: duas vendas POS a 0% levam o mesmo motivo', async () => {
    const a = await venderPOS(T, [{ produtoId: T.produto0, nome: 'Livro escolar (isento)', preco: 500, taxaIva: 0 }]);
    const b = await venderPOS(T, [{ produtoId: T.produto0, nome: 'Livro escolar (isento)', preco: 500, taxaIva: 0, quantidade: 2 }]);
    esperarMotivoAutomatico(a.fatura.linhas[0], 'FR POS a');
    expect(b.fatura.linhas[0].motivoIsencao).toBe(a.fatura.linhas[0].motivoIsencao);
  });

  it('anulação POS de uma venda com linha a 0%: a NC passa e a sua linha a 0% leva o MESMO motivo da Factura-Recibo', async () => {
    const { venda, fatura } = await venderPOS(T, [
      { produtoId: T.produto16, nome: 'Artigo normal', preco: 1000, taxaIva: 0.16 },
      { produtoId: T.produto0, nome: 'Livro escolar (isento)', preco: 500, taxaIva: 0 },
    ]);
    h.sessao = SESSAO_CONFIRMADA;
    await noCtx(T, () => comercial.vendaService.anular(venda.id, { motivo: 'Anulação #329' }, T.ctx));
    const nc = await db.notaCredito.findFirst({ where: { tenantId: T.ctx.tenantId, faturaOriginalId: fatura.id }, include: { linhas: true } });
    expect(nc, 'NC da anulação').not.toBeNull();
    expect(isenta(nc.linhas)).toHaveLength(1);
    esperarMotivoAutomatico(isenta(nc.linhas)[0], 'NC anulação');
    expect(isenta(nc.linhas)[0].motivoIsencao).toBe(isenta(fatura.linhas)[0].motivoIsencao);
    expect(tributadas(nc.linhas)[0].motivoIsencao ?? null).toBeNull();
  });

  async function devolucaoAprovada(m: Montado, venda: any, fatura: any) {
    const input = vendas.CreateDevolucaoSchema.parse({
      clienteId: fatura.clienteId,
      vendaId: venda.id,
      faturaId: fatura.id,
      motivo: 'DEFEITO',
      reembolso: false,
      itens: [{ produtoId: m.produto0, nomeProduto: 'Livro escolar (isento)', quantidade: 1, valorUnitario: 500, taxaIva: 0 }],
    });
    const dev: any = await noCtx(m, () => comercial.devolucaoService.criar(input, m.ctx));
    await noCtx(m, () => comercial.devolucaoService.aprovar(dev.id, m.ctx));
    return dev.id as string;
  }

  it('devolução processada de um bem a 0%: não falha e a linha da NC leva texto legal', async () => {
    const { venda, fatura } = await venderPOS(T, [{ produtoId: T.produto0, nome: 'Livro escolar (isento)', preco: 500, taxaIva: 0 }]);
    const devId = await devolucaoAprovada(T, venda, fatura);
    h.sessao = SESSAO_CONFIRMADA;
    await noCtx(T, () =>
      comercial.devolucaoService.processar(devId, T.ctx, { localizacaoId: T.localizacaoId }),
    );
    const dev = await db.devolucao.findFirst({ where: { id: devId, tenantId: T.ctx.tenantId } });
    expect(dev.status).toBe('PROCESSADA');
    expect(dev.notaCreditoId).toBeTruthy();
    const linhas = await db.linhaNotaCredito.findMany({ where: { notaCreditoId: dev.notaCreditoId, tenantId: T.ctx.tenantId } });
    expect(linhas).toHaveLength(1);
    esperarMotivoAutomatico(linhas[0], 'NC devolução');
  });

  it('troca de um bem a 0% por outro a 0%: não falha; a NC e a nova Factura-Recibo levam texto legal', async () => {
    const { venda, fatura } = await venderPOS(T, [{ produtoId: T.produto0, nome: 'Livro escolar (isento)', preco: 500, taxaIva: 0 }]);
    const devId = await devolucaoAprovada(T, venda, fatura);
    const linhasFaturaAntes = new Set(
      (await db.linhaFatura.findMany({ where: { tenantId: T.ctx.tenantId }, select: { id: true } })).map((l: any) => l.id),
    );
    h.sessao = SESSAO_CONFIRMADA;
    const parsed = vendas.CreateTrocaSchema.parse({
      devolucaoId: devId,
      novoItem: { produtoId: T.produto0, nomeProduto: 'Livro escolar (isento)', quantidade: 1, precoUnitario: 500, desconto: 0, taxaIva: 0 },
      sessaoCaixaId: T.sessaoCaixaId,
      pagamentos: [],
      localizacaoId: T.localizacaoId,
    });
    await noCtx(T, () => comercial.trocaService.criar(parsed, T.ctx));

    const ncs = await db.notaCredito.findMany({ where: { tenantId: T.ctx.tenantId, faturaOriginalId: fatura.id }, include: { linhas: true } });
    expect(ncs, 'NC dos bens devolvidos').toHaveLength(1);
    esperarMotivoAutomatico(ncs[0].linhas[0], 'NC troca');

    const novas = (await db.linhaFatura.findMany({ where: { tenantId: T.ctx.tenantId } })).filter((l: any) => !linhasFaturaAntes.has(l.id));
    expect(novas, 'linha da Factura-Recibo da troca').toHaveLength(1);
    esperarMotivoAutomatico(novas[0], 'FR troca');
  });

  // ===========================================================================
  // (I) Invariante: nenhuma linha a 0% sem motivo
  // ===========================================================================

  it('invariante: nenhuma linha a 0% de Fatura, NC ou ND destes tenants ficou sem motivo de isenção', async () => {
    const onde = { tenantId: { in: tenants }, taxaIva: new Prisma.Decimal(0) };
    const todas = [
      ...(await db.linhaFatura.findMany({ where: onde })),
      ...(await db.linhaNotaCredito.findMany({ where: onde })),
      ...(await db.linhaNotaDebito.findMany({ where: onde })),
    ];
    expect(todas.length, 'há linhas a 0% para verificar').toBeGreaterThan(0);
    const semMotivo = todas.filter((l: any) => motivoIsencaoEmFalta(l));
    expect(semMotivo.map((l: any) => `${l.id} ${l.descricao}`)).toEqual([]);
  });
});
