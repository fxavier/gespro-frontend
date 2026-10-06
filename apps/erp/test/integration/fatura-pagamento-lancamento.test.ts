/**
 * Oráculo P2 (fatura-pdf-pagamento) — registar pagamento de factura COM lançamento.
 *
 * Escrito pelo verificador ANTES da implementação; quem implementa não o altera.
 *
 * Contrato (RUN.md «Decisões»; molde: `liquidarNotaCredito` ramo DEVOLUCAO):
 *   Schema `RegistarPagamentoFaturaSchema`
 *     S1 `formaPagamento` obrigatório, do enum de `FORMAS_PAGAMENTO`;
 *     S2 `contaBancariaId` obrigatório quando a forma não é NUMERARIO (path
 *        `contaBancariaId`, a mesma mensagem do schema de liquidação da NC);
 *     S3 `dataPagamento` por `dataDocumento('Data do pagamento')` (sem omissão; ano
 *        fora do intervalo recusado com o rótulo do campo);
 *     S4 `sessaoCaixaId` deixa de existir (a sessão resolve-se como na devolução da NC).
 *   Serviço `registarPagamento(input, ctx & { permissions })`
 *     a. permissão por meio conferida ANTES de tudo: NUMERARIO → `caixa:operar`,
 *        outra forma → `financas:banca:escrita`; falta → `MEIO_PAGAMENTO_SEM_PERMISSAO`;
 *     b. regras que ficam: outro tenant → NotFoundError; estado fora de
 *        EMITIDA/PARCIALMENTE_PAGA/VENCIDA → `FATURA_NAO_PAGAVEL`; PAGA quando
 *        liquidada, senão PARCIALMENTE_PAGA (um segundo parcial mantém-na);
 *     c. valor > pendente → `PAGAMENTO_EXCEDE_SALDO`; dia de Maputo do pagamento
 *        anterior ao da emissão → `PAGAMENTO_DATA_ANTERIOR_EMISSAO` (o próprio dia é válido);
 *     d. UM lançamento por pagamento, na mesma tx: D <conta do meio> / C 411 pelo valor,
 *        diário do meio, origem PAGAMENTO, documento de origem a factura
 *        (`documentoOrigemTipo` 'Fatura'), data = dataPagamento. Em NUMERARIO, também um
 *        movimento de caixa de ENTRADA (`RECEBIMENTO`) na sessão aberta do utilizador,
 *        com a factura como documento de origem;
 *     e. qualquer recusa ⇒ nada escrito (factura igual, sem lançamento, sem movimento).
 *
 * O tenant é montado pelos serviços reais: `bootstrapContabilidade`, `emitirFatura`,
 * `caixa.abrirSessao`. Os testes do serviço chamam-no por acesso dinâmico (`as any`):
 * contra o contrato antigo cada caso falha sozinho, o ficheiro carrega.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { RegistarPagamentoFaturaSchema } from '@/lib/validations/faturacao';
import { FORMAS_PAGAMENTO } from '@/lib/meios-pagamento';
import { MOVIMENTOS_ENTRADA } from '@/lib/caixa-movimentos';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

// A sessão é fronteira, não domínio — o módulo de faturação importa-a para o travão de emissão.
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

const dec = (v: unknown) => new Prisma.Decimal(String(v));
const MSG_CONTA_OBRIGATORIA = 'A conta bancária é obrigatória para esta forma de pagamento.';
const ID_FICTICIO = 'cfaturainexistente0000001';

// ---------------------------------------------------------------------------
// Dias civis de Maputo — aritmética própria do oráculo (não importa a do serviço).
// Maputo é UTC+2 sem hora de Verão: o dia D de Maputo vai de D-1 22:00Z a D 21:59:59Z.
// ---------------------------------------------------------------------------

function hojeEmMaputo(): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Maputo' })
    .format(new Date())
    .split('-')
    .map(Number);
  return { ano, mes, dia };
}

/** Instante `hh:mm` de Maputo no dia (ano, mes, dia) deslocado `deslocDias`. */
function instanteMaputo(d: { ano: number; mes: number; dia: number }, hh: number, mm: number, deslocDias = 0): Date {
  return new Date(Date.UTC(d.ano, d.mes - 1, d.dia + deslocDias, hh - 2, mm));
}

// ---------------------------------------------------------------------------
// Schema — sem base de dados
// ---------------------------------------------------------------------------

describe('RegistarPagamentoFaturaSchema — meio de pagamento (P2)', () => {
  const base = { faturaId: ID_FICTICIO, valor: 100, dataPagamento: new Date() };

  it('S1: sem formaPagamento é recusado', () => {
    const r = RegistarPagamentoFaturaSchema.safeParse(base);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === 'formaPagamento')).toBe(true);
  });

  it('S1: aceita todas as formas de FORMAS_PAGAMENTO e recusa uma forma fora do enum', () => {
    for (const { value } of FORMAS_PAGAMENTO) {
      const r = RegistarPagamentoFaturaSchema.safeParse({
        ...base,
        formaPagamento: value,
        ...(value === 'NUMERARIO' ? {} : { contaBancariaId: 'ccontabancaria00000000001' }),
      });
      expect(r.success, `forma ${value}: ${r.success ? '' : JSON.stringify(r.error.issues)}`).toBe(true);
      if (r.success) expect((r.data as any).formaPagamento).toBe(value);
    }
    const fora = RegistarPagamentoFaturaSchema.safeParse({ ...base, formaPagamento: 'BITCOIN' });
    expect(fora.success).toBe(false);
  });

  it('S2: forma bancária sem contaBancariaId → erro em contaBancariaId com a mensagem da NC', () => {
    for (const forma of ['TRANSFERENCIA_BANCARIA', 'CHEQUE', 'M-PESA', 'E-MOLA']) {
      const r = RegistarPagamentoFaturaSchema.safeParse({ ...base, formaPagamento: forma });
      expect(r.success, `forma ${forma} sem conta passou`).toBe(false);
      if (!r.success) {
        const issue = r.error.issues.find((i) => i.path.join('.') === 'contaBancariaId');
        expect(issue, `forma ${forma}: ${JSON.stringify(r.error.issues)}`).toBeTruthy();
        expect(issue!.message).toBe(MSG_CONTA_OBRIGATORIA);
      }
    }
  });

  it('S2: NUMERARIO sem contaBancariaId é aceite', () => {
    const r = RegistarPagamentoFaturaSchema.safeParse({ ...base, formaPagamento: 'NUMERARIO' });
    expect(r.success, r.success ? '' : JSON.stringify(r.error.issues)).toBe(true);
  });

  it('S3: dataPagamento é dataDocumento — obrigatória, e ano fora do intervalo recusado com o rótulo', () => {
    const { dataPagamento: _omitida, ...semData } = base;
    const sem = RegistarPagamentoFaturaSchema.safeParse({ ...semData, formaPagamento: 'NUMERARIO' });
    expect(sem.success, 'sem dataPagamento devia ser recusado (dataDocumento não tem omissão)').toBe(false);

    const ano92026 = RegistarPagamentoFaturaSchema.safeParse({
      ...base,
      formaPagamento: 'NUMERARIO',
      dataPagamento: '92026-01-01',
    });
    expect(ano92026.success).toBe(false);
    if (!ano92026.success) {
      const issue = ano92026.error.issues.find((i) => i.path[0] === 'dataPagamento');
      expect(issue?.message).toMatch(/Data do pagamento/);
    }
  });

  it('S4: sessaoCaixaId já não faz parte do input (é descartado)', () => {
    const r = RegistarPagamentoFaturaSchema.safeParse({
      ...base,
      formaPagamento: 'NUMERARIO',
      sessaoCaixaId: 'csessaocaixa0000000000001',
    });
    expect(r.success).toBe(true);
    if (r.success) expect('sessaoCaixaId' in (r.data as object)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Serviço — Postgres real
// ---------------------------------------------------------------------------

describe.skipIf(skip)('registarPagamento com lançamento — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let fat: any; // '@/server/services/financas/faturacao.service' — acesso dinâmico (contrato novo)
  let val: typeof import('@/lib/validations/faturacao');
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];
  let NotFoundError: (typeof import('@/lib/errors'))['NotFoundError'];

  const sufixo = Date.now();
  const TENANT = `tenant-fat-pag-${sufixo}`;
  const TENANT_B = `tenant-fat-pag-b-${sufixo}`;
  const USER = `user-fat-pag-${sufixo}`; // tem sessão de caixa aberta
  const USER_SEM_CAIXA = `user-fat-pag-sc-${sufixo}`; // não tem

  const TODAS = ['faturacao:fatura:pagar', 'caixa:operar', 'financas:banca:escrita'];
  const ctx = { tenantId: TENANT, userId: USER, permissions: new Set(TODAS) };
  const ctxSemCaixa = { tenantId: TENANT, userId: USER_SEM_CAIXA, permissions: new Set(TODAS) };
  const ctxB = { tenantId: TENANT_B, userId: USER, permissions: new Set(TODAS) };

  let clienteId: string;
  let contaCorrenteId: string; // CORRENTE → PGC 123
  let sessaoCaixaId: string;

  const HOJE = hojeEmMaputo();
  // Emissão às 10:00 de Maputo de hoje — 1 × 1000 a 16% → 1160,00.
  const EMISSAO = instanteMaputo(HOJE, 10, 0);

  // ── helpers ────────────────────────────────────────────────────────────────

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  async function emitirFatura(dataEmissao: Date = EMISSAO): Promise<{ id: string; numero: string }> {
    const input = val.EmitirFaturaSchema.parse({
      clienteId,
      dataEmissao,
      dataVencimento: new Date(dataEmissao.getTime() + 30 * 86_400_000),
      linhas: [{ descricao: 'Mercadoria', quantidade: 10, precoUnitario: 100, taxaIva: 0.16 }],
    });
    const f = await runCtx(ctx, () => fat.emitirFatura(input, ctx)) as any;
    return { id: f.id, numero: f.numero };
  }

  /** Chama o serviço com o input JÁ no formato novo (sem passar pelo schema). */
  function pagar(input: Record<string, unknown>, c: { tenantId: string; userId: string; permissions?: Set<string> } = ctx) {
    return runCtx(c, () => fat.registarPagamento(input, c));
  }

  const porBanco = (faturaId: string, valor: number, dataPagamento: Date = new Date()) => ({
    faturaId,
    valor,
    dataPagamento,
    formaPagamento: 'TRANSFERENCIA_BANCARIA',
    contaBancariaId: contaCorrenteId,
  });
  const emNumerario = (faturaId: string, valor: number, dataPagamento: Date = new Date()) => ({
    faturaId,
    valor,
    dataPagamento,
    formaPagamento: 'NUMERARIO',
  });

  async function lancamentosDePagamento(faturaId: string) {
    return db.lancamento.findMany({
      where: { tenantId: TENANT, documentoOrigemId: faturaId, origem: 'PAGAMENTO' },
      include: { partidas: { include: { conta: { select: { codigo: true } } } }, diario: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async function movimentosCaixa(faturaId: string) {
    return db.movimentoCaixa.findMany({ where: { tenantId: TENANT, documentoOrigemId: faturaId } });
  }

  /** Fotografia do que uma recusa não pode mudar. */
  async function fotografia(faturaId: string) {
    const f = await db.fatura.findFirst({ where: { id: faturaId } });
    return {
      status: f.status,
      totalPago: String(f.totalPago),
      dataPagamento: f.dataPagamento ? f.dataPagamento.getTime() : null,
      lancamentosPagamento: (await lancamentosDePagamento(faturaId)).length,
      lancamentosOrigemFatura: await db.lancamento.count({ where: { tenantId: TENANT, documentoOrigemId: faturaId } }),
      movimentosCaixa: (await movimentosCaixa(faturaId)).length,
    };
  }

  async function esperarRecusa(faturaId: string, fn: () => Promise<unknown>, codigo: string) {
    const antes = await fotografia(faturaId);
    const e = await capturarErro(fn);
    expect(e, `esperava-se ${codigo} e o pagamento passou`).toBeInstanceOf(BusinessRuleError);
    expect(e.code, String(e?.message)).toBe(codigo);
    expect(await fotografia(faturaId), `a recusa ${codigo} deixou escritas`).toEqual(antes);
    return e;
  }

  function partidasPorConta(l: any): Record<string, { DEBITO: Prisma.Decimal; CREDITO: Prisma.Decimal }> {
    const out: Record<string, { DEBITO: Prisma.Decimal; CREDITO: Prisma.Decimal }> = {};
    for (const p of l.partidas) {
      const k = p.conta.codigo as string;
      out[k] ??= { DEBITO: dec(0), CREDITO: dec(0) };
      out[k][p.tipo as 'DEBITO' | 'CREDITO'] = out[k][p.tipo as 'DEBITO' | 'CREDITO'].plus(dec(p.valor));
    }
    return out;
  }

  function esperarLancamento(
    l: any,
    { faturaId, contaMeio, diario, valor, data }: { faturaId: string; contaMeio: string; diario: string; valor: string; data: Date },
  ) {
    expect(l.origem).toBe('PAGAMENTO');
    expect(l.documentoOrigemId).toBe(faturaId);
    expect(l.documentoOrigemTipo).toBe('Fatura');
    expect(l.diario.tipo).toBe(diario);
    expect(l.status).toBe('LANCADO');
    expect((l.data as Date).getTime()).toBe(data.getTime());
    expect(dec(l.valorTotal).equals(dec(valor))).toBe(true);

    const contas = partidasPorConta(l);
    expect(Object.keys(contas).sort()).toEqual([contaMeio, '411'].sort());
    expect(contas[contaMeio].DEBITO.equals(dec(valor)), `D ${contaMeio}`).toBe(true);
    expect(contas[contaMeio].CREDITO.isZero(), `${contaMeio} sem créditos`).toBe(true);
    expect(contas['411'].CREDITO.equals(dec(valor)), 'C 411').toBe(true);
    expect(contas['411'].DEBITO.isZero(), '411 sem débitos').toBe(true);

    const deb = l.partidas.filter((p: any) => p.tipo === 'DEBITO').reduce((a: Prisma.Decimal, p: any) => a.plus(dec(p.valor)), dec(0));
    const cred = l.partidas.filter((p: any) => p.tipo === 'CREDITO').reduce((a: Prisma.Decimal, p: any) => a.plus(dec(p.valor)), dec(0));
    expect(deb.equals(cred), `ΣD ${deb} ≠ ΣC ${cred}`).toBe(true);
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    fat = await import('@/server/services/financas/faturacao.service');
    val = await import('@/lib/validations/faturacao');
    ({ BusinessRuleError, NotFoundError } = await import('@/lib/errors'));
    const caixa = await import('@/server/services/financas/caixa.service');
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    for (const [id, slug, nuit] of [
      [TENANT, `fat-pag-${sufixo}`, `${sufixo}`.slice(-9)],
      [TENANT_B, `fat-pag-b-${sufixo}`, `${sufixo + 1}`.slice(-9)],
    ]) {
      await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit } });
    }
    for (const [id, nome] of [
      [USER, 'Operador com caixa'],
      [USER_SEM_CAIXA, 'Operador sem caixa'],
    ]) {
      await db.user.create({
        data: { id, tenantId: TENANT, email: `${id}@test.mz`, nome, keycloakSub: `kc-${id}` },
      });
    }
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT_B), { timeout: 60_000 });

    const cliente = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente Pagador',
        tipo: 'JURIDICA',
        nuit: '400000002',
        email: `cliente-pag-${sufixo}@test.mz`,
        telefone: '840000001',
        codigo: `CLI-PAG-${sufixo}`,
      },
    });
    clienteId = cliente.id;

    const pgc123 = await db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo: '123' } });
    expect(pgc123, 'ContaPGC 123 no bootstrap').not.toBeNull();
    const corrente = await db.contaBancaria.create({
      data: {
        tenantId: TENANT,
        banco: 'Banco Oráculo',
        agencia: '0001',
        numeroConta: `CORRENTE-${sufixo}`,
        tipoConta: 'CORRENTE',
        contaContabilId: pgc123.id,
        ativo: true,
      },
    });
    contaCorrenteId = corrente.id;

    const sc: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial: 1000 }, ctx));
    sessaoCaixaId = sc.id;
  });

  // -------------------------------------------------------------------------
  // a. permissão por meio, antes de tudo
  // -------------------------------------------------------------------------

  it('a: NUMERARIO sem caixa:operar → MEIO_PAGAMENTO_SEM_PERMISSAO, nada escrito', async () => {
    const f = await emitirFatura();
    const semCaixa = { ...ctx, permissions: new Set(['faturacao:fatura:pagar', 'financas:banca:escrita']) };
    await esperarRecusa(f.id, () => pagar(emNumerario(f.id, 1160), semCaixa), 'MEIO_PAGAMENTO_SEM_PERMISSAO');
  });

  it('a: forma bancária sem financas:banca:escrita → MEIO_PAGAMENTO_SEM_PERMISSAO, nada escrito', async () => {
    const f = await emitirFatura();
    const semBanca = { ...ctx, permissions: new Set(['faturacao:fatura:pagar', 'caixa:operar']) };
    await esperarRecusa(f.id, () => pagar(porBanco(f.id, 1160), semBanca), 'MEIO_PAGAMENTO_SEM_PERMISSAO');
  });

  it('a: sem ctx.permissions nenhuma → MEIO_PAGAMENTO_SEM_PERMISSAO', async () => {
    const f = await emitirFatura();
    const semPerms = { tenantId: TENANT, userId: USER };
    await esperarRecusa(f.id, () => pagar(porBanco(f.id, 100), semPerms), 'MEIO_PAGAMENTO_SEM_PERMISSAO');
  });

  it('a: a permissão confere-se primeiro — factura inexistente sem permissão recusa pela permissão, não por 404', async () => {
    const semBanca = { ...ctx, permissions: new Set(['faturacao:fatura:pagar']) };
    const e = await capturarErro(() => pagar(porBanco(ID_FICTICIO, 100), semBanca));
    expect(e).toBeInstanceOf(BusinessRuleError);
    expect(e.code).toBe('MEIO_PAGAMENTO_SEM_PERMISSAO');
  });

  // -------------------------------------------------------------------------
  // b. regras que ficam
  // -------------------------------------------------------------------------

  it('b: factura de outro tenant → NotFoundError, factura intacta', async () => {
    const f = await emitirFatura();
    const antes = await fotografia(f.id);
    const e = await capturarErro(() => pagar(porBanco(f.id, 100), ctxB));
    expect(e).toBeInstanceOf(NotFoundError);
    expect(await fotografia(f.id)).toEqual(antes);
  });

  it('b+d: pagamento total por transferência → PAGA, dataPagamento, um lançamento D 123 / C 411, sem caixa', async () => {
    const f = await emitirFatura();
    const dataPag = new Date();

    await pagar(porBanco(f.id, 1160, dataPag));

    const gravada = await db.fatura.findFirst({ where: { id: f.id } });
    expect(gravada.status).toBe('PAGA');
    expect(dec(gravada.totalPago).equals(dec('1160'))).toBe(true);
    expect((gravada.dataPagamento as Date).getTime()).toBe(dataPag.getTime());

    const ls = await lancamentosDePagamento(f.id);
    expect(ls).toHaveLength(1);
    esperarLancamento(ls[0], { faturaId: f.id, contaMeio: '123', diario: 'BANCO', valor: '1160', data: dataPag });

    expect(await movimentosCaixa(f.id)).toHaveLength(0);
  });

  it('b+d: dois parciais → PARCIALMENTE_PAGA e mantém-se; um lançamento por pagamento', async () => {
    const f = await emitirFatura();
    const d1 = new Date();

    await pagar(porBanco(f.id, 300, d1));
    let g = await db.fatura.findFirst({ where: { id: f.id } });
    expect(g.status).toBe('PARCIALMENTE_PAGA');
    expect(dec(g.totalPago).equals(dec('300'))).toBe(true);
    expect(g.dataPagamento).toBeNull();

    const d2 = new Date(d1.getTime() + 1000);
    await pagar(porBanco(f.id, 200.5, d2));
    g = await db.fatura.findFirst({ where: { id: f.id } });
    expect(g.status).toBe('PARCIALMENTE_PAGA');
    expect(dec(g.totalPago).equals(dec('500.5'))).toBe(true);
    expect(g.dataPagamento).toBeNull();

    const ls = await lancamentosDePagamento(f.id);
    expect(ls).toHaveLength(2);
    const porValor = [...ls].sort((x: any, y: any) => Number(x.valorTotal) - Number(y.valorTotal));
    esperarLancamento(porValor[0], { faturaId: f.id, contaMeio: '123', diario: 'BANCO', valor: '200.5', data: d2 });
    esperarLancamento(porValor[1], { faturaId: f.id, contaMeio: '123', diario: 'BANCO', valor: '300', data: d1 });
  });

  it('b: factura PAGA → FATURA_NAO_PAGAVEL, nada escrito', async () => {
    const f = await emitirFatura();
    await pagar(porBanco(f.id, 1160));
    await esperarRecusa(f.id, () => pagar(porBanco(f.id, 1)), 'FATURA_NAO_PAGAVEL');
  });

  // -------------------------------------------------------------------------
  // c. saldo e data
  // -------------------------------------------------------------------------

  it('c: valor acima do pendente → PAGAMENTO_EXCEDE_SALDO; o pendente exacto liquida', async () => {
    const f = await emitirFatura();
    await esperarRecusa(f.id, () => pagar(porBanco(f.id, 1160.01)), 'PAGAMENTO_EXCEDE_SALDO');

    await pagar(porBanco(f.id, 500));
    // Pendente 660,00: um cêntimo acima recusa, o exacto passa a PAGA.
    await esperarRecusa(f.id, () => pagar(porBanco(f.id, 660.01)), 'PAGAMENTO_EXCEDE_SALDO');
    await pagar(porBanco(f.id, 660));

    const g = await db.fatura.findFirst({ where: { id: f.id } });
    expect(g.status).toBe('PAGA');
    expect(dec(g.totalPago).equals(dec('1160'))).toBe(true);
    expect(await lancamentosDePagamento(f.id)).toHaveLength(2);
  });

  it('c: pagamento no dia de Maputo anterior ao da emissão → PAGAMENTO_DATA_ANTERIOR_EMISSAO, nada escrito', async () => {
    const f = await emitirFatura();
    // 23:30 de Maputo da véspera (21:30Z da véspera).
    const vespera = instanteMaputo(HOJE, 23, 30, -1);
    await esperarRecusa(f.id, () => pagar(porBanco(f.id, 100, vespera)), 'PAGAMENTO_DATA_ANTERIOR_EMISSAO');
  });

  it('c: pagamento no próprio dia de Maputo da emissão, a uma hora anterior, é válido (dias civis, não instantes)', async () => {
    const f = await emitirFatura();
    // 00:30 de Maputo de hoje = 22:30Z da véspera em UTC: um dia UTC anterior ao da emissão.
    const madrugada = instanteMaputo(HOJE, 0, 30);
    expect(madrugada.getTime()).toBeLessThan(EMISSAO.getTime());

    await pagar(porBanco(f.id, 100, madrugada));

    const g = await db.fatura.findFirst({ where: { id: f.id } });
    expect(g.status).toBe('PARCIALMENTE_PAGA');
    const ls = await lancamentosDePagamento(f.id);
    expect(ls).toHaveLength(1);
    esperarLancamento(ls[0], { faturaId: f.id, contaMeio: '123', diario: 'BANCO', valor: '100', data: madrugada });
  });

  // -------------------------------------------------------------------------
  // d. numerário: lançamento no diário de caixa + movimento de entrada
  // -------------------------------------------------------------------------

  it('d: numerário → D 111 / C 411 no diário CAIXA e um movimento RECEBIMENTO na sessão aberta do utilizador', async () => {
    const f = await emitirFatura();
    const dataPag = new Date();

    await pagar(emNumerario(f.id, 500, dataPag));

    const g = await db.fatura.findFirst({ where: { id: f.id } });
    expect(g.status).toBe('PARCIALMENTE_PAGA');
    expect(dec(g.totalPago).equals(dec('500'))).toBe(true);

    const ls = await lancamentosDePagamento(f.id);
    expect(ls).toHaveLength(1);
    esperarLancamento(ls[0], { faturaId: f.id, contaMeio: '111', diario: 'CAIXA', valor: '500', data: dataPag });

    const movs = await movimentosCaixa(f.id);
    expect(movs).toHaveLength(1);
    const m = movs[0];
    expect(m.tipo).toBe('RECEBIMENTO');
    expect((MOVIMENTOS_ENTRADA as readonly string[]).includes(m.tipo), 'o movimento tem de ser de entrada').toBe(true);
    expect(m.sessaoCaixaId).toBe(sessaoCaixaId);
    expect(dec(m.valor).equals(dec('500'))).toBe(true);
    expect(m.documentoOrigemTipo).toBe('Fatura');
    expect(m.responsavelId).toBe(USER);
  });

  // -------------------------------------------------------------------------
  // e. recusas do meio não deixam nada
  // -------------------------------------------------------------------------

  it('e: numerário sem sessão de caixa aberta → SESSAO_CAIXA_NECESSARIA, nada escrito', async () => {
    const f = await emitirFatura();
    await esperarRecusa(f.id, () => pagar(emNumerario(f.id, 100), ctxSemCaixa), 'SESSAO_CAIXA_NECESSARIA');
  });

  it('e: conta bancária incompatível com a forma (M-Pesa numa CORRENTE) → recusa, nada escrito', async () => {
    const f = await emitirFatura();
    await esperarRecusa(
      f.id,
      () => pagar({ ...porBanco(f.id, 100), formaPagamento: 'M-PESA' }),
      'CONTA_BANCARIA_INCOMPATIVEL',
    );
  });

  // -------------------------------------------------------------------------
  // G5 — período fechado e factura VENCIDA
  // -------------------------------------------------------------------------

  // Janeiro do ano corrente fechado PELO SERVIÇO (`apurarIva` + `fecharPeriodo`): o período 1
  // não tem anterior, e a sessão de caixa do beforeAll abriu hoje — fora dele. Em Janeiro a
  // sessão cairia dentro do período e o fecho recusaria (SESSAO_CAIXA_ABERTA): salta.
  it.skipIf(HOJE.mes === 1)(
    'G5: pagamento datado num período FECHADO → PERIODO_FECHADO, nada escrito (banco e numerário)',
    async () => {
      const contab = await import('@/server/services/financas/contabilidade.service');
      const iva = await import('@/server/services/financas/apuramento-iva.service');
      const emissaoJaneiro = new Date(Date.UTC(HOJE.ano, 0, 15, 8, 0)); // 15/01 10:00 Maputo
      const f = await emitirFatura(emissaoJaneiro);

      const p1 = await db.periodoContabil.findFirst({
        where: { tenantId: TENANT, codigo: `${HOJE.ano}-01` },
      });
      expect(p1, `período ${HOJE.ano}-01`).not.toBeNull();
      await runCtx(ctx, () => iva.apurarIva({ periodoId: p1.id }, ctx));
      const fecho: any = await runCtx(ctx, () => contab.fecharPeriodo({ id: p1.id }, ctx));
      expect('impedimentos' in fecho ? fecho.impedimentos : [], 'pré-condição: Janeiro fecha').toEqual([]);
      expect((await db.periodoContabil.findFirst({ where: { id: p1.id } })).estado).toBe('FECHADO');

      const diaFechado = new Date(Date.UTC(HOJE.ano, 0, 20, 8, 0)); // 20/01 10:00 Maputo
      await esperarRecusa(f.id, () => pagar(porBanco(f.id, 100, diaFechado)), 'PERIODO_FECHADO');
      await esperarRecusa(f.id, () => pagar(emNumerario(f.id, 100, diaFechado)), 'PERIODO_FECHADO');
      expect((await db.fatura.findFirst({ where: { id: f.id } })).status).toBe('EMITIDA');
    },
  );

  // Vencida pelo serviço (`marcarVencida`) com o vencimento já passado: emitida há 3 dias,
  // vencida há 2. Nos três primeiros dias de Janeiro a emissão cairia no ano anterior: salta.
  it.skipIf(HOJE.mes === 1 && HOJE.dia <= 3)(
    'G5: factura VENCIDA é pagável → PAGA, com o seu lançamento D 123 / C 411',
    async () => {
      const emissao = instanteMaputo(HOJE, 10, 0, -3);
      const input = val.EmitirFaturaSchema.parse({
        clienteId,
        dataEmissao: emissao,
        dataVencimento: instanteMaputo(HOJE, 12, 0, -2),
        linhas: [{ descricao: 'Mercadoria', quantidade: 10, precoUnitario: 100, taxaIva: 0.16 }],
      });
      const f: any = await runCtx(ctx, () => fat.emitirFatura(input, ctx));
      await runCtx(ctx, () => fat.marcarVencida(f.id, ctx));
      expect((await db.fatura.findFirst({ where: { id: f.id } })).status, 'pré-condição: VENCIDA').toBe('VENCIDA');

      const dataPag = new Date();
      await pagar(porBanco(f.id, 1160, dataPag));

      const g = await db.fatura.findFirst({ where: { id: f.id } });
      expect(g.status).toBe('PAGA');
      expect(dec(g.totalPago).equals(dec('1160'))).toBe(true);
      expect((g.dataPagamento as Date).getTime()).toBe(dataPag.getTime());
      const ls = await lancamentosDePagamento(f.id);
      expect(ls).toHaveLength(1);
      esperarLancamento(ls[0], { faturaId: f.id, contaMeio: '123', diario: 'BANCO', valor: '1160', data: dataPag });
      expect(await movimentosCaixa(f.id)).toHaveLength(0);
    },
  );

  it('e: a factura do outro tenant também não ganha lançamento nem movimento', async () => {
    // Coerência global do tenant B: nenhum lançamento de pagamento lá foi criado.
    const n = await db.lancamento.count({ where: { tenantId: TENANT_B, origem: 'PAGAMENTO' } });
    expect(n).toBe(0);
  });
});
