/**
 * #564 — documentos e lançamentos que tocam o IVA num período com IVA já apurado ou declarado.
 *
 * O período continua ABERTO depois do apuramento (só o fecho o tranca). Sem guarda, uma factura
 * com data num mês apurado ia para a 44331 desse mês, que o apuramento já leu e o seguinte não lê:
 * o IVA nunca era declarado.
 *
 * Calendário do teste (2026):
 *   - 2026-02 aberto, nunca apurado — a factura de base das NC;
 *   - 2026-03 apurado DE VERDADE (`apurarIva`) em (h);
 *   - 2026-04 com apuramento APURADO / DECLARADO (linha inserida à mão: o que se prova é a guarda);
 *   - 2026-05 aberto, sem apuramento — (i), e emissão da ND/NC de (g);
 *   - período de hoje: apuramento inserido só durante (g).
 *
 *   (a) factura ⇒ PERIODO_IVA_APURADO e `SerieDocumento.proximoNumero` inalterado;
 *   (b) NC ⇒ recusada;  (c) ND ⇒ recusada;  (d) conta a pagar com IVA ⇒ recusada, nada escrito;
 *   (e) lançamento manual na 44331 ⇒ recusado;  (f) lançamento manual sem IVA ⇒ passa;
 *   (g) cancelar ND / NC hoje com o período corrente apurado e o da emissão aberto ⇒ recusado;
 *   (h) o apuramento de um período aberto grava o seu lançamento, e estorná-lo continua a passar;
 *   (i) período aberto sem apuramento ⇒ tudo passa.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

describe.skipIf(skip)('#564 — guarda de IVA apurado — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let fat: any;
  let contab: any;
  let apur: any;
  let cp: any;
  let val: typeof import('@/lib/validations/faturacao');
  let valContab: typeof import('@/lib/validations/contabilidade');
  let periodoFiscalDe: (d: Date) => string;

  const sufixo = Date.now();
  const TENANT = `tenant-iva-564-${sufixo}`;
  const USER = `user-iva-564-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER, permissions: new Set<string>() };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  const FEV = new Date('2026-02-10T10:00:00Z');
  const MAR = new Date('2026-03-15T10:00:00Z');
  const ABR = new Date('2026-04-15T10:00:00Z');
  const MAI = new Date('2026-05-15T10:00:00Z');

  let clienteId: string;
  let fornecedorId: string;
  let contaGastoId: string;
  let diarioOperacoesId: string;
  const conta: Record<string, string> = {};
  let faturaBaseId: string;

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  const periodo = (codigo: string) => db.periodoContabil.findFirst({ where: { tenantId: TENANT, codigo } });

  /** Apuramento fixture (linha à mão) no período; devolve uma função que o apaga. */
  async function comApuramento(codigo: string, estado: 'APURADO' | 'DECLARADO'): Promise<() => Promise<void>> {
    const p = await periodo(codigo);
    const versao = (await db.apuramentoIva.count({ where: { tenantId: TENANT, periodoId: p.id } })) + 1;
    const a = await db.apuramentoIva.create({
      data: {
        tenantId: TENANT, periodoId: p.id, versao, estado,
        totalIvaLiquidado: 0, totalIvaDedutivel: 0, totalRegularizacoes: 0, saldoApuramento: 0,
        apuradoPorId: USER, keycloakSub: `kc-${USER}`,
      },
    });
    return async () => {
      await db.apuramentoIva.delete({ where: { id: a.id } });
    };
  }

  const linha = { descricao: 'Serviço', quantidade: 1, precoUnitario: 100, taxaIva: 0.16 };

  const emitirFatura = (data: Date) =>
    noCtx(() =>
      fat.emitirFatura(
        val.EmitirFaturaSchema.parse({ clienteId, dataEmissao: data, dataVencimento: data, linhas: [linha] }),
        ctx,
      ),
    ) as Promise<any>;

  const emitirNC = (data: Date) =>
    noCtx(() =>
      fat.emitirNotaCredito(
        val.EmitirNotaCreditoSchema.parse({
          faturaOriginalId: faturaBaseId,
          motivo: 'Desconto',
          dataEmissao: data,
          linhas: [{ ...linha, precoUnitario: 10 }],
        }),
        ctx,
      ),
    ) as Promise<any>;

  const emitirND = (data: Date) =>
    noCtx(() =>
      fat.emitirNotaDebito(
        val.EmitirNotaDebitoSchema.parse({ clienteId, motivo: 'Acerto de preço', dataEmissao: data, linhas: [linha] }),
        ctx,
      ),
    ) as Promise<any>;

  let seqCP = 0;
  const criarCP = (data: Date) =>
    noCtx(() =>
      cp.criar(
        {
          fornecedorId,
          descricao: `Factura 564 #${++seqCP}`,
          valorOriginal: 1160,
          dataEmissao: data,
          dataVencimento: data,
          contaContabilId: contaGastoId,
          tipoAquisicao: 'OUTROS_BENS_SERVICOS',
          baseIva: 1000,
          taxaIva: 0.16,
          valorIva: 160,
          numeroDocumento: `FRN-564-${sufixo}-${seqCP}`,
          dataDocumento: data,
        },
        ctx,
      ),
    ) as Promise<any>;

  const manual = (data: Date, debito: string, credito: string) =>
    noCtx(() =>
      contab.criarLancamento(
        valContab.CriarLancamentoSchema.parse({
          data: data.toISOString().slice(0, 10),
          diarioId: diarioOperacoesId,
          historico: `Manual ${debito}/${credito}`,
          partidas: [
            { contaId: conta[debito], tipo: 'DEBITO', valor: 16 },
            { contaId: conta[credito], tipo: 'CREDITO', valor: 16 },
          ],
        }),
        ctx,
      ),
    ) as Promise<any>;

  const proximos = async () =>
    Object.fromEntries(
      (await db.serieDocumento.findMany({ where: { tenantId: TENANT }, select: { tipo: true, ano: true, proximoNumero: true } })).map(
        (s: any) => [`${s.tipo}-${s.ano}`, s.proximoNumero],
      ),
    );

  const contagens = async () => ({
    faturas: await db.fatura.count({ where: { tenantId: TENANT } }),
    ncs: await db.notaCredito.count({ where: { tenantId: TENANT } }),
    nds: await db.notaDebito.count({ where: { tenantId: TENANT } }),
    cps: await db.contaPagar.count({ where: { tenantId: TENANT } }),
    lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
    series: await proximos(),
  });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    fat = await import('@/server/services/financas/faturacao.service');
    contab = await import('@/server/services/financas/contabilidade.service');
    apur = await import('@/server/services/financas/apuramento-iva.service');
    ({ contaPagarService: cp } = await import('@/server/services/compras/conta-pagar.service'));
    val = await import('@/lib/validations/faturacao');
    valContab = await import('@/lib/validations/contabilidade');
    periodoFiscalDe = contab.periodoFiscalDe;
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({ data: { id: TENANT, nome: 'Tenant IVA 564', slug: `iva-564-${sufixo}`, nuit: `${sufixo}`.slice(-9) } });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `iva-564-${sufixo}@test.mz`, nome: 'Contabilista', keycloakSub: `kc-${USER}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    clienteId = (
      await db.cliente.create({
        data: {
          tenantId: TENANT, nome: 'Cliente 564', tipo: 'JURIDICA', nuit: '400000564',
          email: `cliente-564-${sufixo}@test.mz`, telefone: '840000564', codigo: `CLI-564-${sufixo}`,
        },
      })
    ).id;
    fornecedorId = (
      await db.fornecedor.create({
        data: {
          tenantId: TENANT, codigo: `FOR-564-${sufixo}`, nome: 'Fornecedor 564', tipo: 'PESSOA_JURIDICA',
          nuit: '400000565', email: `for-564-${sufixo}@test.mz`,
        },
      })
    ).id;
    contaGastoId = (
      await db.contaPGC.findFirst({
        where: { tenantId: TENANT, codigo: { startsWith: '6' }, aceitaLancamento: true, ativo: true },
        orderBy: { codigo: 'asc' },
      })
    ).id;
    for (const codigo of ['111', '44331', '711', '521']) {
      conta[codigo] = (await db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo } })).id;
    }
    diarioOperacoesId = (await db.diario.findFirst({ where: { tenantId: TENANT, tipo: 'OPERACOES' } })).id;

    faturaBaseId = (await emitirFatura(FEV)).id;
  }, 180_000);

  describe.each(['APURADO', 'DECLARADO'] as const)('período 2026-04 com apuramento %s', (estado) => {
    let apagar: () => Promise<void>;
    beforeAll(async () => {
      apagar = await comApuramento('2026-04', estado);
      return () => apagar();
    });

    it('(a) factura ⇒ PERIODO_IVA_APURADO e não consome número', async () => {
      const antes = await contagens();
      const erro = await capturarErro(() => emitirFatura(ABR));
      expect(erro?.code).toBe('PERIODO_IVA_APURADO');
      expect(erro?.message).toContain('2026-04');
      expect(await contagens()).toEqual(antes);
    });

    it('(b) nota de crédito ⇒ recusada, nada escrito', async () => {
      const antes = await contagens();
      expect((await capturarErro(() => emitirNC(ABR)))?.code).toBe('PERIODO_IVA_APURADO');
      expect(await contagens()).toEqual(antes);
    });

    it('(c) nota de débito ⇒ recusada, nada escrito', async () => {
      const antes = await contagens();
      expect((await capturarErro(() => emitirND(ABR)))?.code).toBe('PERIODO_IVA_APURADO');
      expect(await contagens()).toEqual(antes);
    });

    it('(d) conta a pagar com IVA ⇒ recusada, nada escrito', async () => {
      const antes = await contagens();
      expect((await capturarErro(() => criarCP(ABR)))?.code).toBe('PERIODO_IVA_APURADO');
      expect(await contagens()).toEqual(antes);
    });

    it('(e) lançamento manual na 44331 ⇒ recusado', async () => {
      const antes = await contagens();
      expect((await capturarErro(() => manual(ABR, '111', '44331')))?.code).toBe('PERIODO_IVA_APURADO');
      expect(await contagens()).toEqual(antes);
    });

    it('(f) lançamento manual sem contas de IVA no mesmo período ⇒ passa', async () => {
      const l = await manual(ABR, '111', '521');
      expect(l.periodoFiscal).toBe('2026-04');
    });
  });

  it.each(['ND', 'NC'] as const)(
    '(g) cancelar uma %s hoje, com o período corrente apurado e o da emissão aberto ⇒ PERIODO_IVA_APURADO',
    async (tipo) => {
      const hoje = periodoFiscalDe(new Date());
      expect(hoje, 'o período de hoje não pode ser o da emissão').not.toBe('2026-05');
      const doc = tipo === 'ND' ? await emitirND(MAI) : await emitirNC(MAI);
      const apagar = await comApuramento(hoje, 'APURADO');
      try {
        const antes = await contagens();
        const erro = await capturarErro(() =>
          noCtx(() =>
            tipo === 'ND'
              ? fat.cancelarNotaDebito(doc.id, 'Emitida por engano', ctx)
              : fat.cancelarNotaCredito(doc.id, 'Emitida por engano', ctx),
          ),
        );
        expect(erro?.code).toBe('PERIODO_IVA_APURADO');
        expect(erro?.message).toContain(hoje);
        expect(await contagens()).toEqual(antes);
      } finally {
        await apagar();
      }
    },
  );

  it('(h) o apuramento de um período aberto grava o seu lançamento, e estorná-lo continua a passar', async () => {
    await emitirFatura(MAR);
    const p = await periodo('2026-03');
    const ap: any = await noCtx(() => apur.apurarIva({ periodoId: p.id }, ctx));
    expect(ap.estado).toBe('APURADO');
    expect(ap.lancamentoId, 'o apuramento grava o lançamento').toBeTruthy();
    const lanc = await db.lancamento.findFirst({ where: { id: ap.lancamentoId } });
    expect(lanc.periodoFiscal).toBe('2026-03');

    // Excepção: o estorno do próprio apuramento toca a 443x no período apurado e tem de passar.
    const estornado: any = await noCtx(() => apur.estornarApuramentoIva({ apuramentoId: ap.id, motivo: 'Correcção' }, ctx));
    expect(estornado.estado).toBe('ESTORNADO');
    expect((await db.lancamento.findFirst({ where: { id: ap.lancamentoId } })).status).toBe('ESTORNADO');
  });

  it('(i) período aberto sem apuramento ⇒ factura, NC, ND, CP e manual na 44331 passam', async () => {
    const f = await emitirFatura(MAI);
    const nc = await emitirNC(MAI);
    const nd = await emitirND(MAI);
    const c = await criarCP(MAI);
    const l = await manual(MAI, '111', '44331');
    for (const d of [f, nc, nd, c]) expect(d.id).toBeTruthy();
    expect(l.periodoFiscal).toBe('2026-05');
  });
});
