/**
 * Oráculo S1 — núcleo de emissão em transacção (ADR-0041 §3, §8; issue #305)
 *
 * Contra Postgres real (Testcontainers), fixa o contrato do núcleo partilhado:
 *   (1) `emitirDocumentoEmTx(tx, input, ctx)` emite a factura DENTRO da transacção do
 *       chamador: Fatura + linhas + série, lançamento D 411 / C 711 / C 44331 ligado em
 *       `Fatura.lancamentoId`;
 *   (2) `emitirNotaCreditoEmTx(tx, input, ctx)` idem para a nota de crédito (estorno);
 *   (3) `converterProformaEmFatura` passa a lançar e a ligar `Fatura.lancamentoId`
 *       (até aqui deixava a factura sem lançamento ⇒ DOCUMENTO_SEM_LANCAMENTO);
 *   (4) o núcleo congela `Fatura.nuitCliente` com o NUIT do cliente na emissão;
 *   (5) se a transacção do chamador falhar depois do núcleo, NADA fica: nem Fatura,
 *       nem linhas, nem lançamento, e a série não avança;
 *   (6) o núcleo não consulta a sessão — chamado sem sessão nenhuma, emite.
 *
 * O tenant é montado pelos serviços reais (`bootstrapContabilidade`); nenhum número
 * nem lançamento escrito à mão. A sessão é fronteira e é o único duplo.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

// A sessão é fronteira, não domínio. Mutável: os casos do núcleo correm SEM sessão
// (prova que o núcleo não a consulta); a conversão de proforma corre com sessão confirmada.
const h = vi.hoisted(() => ({ sessao: null as null | { user: { emailVerificado: boolean } } }));
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => h.sessao),
}));

const SESSAO_CONFIRMADA = { user: { emailVerificado: true } };
const NUIT_CLIENTE = '400000305';
const dec = (v: unknown) => new Prisma.Decimal(String(v));

class FalhaDoChamador extends Error {
  constructor() {
    super('falha do chamador depois do núcleo');
  }
}

describe.skipIf(skip)('Núcleo de emissão em transacção — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let fat: typeof import('@/server/services/financas/faturacao.service');
  let val: typeof import('@/lib/validations/faturacao');

  const sufixo = Date.now();
  const TENANT = `tenant-nucleo-emissao-${sufixo}`;
  const USER = `user-nucleo-emissao-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  let clienteId: string;

  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  function inputFatura() {
    const hoje = new Date();
    return val.EmitirFaturaSchema.parse({
      clienteId,
      dataEmissao: hoje,
      dataVencimento: new Date(hoje.getTime() + 30 * 86_400_000),
      linhas: [
        { descricao: 'Mercadoria A', quantidade: 2, precoUnitario: 500, taxaIva: 0.16 },
        { descricao: 'Mercadoria B', quantidade: 1, precoUnitario: 250, taxaIva: 0.16 },
      ],
    });
  }

  /** Partidas do lançamento, com o código da conta PGC (lido da base, não do input). */
  async function partidasDe(lancamentoId: string) {
    const partidas = await db.partidaLancamento.findMany({
      where: { lancamentoId, tenantId: TENANT },
      include: { conta: { select: { codigo: true } } },
    });
    return partidas.map((p: any) => ({ codigo: p.conta.codigo as string, tipo: p.tipo as string, valor: dec(p.valor) }));
  }

  function somar(partidas: Array<{ tipo: string; valor: Prisma.Decimal }>, tipo: string) {
    return partidas.filter((p) => p.tipo === tipo).reduce((a, p) => a.plus(p.valor), new Prisma.Decimal(0));
  }

  function valorDe(partidas: Array<{ codigo: string; tipo: string; valor: Prisma.Decimal }>, codigo: string, tipo: string) {
    return somar(partidas.filter((p) => p.codigo === codigo), tipo);
  }

  /** Lançamento da factura: D 411 = total, C 711 = subtotal, C 44331 = IVA; equilibrado. */
  async function esperarLancamentoDeFatura(fatura: { id: string; lancamentoId: string | null; total: unknown; subtotal: unknown; ivaTotal: unknown }) {
    expect(fatura.lancamentoId, 'Fatura.lancamentoId').toBeTruthy();
    const lanc = await db.lancamento.findFirst({ where: { id: fatura.lancamentoId, tenantId: TENANT } });
    expect(lanc).not.toBeNull();
    expect(lanc.status).toBe('LANCADO');
    expect(lanc.origem).toBe('VENDA');
    expect(lanc.documentoOrigemId).toBe(fatura.id);
    expect(lanc.documentoOrigemTipo).toBe('Fatura');

    const partidas = await partidasDe(fatura.lancamentoId as string);
    expect(valorDe(partidas, '411', 'DEBITO').equals(dec(fatura.total))).toBe(true);
    expect(valorDe(partidas, '711', 'CREDITO').equals(dec(fatura.subtotal))).toBe(true);
    expect(valorDe(partidas, '44331', 'CREDITO').equals(dec(fatura.ivaTotal))).toBe(true);
    expect(somar(partidas, 'DEBITO').equals(somar(partidas, 'CREDITO'))).toBe(true);
    expect(somar(partidas, 'DEBITO').equals(dec(fatura.total))).toBe(true);
  }

  async function proximoNumeroDaSerie(tipo: string): Promise<number> {
    const series = await db.serieDocumento.findMany({ where: { tenantId: TENANT, tipo, ativo: true } });
    expect(series.length, `série activa ${tipo}`).toBeGreaterThan(0);
    return series.reduce((a: number, s: any) => a + s.proximoNumero, 0);
  }

  async function contagens() {
    return {
      faturas: await db.fatura.count({ where: { tenantId: TENANT } }),
      linhasFatura: await db.linhaFatura.count({ where: { tenantId: TENANT } }),
      notasCredito: await db.notaCredito.count({ where: { tenantId: TENANT } }),
      linhasNotaCredito: await db.linhaNotaCredito.count({ where: { tenantId: TENANT } }),
      lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
      partidas: await db.partidaLancamento.count({ where: { tenantId: TENANT } }),
    };
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    fat = await import('@/server/services/financas/faturacao.service');
    val = await import('@/lib/validations/faturacao');
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant Núcleo Emissão', slug: `nucleo-emissao-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: {
        id: USER,
        tenantId: TENANT,
        email: `nucleo-emissao-${sufixo}@test.mz`,
        nome: 'Utilizador Núcleo',
        keycloakSub: `kc-nucleo-emissao-${sufixo}`,
      },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const cliente = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente Núcleo',
        tipo: 'JURIDICA',
        nuit: NUIT_CLIENTE,
        email: `cliente-nucleo-${sufixo}@test.mz`,
        telefone: '840000305',
        codigo: `CLI-NUC-${sufixo}`,
      },
    });
    clienteId = cliente.id;
  });

  // -------------------------------------------------------------------------
  // (1) + (4) + (6) emitirDocumentoEmTx
  // -------------------------------------------------------------------------

  it('emitirDocumentoEmTx emite na transacção do chamador, sem sessão: factura, linhas, série, lançamento e NUIT congelado', async () => {
    h.sessao = null;
    const serieAntes = await proximoNumeroDaSerie('FATURA');

    const devolvida: any = await noCtx(() =>
      db.$transaction((tx: Prisma.TransactionClient) => fat.emitirDocumentoEmTx(tx, inputFatura(), ctx)),
    );

    // Mesma forma que emitirFatura devolve: Fatura com linhas e serieDocumento.
    expect(devolvida.id).toBeTruthy();
    expect(devolvida.status).toBe('EMITIDA');
    expect(devolvida.linhas).toHaveLength(2);
    expect(devolvida.serieDocumento?.tipo).toBe('FATURA');
    expect(dec(devolvida.subtotal).equals(dec('1250'))).toBe(true);
    expect(dec(devolvida.ivaTotal).equals(dec('200'))).toBe(true);
    expect(dec(devolvida.total).equals(dec('1450'))).toBe(true);

    const gravada = await db.fatura.findFirst({ where: { id: devolvida.id, tenantId: TENANT } });
    expect(gravada).not.toBeNull();
    expect(gravada.nuitCliente).toBe(NUIT_CLIENTE);
    expect(gravada.clienteId).toBe(clienteId);
    await esperarLancamentoDeFatura(gravada);

    expect(await db.linhaFatura.count({ where: { faturaId: gravada.id, tenantId: TENANT } })).toBe(2);
    expect(await proximoNumeroDaSerie('FATURA')).toBe(serieAntes + 1);
  });

  it('o NUIT fica congelado: mudar o NUIT do cliente depois da emissão não muda Fatura.nuitCliente', async () => {
    h.sessao = null;
    const f: any = await noCtx(() =>
      db.$transaction((tx: Prisma.TransactionClient) => fat.emitirDocumentoEmTx(tx, inputFatura(), ctx)),
    );
    await db.cliente.update({ where: { id: clienteId }, data: { nuit: '400000999' } });
    try {
      const gravada = await db.fatura.findFirst({ where: { id: f.id, tenantId: TENANT } });
      expect(gravada.nuitCliente).toBe(NUIT_CLIENTE);
    } finally {
      await db.cliente.update({ where: { id: clienteId }, data: { nuit: NUIT_CLIENTE } });
    }
  });

  it('emitirFatura (com sessão confirmada) continua a lançar e passa também a congelar o NUIT', async () => {
    h.sessao = SESSAO_CONFIRMADA;
    const f: any = await noCtx(() => fat.emitirFatura(inputFatura(), ctx));
    const gravada = await db.fatura.findFirst({ where: { id: f.id, tenantId: TENANT } });
    expect(gravada.nuitCliente).toBe(NUIT_CLIENTE);
    await esperarLancamentoDeFatura(gravada);
  });

  // -------------------------------------------------------------------------
  // (5) atomicidade com a transacção do chamador
  // -------------------------------------------------------------------------

  it('se a transacção do chamador falhar depois do núcleo, não fica factura, linhas, lançamento nem número gasto', async () => {
    h.sessao = null;
    const antes = await contagens();
    const serieAntes = await proximoNumeroDaSerie('FATURA');
    let emitidaNaTx: { id: string; lancamentoId: string | null } | null = null;

    await expect(
      noCtx(() =>
        db.$transaction(async (tx: Prisma.TransactionClient) => {
          emitidaNaTx = (await fat.emitirDocumentoEmTx(tx, inputFatura(), ctx)) as any;
          throw new FalhaDoChamador();
        }),
      ),
    ).rejects.toBeInstanceOf(FalhaDoChamador);

    // Não é vácuo: o núcleo chegou a emitir dentro da transacção.
    expect(emitidaNaTx).not.toBeNull();
    expect(emitidaNaTx!.id).toBeTruthy();

    expect(await db.fatura.findFirst({ where: { id: emitidaNaTx!.id } })).toBeNull();
    expect(await contagens()).toEqual(antes);
    expect(await proximoNumeroDaSerie('FATURA')).toBe(serieAntes);
  });

  // -------------------------------------------------------------------------
  // (2) emitirNotaCreditoEmTx
  // -------------------------------------------------------------------------

  function inputNC(faturaOriginalId: string) {
    return val.EmitirNotaCreditoSchema.parse({
      faturaOriginalId,
      motivo: 'Devolução de balcão',
      dataEmissao: new Date(),
      linhas: [{ descricao: 'Mercadoria A devolvida', quantidade: 1, precoUnitario: 500, taxaIva: 0.16 }],
    });
  }

  it('emitirNotaCreditoEmTx emite na transacção do chamador, sem sessão, com o estorno D 711 / D 44331 / C 411', async () => {
    h.sessao = null;
    const f: any = await noCtx(() =>
      db.$transaction((tx: Prisma.TransactionClient) => fat.emitirDocumentoEmTx(tx, inputFatura(), ctx)),
    );
    const serieAntes = await proximoNumeroDaSerie('NOTA_CREDITO');

    const nc: any = await noCtx(() =>
      db.$transaction((tx: Prisma.TransactionClient) => fat.emitirNotaCreditoEmTx(tx, inputNC(f.id), ctx)),
    );

    expect(nc.id).toBeTruthy();
    expect(nc.linhas).toHaveLength(1);
    expect(nc.faturaOriginal?.id).toBe(f.id);

    const gravada = await db.notaCredito.findFirst({ where: { id: nc.id, tenantId: TENANT } });
    expect(gravada.status).toBe('EMITIDA');
    expect(dec(gravada.subtotal).equals(dec('500'))).toBe(true);
    expect(dec(gravada.ivaTotal).equals(dec('80'))).toBe(true);
    expect(dec(gravada.total).equals(dec('580'))).toBe(true);
    expect(gravada.lancamentoId).toBeTruthy();

    const lanc = await db.lancamento.findFirst({ where: { id: gravada.lancamentoId, tenantId: TENANT } });
    expect(lanc.status).toBe('LANCADO');
    expect(lanc.documentoOrigemId).toBe(nc.id);
    expect(lanc.documentoOrigemTipo).toBe('NotaCredito');

    const partidas = await partidasDe(gravada.lancamentoId);
    expect(valorDe(partidas, '711', 'DEBITO').equals(dec('500'))).toBe(true);
    expect(valorDe(partidas, '44331', 'DEBITO').equals(dec('80'))).toBe(true);
    expect(valorDe(partidas, '411', 'CREDITO').equals(dec('580'))).toBe(true);
    expect(somar(partidas, 'DEBITO').equals(somar(partidas, 'CREDITO'))).toBe(true);

    expect(await proximoNumeroDaSerie('NOTA_CREDITO')).toBe(serieAntes + 1);
  });

  it('se a transacção do chamador falhar depois de emitirNotaCreditoEmTx, não fica NC, linhas, lançamento nem número gasto', async () => {
    h.sessao = null;
    const f: any = await noCtx(() =>
      db.$transaction((tx: Prisma.TransactionClient) => fat.emitirDocumentoEmTx(tx, inputFatura(), ctx)),
    );
    const antes = await contagens();
    const serieAntes = await proximoNumeroDaSerie('NOTA_CREDITO');
    let emitidaNaTx: { id: string } | null = null;

    await expect(
      noCtx(() =>
        db.$transaction(async (tx: Prisma.TransactionClient) => {
          emitidaNaTx = (await fat.emitirNotaCreditoEmTx(tx, inputNC(f.id), ctx)) as any;
          throw new FalhaDoChamador();
        }),
      ),
    ).rejects.toBeInstanceOf(FalhaDoChamador);

    expect(emitidaNaTx).not.toBeNull();
    expect(await db.notaCredito.findFirst({ where: { id: emitidaNaTx!.id } })).toBeNull();
    expect(await contagens()).toEqual(antes);
    expect(await proximoNumeroDaSerie('NOTA_CREDITO')).toBe(serieAntes);
  });

  // -------------------------------------------------------------------------
  // (3) converterProformaEmFatura lança
  // -------------------------------------------------------------------------

  it('converterProformaEmFatura lança D 411 / C 711 / C 44331, liga Fatura.lancamentoId e congela o NUIT', async () => {
    h.sessao = SESSAO_CONFIRMADA;
    const hoje = new Date();
    const proforma: any = await noCtx(() =>
      fat.criarProforma(
        val.CriarProformaSchema.parse({
          clienteId,
          dataEmissao: hoje,
          dataValidade: new Date(hoje.getTime() + 15 * 86_400_000),
          linhas: [
            { descricao: 'Serviço proformado', quantidade: 3, precoUnitario: 200, taxaIva: 0.16 },
            { descricao: 'Serviço isento', quantidade: 1, precoUnitario: 100, taxaIva: 0 },
          ],
        }),
        ctx,
      ),
    );
    await noCtx(() => fat.enviarProforma(proforma.id, ctx));
    await noCtx(() => fat.aceitarProforma(proforma.id, ctx));

    const f: any = await noCtx(() => fat.converterProformaEmFatura(proforma.id, ctx));

    const gravada = await db.fatura.findFirst({ where: { id: f.id, tenantId: TENANT } });
    expect(gravada.status).toBe('EMITIDA');
    expect(dec(gravada.subtotal).equals(dec('700'))).toBe(true);
    expect(dec(gravada.ivaTotal).equals(dec('96'))).toBe(true);
    expect(dec(gravada.total).equals(dec('796'))).toBe(true);
    await esperarLancamentoDeFatura(gravada);
    expect(gravada.nuitCliente).toBe(NUIT_CLIENTE);

    const p = await db.proforma.findFirst({ where: { id: proforma.id, tenantId: TENANT } });
    expect(p.status).toBe('CONVERTIDA');
    expect(p.faturaId).toBe(f.id);
  });

  it('nenhuma factura do tenant fica sem lançamento (pré-condição DOCUMENTO_SEM_LANCAMENTO)', async () => {
    const semLancamento = await db.fatura.count({ where: { tenantId: TENANT, lancamentoId: null } });
    expect(semLancamento).toBe(0);
  });
});
