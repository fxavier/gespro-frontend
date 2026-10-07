/**
 * Oráculo #96 — «Marcar como paga» da folha com meio, conta e data de pagamento.
 *
 * Escrito pelo verificador ANTES da implementação; quem implementa não o altera.
 *
 * Contrato (molde: `ContaPagarService.registarPagamento` e o pagamento de factura):
 *   Schema `MarcarPagaSchema` (lib/validations/payroll.ts)
 *     S1 `formaPagamento` obrigatório, do enum de `FORMAS_PAGAMENTO`;
 *     S2 `contaBancariaId` obrigatório fora do NUMERARIO (path `contaBancariaId`, a mesma
 *        mensagem do pagamento de factura);
 *     S3 `dataPagamento` por `dataDocumento` (sem omissão; ano fora do intervalo recusado);
 *     S4 `sessaoCaixaId` deixa de existir (a sessão resolve-se pelo meio).
 *   Serviço `PayrollService.marcarPaga(input, ctx & { permissions })`
 *     a. permissão do meio conferida ANTES de tudo: NUMERARIO → `caixa:operar`, outra
 *        forma → `financas:banca:escrita`; falta → `MEIO_PAGAMENTO_SEM_PERMISSAO`;
 *     b. o meio resolve-se por `resolverContaMeioPagamento` na tx antes de escrever:
 *        numerário sem sessão aberta do utilizador → `SESSAO_CAIXA_NECESSARIA`; conta
 *        inactiva → `CONTA_BANCARIA_INATIVA`; forma bancária sem conta →
 *        `CONTA_BANCARIA_OBRIGATORIA`;
 *     c. `dataPagamento` não pode ser anterior à `dataProcessamento` da folha nem futura
 *        (BusinessRuleError);
 *     d. UM lançamento: D 4622 / C <conta do meio> pelo líquido, diário SALARIOS, origem
 *        PAGAMENTO, documento de origem a folha, data = dataPagamento — nunca 121 à força;
 *        a folha guarda-o em `lancamentoPagamentoId`; folha e payrolls PAGO com a data;
 *     e. em NUMERARIO, um movimento de caixa `PAGAMENTO` (não SANGRIA) na sessão aberta do
 *        utilizador, pelo líquido, com a folha como documento de origem; fora do numerário
 *        nenhum movimento de caixa;
 *     f. qualquer recusa ⇒ nada escrito; folha de outro tenant → NotFoundError.
 *
 * O serviço é chamado por acesso dinâmico (`as any`): contra o contrato antigo cada caso
 * falha sozinho, o ficheiro carrega.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { MarcarPagaSchema } from '@/lib/validations/payroll';
import { FORMAS_PAGAMENTO } from '@/lib/meios-pagamento';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

const dec = (v: unknown) => new Prisma.Decimal(String(v));
const MSG_CONTA_OBRIGATORIA = 'A conta bancária é obrigatória para esta forma de pagamento.';
const ID_FICTICIO = 'cfolhainexistente00000001';
const ANO_REF = 2025; // ano de referência das folhas (não decide datas contabilísticas)

// ---------------------------------------------------------------------------
// Dias civis de Maputo — aritmética própria do oráculo (UTC+2, sem hora de Verão).
// ---------------------------------------------------------------------------

function hojeEmMaputo(): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Maputo' })
    .format(new Date())
    .split('-')
    .map(Number);
  return { ano, mes, dia };
}

function instanteMaputo(d: { ano: number; mes: number; dia: number }, hh: number, mm: number, deslocDias = 0): Date {
  return new Date(Date.UTC(d.ano, d.mes - 1, d.dia + deslocDias, hh - 2, mm));
}

// ---------------------------------------------------------------------------
// Schema — sem base de dados
// ---------------------------------------------------------------------------

describe('MarcarPagaSchema — meio, conta e data (#96)', () => {
  const base = { folhaId: ID_FICTICIO, dataPagamento: new Date() };
  const parse = (v: unknown) => (MarcarPagaSchema as any).safeParse(v);

  it('S1: sem formaPagamento é recusado', () => {
    const r = parse(base);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i: any) => i.path[0] === 'formaPagamento')).toBe(true);
  });

  it('S1: aceita todas as formas de FORMAS_PAGAMENTO e recusa uma forma fora do enum', () => {
    for (const { value } of FORMAS_PAGAMENTO) {
      const r = parse({
        ...base,
        formaPagamento: value,
        ...(value === 'NUMERARIO' ? {} : { contaBancariaId: 'ccontabancaria00000000001' }),
      });
      expect(r.success, `forma ${value}: ${r.success ? '' : JSON.stringify(r.error.issues)}`).toBe(true);
      if (r.success) expect(r.data.formaPagamento).toBe(value);
    }
    expect(parse({ ...base, formaPagamento: 'BITCOIN' }).success).toBe(false);
  });

  it('S2: forma bancária sem contaBancariaId → erro em contaBancariaId com a mensagem da factura', () => {
    for (const forma of ['TRANSFERENCIA_BANCARIA', 'CHEQUE', 'M-PESA', 'E-MOLA']) {
      const r = parse({ ...base, formaPagamento: forma });
      expect(r.success, `forma ${forma} sem conta passou`).toBe(false);
      if (!r.success) {
        const issue = r.error.issues.find((i: any) => i.path.join('.') === 'contaBancariaId');
        expect(issue, `forma ${forma}: ${JSON.stringify(r.error.issues)}`).toBeTruthy();
        expect(issue.message).toBe(MSG_CONTA_OBRIGATORIA);
      }
    }
  });

  it('S2: NUMERARIO sem contaBancariaId é aceite', () => {
    const r = parse({ ...base, formaPagamento: 'NUMERARIO' });
    expect(r.success, r.success ? '' : JSON.stringify(r.error.issues)).toBe(true);
  });

  it('S3: dataPagamento é dataDocumento — obrigatória, e ano fora do intervalo recusado', () => {
    const { dataPagamento: _omitida, ...semData } = base;
    const sem = parse({ ...semData, formaPagamento: 'NUMERARIO' });
    expect(sem.success, 'sem dataPagamento devia ser recusado (dataDocumento não tem omissão)').toBe(false);

    const ano92026 = parse({ ...base, formaPagamento: 'NUMERARIO', dataPagamento: '92026-01-01' });
    expect(ano92026.success).toBe(false);
    if (!ano92026.success) {
      expect(ano92026.error.issues.some((i: any) => i.path[0] === 'dataPagamento')).toBe(true);
    }
  });

  it('S4: sessaoCaixaId já não faz parte do input (é descartado)', () => {
    const r = parse({ ...base, formaPagamento: 'NUMERARIO', sessaoCaixaId: 'csessaocaixa0000000000001' });
    expect(r.success).toBe(true);
    if (r.success) expect('sessaoCaixaId' in (r.data as object)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Serviço — Postgres real
// ---------------------------------------------------------------------------

describe.skipIf(skip)('PayrollService.marcarPaga com meio de pagamento — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let svc: any; // PayrollService — acesso dinâmico (contrato novo)
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];
  let NotFoundError: (typeof import('@/lib/errors'))['NotFoundError'];

  const sufixo = Date.now();
  const TENANT = `tenant-pay-pag-${sufixo}`;
  const TENANT_B = `tenant-pay-pag-b-${sufixo}`;
  const USER = `user-pay-pag-${sufixo}`; // tem sessão de caixa aberta
  const USER_SEM_CAIXA = `user-pay-pag-sc-${sufixo}`;
  const USER_B = `user-pay-pag-b-${sufixo}`;

  const TODAS = ['rh:payroll:pagar', 'caixa:operar', 'financas:banca:escrita'];
  const ctx = { tenantId: TENANT, userId: USER, permissions: new Set(TODAS) };
  const ctxSemCaixa = { tenantId: TENANT, userId: USER_SEM_CAIXA, permissions: new Set(TODAS) };
  const ctxB = { tenantId: TENANT_B, userId: USER_B, permissions: new Set(TODAS) };

  // Colaborador único, salário 10 000, INSS 3%/4%, IRPS 10% plano → líquido 8 730,00.
  const LIQUIDO = '8730';

  let contaCorrenteId: string; // CORRENTE activa → PGC 123
  let contaInactivaId: string;
  let contaCorrenteBId: string; // do TENANT_B
  let sessaoCaixaId: string;
  let folhaRecusas: { id: string };

  const HOJE = hojeEmMaputo();

  // ── helpers ────────────────────────────────────────────────────────────────

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  function pagar(input: Record<string, unknown>, c: { tenantId: string; userId: string; permissions?: Set<string> } = ctx) {
    return runCtx(c, () => svc.marcarPaga(input, c));
  }

  const porBanco = (folhaId: string, dataPagamento: Date = new Date(), contaBancariaId = contaCorrenteId) => ({
    folhaId,
    dataPagamento,
    formaPagamento: 'TRANSFERENCIA_BANCARIA',
    contaBancariaId,
  });
  const emNumerario = (folhaId: string, dataPagamento: Date = new Date()) => ({
    folhaId,
    dataPagamento,
    formaPagamento: 'NUMERARIO',
  });

  async function criarColaborador(tenantId: string, codigo: string, salario: string): Promise<string> {
    const c = await db.colaborador.create({
      data: {
        tenantId,
        codigo,
        nome: `Colaborador ${codigo}`,
        dataNascimento: new Date(Date.UTC(1990, 0, 1)),
        genero: 'MASCULINO',
        estadoCivil: 'SOLTEIRO',
        nacionalidade: 'Moçambicana',
        naturalidadeProvincia: 'Maputo',
        naturalidadeDistrito: 'KaMpfumo',
        bi: `BI${codigo}${sufixo}`,
        nuit: `${codigo}-${sufixo}`,
        email: `${codigo.toLowerCase()}-${sufixo}@test.mz`,
        telefone: '840000000',
        enderecoRua: 'Av. 24 de Julho',
        enderecoNumero: '1',
        enderecoBairro: 'Polana',
        enderecoCidade: 'Maputo',
        enderecoProvincia: 'Maputo',
        emergenciaNome: 'Contacto',
        emergenciaParentesco: 'Irmão',
        emergenciaTelefone: '840000001',
        dataAdmissao: new Date(Date.UTC(2020, 0, 1)),
        status: 'ACTIVO',
        tipoContrato: 'EFECTIVO',
        regimeTrabalho: 'TEMPO_INTEGRAL',
        salarioBase: salario,
        nivelAcesso: 'USUARIO',
      },
    });
    return c.id;
  }

  async function criarTabelas(tenantId: string) {
    await db.tabelaINSS.create({
      data: {
        tenantId,
        vigenciaInicio: new Date(Date.UTC(2018, 0, 1)),
        taxaTrabalhador: '0.03',
        taxaEntidade: '0.04',
        tetoIncidencia: null,
      },
    });
    await db.escalaoIRPS.create({
      data: {
        tenantId,
        vigenciaInicio: new Date(Date.UTC(2020, 0, 1)),
        ordem: 1,
        limiteInferior: '0',
        limiteSuperior: null,
        taxa: '0.10',
        parcelaAbater: '0',
        numeroDependentes: 0,
      },
    });
  }

  async function criarContaBancaria(tenantId: string, nome: string, ativo: boolean): Promise<string> {
    const pgc123 = await db.contaPGC.findFirst({ where: { tenantId, codigo: '123' } });
    expect(pgc123, `ContaPGC 123 no bootstrap de ${tenantId}`).not.toBeNull();
    const c = await db.contaBancaria.create({
      data: {
        tenantId,
        banco: nome,
        agencia: '0001',
        numeroConta: `${nome}-${sufixo}`,
        tipoConta: 'CORRENTE',
        contaContabilId: pgc123.id,
        ativo,
      },
    });
    return c.id;
  }

  /** Processa e contabiliza a folha do mês (serviços reais) → PROCESSADO. */
  async function folhaProcessada(mes: number, c: typeof ctx = ctx): Promise<{ id: string }> {
    const r: any = await runCtx(c, () => svc.processarFolhaMes({ mes, ano: ANO_REF }, c));
    await runCtx(c, () => svc.marcarProcessada(r.folhaId, c));
    const f = await db.folhaPagamento.findFirst({ where: { id: r.folhaId } });
    expect(f.status).toBe('PROCESSADO');
    expect(dec(f.totalLiquido).equals(dec(LIQUIDO)), `líquido ${f.totalLiquido}`).toBe(true);
    return { id: f.id };
  }

  async function lancamentosDePagamento(folhaId: string) {
    return db.lancamento.findMany({
      where: { documentoOrigemId: folhaId, origem: 'PAGAMENTO' },
      include: { partidas: { include: { conta: { select: { codigo: true } } } }, diario: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async function movimentosCaixa(folhaId: string) {
    return db.movimentoCaixa.findMany({ where: { documentoOrigemId: folhaId } });
  }

  async function fotografia(folhaId: string) {
    const f = await db.folhaPagamento.findFirst({ where: { id: folhaId } });
    const ps = await db.payroll.findMany({ where: { folhaId }, orderBy: { id: 'asc' } });
    return {
      status: f.status,
      dataPagamento: f.dataPagamento ? f.dataPagamento.getTime() : null,
      lancamentoPagamentoId: f.lancamentoPagamentoId,
      payrolls: ps.map((p: any) => [p.status, p.dataPagamento ? p.dataPagamento.getTime() : null]),
      lancamentosPagamento: (await lancamentosDePagamento(folhaId)).length,
      movimentosCaixa: (await movimentosCaixa(folhaId)).length,
    };
  }

  async function esperarRecusa(folhaId: string, fn: () => Promise<unknown>, codigo?: string) {
    const antes = await fotografia(folhaId);
    const e = await capturarErro(fn);
    expect(e, `esperava-se ${codigo ?? 'uma recusa de regra'} e o pagamento passou`).toBeInstanceOf(BusinessRuleError);
    if (codigo) expect(e.code, String(e?.message)).toBe(codigo);
    expect(await fotografia(folhaId), `a recusa ${codigo ?? e?.code} deixou escritas`).toEqual(antes);
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

  async function esperarPaga(folhaId: string, { contaMeio, data }: { contaMeio: string; data: Date }) {
    const f = await db.folhaPagamento.findFirst({ where: { id: folhaId } });
    expect(f.status).toBe('PAGO');
    expect((f.dataPagamento as Date).getTime(), 'folha.dataPagamento = a data escolhida').toBe(data.getTime());

    const ps = await db.payroll.findMany({ where: { folhaId } });
    expect(ps.length).toBeGreaterThan(0);
    for (const p of ps) {
      expect(p.status).toBe('PAGO');
      expect((p.dataPagamento as Date).getTime(), 'payroll.dataPagamento = a data escolhida').toBe(data.getTime());
    }

    const ls = await lancamentosDePagamento(folhaId);
    expect(ls).toHaveLength(1);
    const l = ls[0];
    expect(f.lancamentoPagamentoId, 'a folha guarda o lançamento do pagamento').toBe(l.id);
    expect(l.tenantId).toBe(TENANT);
    expect(l.origem).toBe('PAGAMENTO');
    expect(l.documentoOrigemTipo).toBe('FolhaPagamento');
    expect(l.diario.tipo, 'o diário mantém-se SALARIOS').toBe('SALARIOS');
    expect(l.status).toBe('LANCADO');
    expect((l.data as Date).getTime(), 'lançamento na data do pagamento, não na de hoje').toBe(data.getTime());

    const contas = partidasPorConta(l);
    expect(Object.keys(contas).sort(), 'só 4622 e a conta do meio').toEqual(['4622', contaMeio].sort());
    expect(contas['4622'].DEBITO.equals(dec(LIQUIDO)), 'D 4622 pelo líquido').toBe(true);
    expect(contas['4622'].CREDITO.isZero()).toBe(true);
    expect(contas[contaMeio].CREDITO.equals(dec(LIQUIDO)), `C ${contaMeio} pelo líquido`).toBe(true);
    expect(contas[contaMeio].DEBITO.isZero()).toBe(true);
    return l;
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ PayrollService: svc } = await import('@/server/services/pessoas-projetos/payroll.service'));
    ({ BusinessRuleError, NotFoundError } = await import('@/lib/errors'));
    const caixa = await import('@/server/services/financas/caixa.service');
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    for (const [id, slug, nuit] of [
      [TENANT, `pay-pag-${sufixo}`, `${sufixo}`.slice(-9)],
      [TENANT_B, `pay-pag-b-${sufixo}`, `${sufixo + 1}`.slice(-9)],
    ]) {
      await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit } });
    }
    for (const [id, tenantId, nome] of [
      [USER, TENANT, 'RH com caixa'],
      [USER_SEM_CAIXA, TENANT, 'RH sem caixa'],
      [USER_B, TENANT_B, 'RH outro tenant'],
    ]) {
      await db.user.create({
        data: { id, tenantId, email: `${id}@test.mz`, nome, keycloakSub: `kc-${id}` },
      });
    }
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT_B), { timeout: 60_000 });

    await criarTabelas(TENANT);
    await criarColaborador(TENANT, 'PPA', '10000');

    contaCorrenteId = await criarContaBancaria(TENANT, 'BancoOraculo', true);
    contaInactivaId = await criarContaBancaria(TENANT, 'BancoFechado', false);
    contaCorrenteBId = await criarContaBancaria(TENANT_B, 'BancoOutroTenant', true);

    const sc: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial: 1000 }, ctx));
    sessaoCaixaId = sc.id;

    // Folha para os casos de recusa (nenhum a pode consumir), processada «há dois dias».
    folhaRecusas = await folhaProcessada(1);
    await db.folhaPagamento.update({
      where: { id: folhaRecusas.id },
      data: { dataProcessamento: instanteMaputo(HOJE, 9, 0, -2) },
    });
  }, 180_000);

  // -------------------------------------------------------------------------
  // a. permissão do meio, antes de tudo
  // -------------------------------------------------------------------------

  it('a: NUMERARIO sem caixa:operar → MEIO_PAGAMENTO_SEM_PERMISSAO, nada escrito', async () => {
    const semCaixa = { ...ctx, permissions: new Set(['rh:payroll:pagar', 'financas:banca:escrita']) };
    await esperarRecusa(folhaRecusas.id, () => pagar(emNumerario(folhaRecusas.id), semCaixa), 'MEIO_PAGAMENTO_SEM_PERMISSAO');
  });

  it('a: forma bancária sem financas:banca:escrita → MEIO_PAGAMENTO_SEM_PERMISSAO, nada escrito', async () => {
    const semBanca = { ...ctx, permissions: new Set(['rh:payroll:pagar', 'caixa:operar']) };
    await esperarRecusa(folhaRecusas.id, () => pagar(porBanco(folhaRecusas.id), semBanca), 'MEIO_PAGAMENTO_SEM_PERMISSAO');
  });

  it('a: sem ctx.permissions → MEIO_PAGAMENTO_SEM_PERMISSAO', async () => {
    const semPerms = { tenantId: TENANT, userId: USER };
    await esperarRecusa(folhaRecusas.id, () => pagar(porBanco(folhaRecusas.id), semPerms), 'MEIO_PAGAMENTO_SEM_PERMISSAO');
  });

  it('a: a permissão confere-se primeiro — folha inexistente sem permissão recusa pela permissão, não por 404', async () => {
    const semBanca = { ...ctx, permissions: new Set(['rh:payroll:pagar']) };
    const e = await capturarErro(() => pagar(porBanco(ID_FICTICIO), semBanca));
    expect(e).toBeInstanceOf(BusinessRuleError);
    expect(e.code).toBe('MEIO_PAGAMENTO_SEM_PERMISSAO');
  });

  // -------------------------------------------------------------------------
  // b. o meio resolve-se antes de escrever
  // -------------------------------------------------------------------------

  it('b: NUMERARIO sem sessão de caixa aberta do utilizador → SESSAO_CAIXA_NECESSARIA, nada escrito', async () => {
    await esperarRecusa(
      folhaRecusas.id,
      () => pagar(emNumerario(folhaRecusas.id), ctxSemCaixa),
      'SESSAO_CAIXA_NECESSARIA',
    );
  });

  it('b: conta bancária inactiva → CONTA_BANCARIA_INATIVA, nada escrito', async () => {
    await esperarRecusa(
      folhaRecusas.id,
      () => pagar(porBanco(folhaRecusas.id, new Date(), contaInactivaId)),
      'CONTA_BANCARIA_INATIVA',
    );
  });

  it('b: forma bancária sem conta (fora do schema) → CONTA_BANCARIA_OBRIGATORIA, nada escrito', async () => {
    await esperarRecusa(
      folhaRecusas.id,
      () => pagar({ folhaId: folhaRecusas.id, dataPagamento: new Date(), formaPagamento: 'CHEQUE' }),
      'CONTA_BANCARIA_OBRIGATORIA',
    );
  });

  // -------------------------------------------------------------------------
  // c. data do pagamento
  // -------------------------------------------------------------------------

  // Folha própria por caso: a recusa não pode depender de outra ter deixado a folha noutro estado.
  async function folhaProcessadaHaDoisDias(mes: number) {
    const f = await folhaProcessada(mes);
    await db.folhaPagamento.update({ where: { id: f.id }, data: { dataProcessamento: instanteMaputo(HOJE, 9, 0, -2) } });
    return f;
  }

  it('c: data anterior à do processamento da folha → recusa, nada escrito', async () => {
    const f = await folhaProcessadaHaDoisDias(7);
    // processada às 09:00 de HOJE-2; pagar às 10:00 de HOJE-3
    await esperarRecusa(f.id, () => pagar(porBanco(f.id, instanteMaputo(HOJE, 10, 0, -3))));
    // e a mesma folha, com uma data válida, paga-se (a recusa foi pela data, não pela folha)
    const valida = instanteMaputo(HOJE, 10, 0, -1);
    await pagar(porBanco(f.id, valida));
    await esperarPaga(f.id, { contaMeio: '123', data: valida });
  });

  it('c: data futura (amanhã em Maputo) → recusa, nada escrito', async () => {
    const f = await folhaProcessadaHaDoisDias(8);
    await esperarRecusa(f.id, () => pagar(porBanco(f.id, instanteMaputo(HOJE, 10, 0, 1))));
  });

  // -------------------------------------------------------------------------
  // f. estado e isolamento
  // -------------------------------------------------------------------------

  it('f: folha de outro tenant → NotFoundError, folha intacta', async () => {
    const antes = await fotografia(folhaRecusas.id);
    const e = await capturarErro(() => pagar(porBanco(folhaRecusas.id, new Date(), contaCorrenteBId), ctxB));
    expect(e).toBeInstanceOf(NotFoundError);
    expect(await fotografia(folhaRecusas.id)).toEqual(antes);
  });

  it('f: folha ainda PENDENTE não se paga, nada escrito', async () => {
    const r: any = await runCtx(ctx, () => svc.processarFolhaMes({ mes: 12, ano: ANO_REF }, ctx));
    const e = await capturarErro(() => pagar(porBanco(r.folhaId)));
    expect(e, 'pagar uma folha PENDENTE passou').toBeDefined();
    const f = await db.folhaPagamento.findFirst({ where: { id: r.folhaId } });
    expect(f.status).toBe('PENDENTE');
    expect(f.lancamentoPagamentoId).toBeNull();
    expect(await lancamentosDePagamento(r.folhaId)).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // d/e. pagamentos com sucesso
  // -------------------------------------------------------------------------

  it('d: transferência bancária → D 4622 / C 123 (a conta do meio, não 121), SALARIOS, sem movimento de caixa', async () => {
    const folha = await folhaProcessada(2);
    const dataPag = new Date();

    await pagar(porBanco(folha.id, dataPag));

    await esperarPaga(folha.id, { contaMeio: '123', data: dataPag });
    expect(await movimentosCaixa(folha.id), 'pagamento bancário não toca a caixa').toHaveLength(0);
  });

  it('d+e: numerário → D 4622 / C 111, e movimento PAGAMENTO (não SANGRIA) na sessão do utilizador', async () => {
    const folha = await folhaProcessada(3);
    const dataPag = new Date();

    await pagar(emNumerario(folha.id, dataPag));

    await esperarPaga(folha.id, { contaMeio: '111', data: dataPag });

    const movs = await movimentosCaixa(folha.id);
    expect(movs).toHaveLength(1);
    const m = movs[0];
    expect(m.tipo).toBe('PAGAMENTO');
    expect(m.sessaoCaixaId).toBe(sessaoCaixaId);
    expect(m.tenantId).toBe(TENANT);
    expect(dec(m.valor).equals(dec(LIQUIDO)), `movimento pelo líquido (${m.valor})`).toBe(true);
    expect(m.documentoOrigemTipo).toBe('FolhaPagamento');

    const sangrias = await db.movimentoCaixa.count({ where: { tenantId: TENANT, tipo: 'SANGRIA' } });
    expect(sangrias, 'o pagamento de salários nunca é sangria').toBe(0);
  });

  it('d: pagamento retroactivo (depois do processamento, antes de hoje) → lançamento na data escolhida', async () => {
    const folha = await folhaProcessada(4);
    await db.folhaPagamento.update({
      where: { id: folha.id },
      data: { dataProcessamento: instanteMaputo(HOJE, 9, 0, -3) },
    });
    const dataPag = instanteMaputo(HOJE, 10, 0, -2);

    await pagar(porBanco(folha.id, dataPag));

    await esperarPaga(folha.id, { contaMeio: '123', data: dataPag });
  });

  it('f: uma folha PAGO não se paga duas vezes', async () => {
    const folha = await folhaProcessada(6);
    await pagar(porBanco(folha.id));
    const antes = await fotografia(folha.id);
    const e = await capturarErro(() => pagar(porBanco(folha.id)));
    expect(e, 'segundo pagamento passou').toBeDefined();
    expect(await fotografia(folha.id)).toEqual(antes);
  });
});
