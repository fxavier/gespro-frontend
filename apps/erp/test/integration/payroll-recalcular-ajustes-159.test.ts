/**
 * Oráculo #159 — recalcular payroll e ajustes manuais (comportamento do serviço que a UI liga).
 *
 * Contra Postgres real (Testcontainers). Contrato:
 *   (A) `ajustarLinhaManual` grava uma linha `manual: true` (provento ou desconto, com a
 *       descrição/motivo dada) num payroll PENDENTE e recalcula os valores estatutários na
 *       mesma transacção: um provento entra no bruto e na base de INSS/IRPS; um desconto
 *       reduz o líquido.
 *   (R) `recalcularPayroll` PRESERVA as linhas manuais: mesmas linhas (mesmos ids), mesmos
 *       tipo/natureza/descrição/valor, sem duplicar — e os totais continuam a reflecti-las.
 *       Recalcular duas vezes dá o mesmo resultado.
 *   (I) Só PENDENTE: noutro estado recalcular e ajustar recusam com `PAYROLL_IMUTAVEL` e não
 *       tocam em nada.
 *   (N) Um desconto que tornaria o líquido negativo recusa com `LIQUIDO_NEGATIVO` e a linha
 *       não fica gravada.
 *   (T) Cross-tenant: recalcular/ajustar o payroll de outro tenant → NotFound, nada muda.
 *
 * Tabelas fiscais (planas): INSS 3% trabalhador / 4% entidade, sem tecto; IRPS escalão único
 * 10%, parcela 0. Colaborador (salário 10 000), Agosto/2026:
 *   processado:          bruto 10 000 · INSS 300 · IRPS 970 · líquido 8 730
 *   + bónus 1 000:       bruto 11 000 · INSS 330 · IRPS 1 067 · líquido 9 603
 *   + adiantamento 500:  líquido 9 103 (bruto, INSS e IRPS inalterados)
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

const MES = 8;
const ANO = 2026;

describe.skipIf(skip)('#159 — recalcular payroll preserva ajustes manuais — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let svc: any; // PayrollService

  const sufixo = Date.now();
  const TENANT = `tenant-pay-rec-${sufixo}`;
  const TENANT_B = `tenant-pay-rec-b-${sufixo}`;
  const USER = `user-pay-rec-${sufixo}`;
  const USER_B = `user-pay-rec-b-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const ctxB = { tenantId: TENANT_B, userId: USER_B };

  let colA: string;
  let payrollId: string;

  const noCtx = <T>(c: typeof ctx, fn: () => Promise<T>) => runCtx(c, fn);
  const s = (v: unknown) => (v == null ? null : String(Number(String(v)).toFixed(2)));

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
        vigenciaInicio: new Date(Date.UTC(2024, 0, 1)),
        ordem: 1,
        limiteInferior: '0',
        limiteSuperior: null,
        taxa: '0.10',
        parcelaAbater: '0',
        numeroDependentes: 0,
      },
    });
  }

  async function payroll(id = payrollId) {
    const p = await db.payroll.findFirst({ where: { id }, include: { linhas: true } });
    expect(p, `payroll ${id}`).not.toBeNull();
    return p as any;
  }

  const manuais = (p: any) =>
    (p.linhas as any[])
      .filter((l) => l.manual)
      .map((l) => ({ id: l.id, tipo: l.tipo, natureza: l.natureza, descricao: l.descricao, valor: s(l.valor) }))
      .sort((a, b) => a.descricao.localeCompare(b.descricao));

  const totais = (p: any) => ({
    bruto: s(p.salarioBruto),
    inss: s(p.descontoInss),
    irps: s(p.descontoIrps),
    liquido: s(p.salarioLiquido),
    status: p.status,
  });

  async function rejeicao(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    throw new Error('esperava-se que a operação recusasse, mas passou');
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ PayrollService: svc } = await import('@/server/services/pessoas-projetos/payroll.service'));

    for (const [id, user, n] of [
      [TENANT, USER, 0],
      [TENANT_B, USER_B, 1],
    ] as const) {
      await db.tenant.create({
        data: { id, nome: `Tenant payroll rec ${n}`, slug: `pay-rec-${n}-${sufixo}`, nuit: `${sufixo + n}`.slice(-9) },
      });
      await db.user.create({
        data: {
          id: user,
          tenantId: id,
          email: `pay-rec-${n}-${sufixo}@test.mz`,
          nome: 'Utilizador payroll',
          keycloakSub: `kc-pay-rec-${n}-${sufixo}`,
        },
      });
      await criarTabelas(id);
    }

    colA = await criarColaborador(TENANT, 'PRA', '10000');
    await noCtx(ctx, () => svc.processarFolhaMes({ mes: MES, ano: ANO }, ctx));
    const p = await db.payroll.findFirst({
      where: { tenantId: TENANT, colaboradorId: colA, anoReferencia: ANO, mesReferencia: MES },
    });
    expect(p, 'payroll do colaborador PRA').not.toBeNull();
    payrollId = p.id;
  });

  // -------------------------------------------------------------------------
  // (A) ajustes manuais
  // -------------------------------------------------------------------------

  it('o payroll processado nasce PENDENTE e sem linhas manuais', async () => {
    const p = await payroll();
    expect(totais(p)).toEqual({ bruto: '10000.00', inss: '300.00', irps: '970.00', liquido: '8730.00', status: 'PENDENTE' });
    expect(manuais(p)).toEqual([]);
  });

  it('ajuste PROVENTO (bónus com motivo) grava linha manual e entra no bruto e na base de INSS/IRPS', async () => {
    await noCtx(ctx, () =>
      svc.ajustarLinhaManual(
        { payrollId, tipo: 'PROVENTO', natureza: 'BONUS', descricao: 'Bónus de desempenho', valor: 1000 },
        ctx,
      ),
    );
    const p = await payroll();
    expect(totais(p)).toEqual({ bruto: '11000.00', inss: '330.00', irps: '1067.00', liquido: '9603.00', status: 'PENDENTE' });
    expect(manuais(p).map(({ id: _id, ...r }) => r)).toEqual([
      { tipo: 'PROVENTO', natureza: 'BONUS', descricao: 'Bónus de desempenho', valor: '1000.00' },
    ]);
  });

  it('ajuste DESCONTO (adiantamento com motivo) reduz só o líquido', async () => {
    await noCtx(ctx, () =>
      svc.ajustarLinhaManual(
        { payrollId, tipo: 'DESCONTO', natureza: 'ADIANTAMENTO', descricao: 'Adiantamento de Agosto', valor: 500 },
        ctx,
      ),
    );
    const p = await payroll();
    expect(totais(p)).toEqual({ bruto: '11000.00', inss: '330.00', irps: '1067.00', liquido: '9103.00', status: 'PENDENTE' });
    expect(manuais(p)).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // (R) recalcular preserva as linhas manuais
  // -------------------------------------------------------------------------

  it('recalcularPayroll não apaga nem altera as linhas manuais (mesmos ids e valores) e mantém os totais', async () => {
    const antes = await payroll();
    const manuaisAntes = manuais(antes);
    const nLinhasAntes = (antes.linhas as any[]).length;

    await noCtx(ctx, () => svc.recalcularPayroll(payrollId, ctx));

    const depois = await payroll();
    expect(manuais(depois), 'linhas manuais intactas (ids incluídos)').toEqual(manuaisAntes);
    expect((depois.linhas as any[]).length, 'nenhuma linha duplicada nem perdida').toBe(nLinhasAntes);
    expect(totais(depois)).toEqual({ bruto: '11000.00', inss: '330.00', irps: '1067.00', liquido: '9103.00', status: 'PENDENTE' });

    const descricoesCalculadas = (depois.linhas as any[]).filter((l) => !l.manual).map((l) => l.descricao);
    expect(descricoesCalculadas, 'o ajuste não reaparece como linha calculada').not.toContain('Bónus de desempenho');
    expect(descricoesCalculadas).not.toContain('Adiantamento de Agosto');
  });

  it('recalcular duas vezes é idempotente', async () => {
    await noCtx(ctx, () => svc.recalcularPayroll(payrollId, ctx));
    const a = await payroll();
    await noCtx(ctx, () => svc.recalcularPayroll(payrollId, ctx));
    const b = await payroll();
    expect(totais(b)).toEqual(totais(a));
    expect(manuais(b)).toEqual(manuais(a));
    expect((b.linhas as any[]).length).toBe((a.linhas as any[]).length);
  });

  it('recalcular reflecte uma alteração do salário-base sem perder os ajustes', async () => {
    await db.colaborador.update({ where: { id: colA }, data: { salarioBase: '12000' } });
    try {
      await noCtx(ctx, () => svc.recalcularPayroll(payrollId, ctx));
      const p = await payroll();
      // bruto 12 000 + 1 000 = 13 000 · INSS 390 · IRPS 10% × 12 610 = 1 261 · líquido 13 000 − 390 − 1 261 − 500
      expect(totais(p)).toEqual({ bruto: '13000.00', inss: '390.00', irps: '1261.00', liquido: '10849.00', status: 'PENDENTE' });
      expect(manuais(p)).toHaveLength(2);
    } finally {
      await db.colaborador.update({ where: { id: colA }, data: { salarioBase: '10000' } });
      await noCtx(ctx, () => svc.recalcularPayroll(payrollId, ctx));
    }
  });

  // -------------------------------------------------------------------------
  // (N) líquido negativo
  // -------------------------------------------------------------------------

  it('desconto que tornaria o líquido negativo recusa com LIQUIDO_NEGATIVO e não grava a linha', async () => {
    const antes = await payroll();
    const e = await rejeicao(() =>
      noCtx(ctx, () =>
        svc.ajustarLinhaManual(
          { payrollId, tipo: 'DESCONTO', natureza: 'PENHORA', descricao: 'Penhora impossível', valor: 99999999 },
          ctx,
        ),
      ),
    );
    expect(e?.code).toBe('LIQUIDO_NEGATIVO');
    const depois = await payroll();
    expect(manuais(depois)).toEqual(manuais(antes));
    expect(totais(depois)).toEqual(totais(antes));
  });

  // -------------------------------------------------------------------------
  // (T) cross-tenant
  // -------------------------------------------------------------------------

  it('outro tenant não recalcula nem ajusta este payroll (NotFound) e nada muda', async () => {
    const antes = await payroll();
    const e1 = await rejeicao(() => noCtx(ctxB, () => svc.recalcularPayroll(payrollId, ctxB)));
    expect(e1?.name ?? e1?.constructor?.name).toMatch(/NotFound/);
    const e2 = await rejeicao(() =>
      noCtx(ctxB, () =>
        svc.ajustarLinhaManual(
          { payrollId, tipo: 'PROVENTO', natureza: 'BONUS', descricao: 'Intruso', valor: 1 },
          ctxB,
        ),
      ),
    );
    expect(e2?.name ?? e2?.constructor?.name).toMatch(/NotFound/);
    const depois = await payroll();
    expect(manuais(depois)).toEqual(manuais(antes));
    expect(totais(depois)).toEqual(totais(antes));
  });

  // -------------------------------------------------------------------------
  // (I) só PENDENTE
  // -------------------------------------------------------------------------

  it('fora de PENDENTE recalcular e ajustar recusam com PAYROLL_IMUTAVEL e não tocam em nada', async () => {
    await db.payroll.update({ where: { id: payrollId }, data: { status: 'PROCESSADO' } });
    const antes = await payroll();

    const e1 = await rejeicao(() => noCtx(ctx, () => svc.recalcularPayroll(payrollId, ctx)));
    expect(e1?.code).toBe('PAYROLL_IMUTAVEL');
    const e2 = await rejeicao(() =>
      noCtx(ctx, () =>
        svc.ajustarLinhaManual(
          { payrollId, tipo: 'PROVENTO', natureza: 'BONUS', descricao: 'Tarde demais', valor: 1 },
          ctx,
        ),
      ),
    );
    expect(e2?.code).toBe('PAYROLL_IMUTAVEL');

    const depois = await payroll();
    expect(manuais(depois)).toEqual(manuais(antes));
    expect(totais(depois)).toEqual(totais(antes));
    expect(depois.status).toBe('PROCESSADO');
  });
});
