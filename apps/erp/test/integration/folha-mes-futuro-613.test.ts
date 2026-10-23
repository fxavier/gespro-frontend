/**
 * Teste de integração — Folha de pagamento: mês de referência futuro (#613)
 *
 * Depois do #569 a folha lança no último dia do mês de referência. `processarFolhaMes`
 * aceitava qualquer `ano/mes` que o Zod deixasse passar (2020..2100): uma folha de 2030
 * processada hoje abria o exercício de 2030 e lançava gastos no futuro.
 *
 * Contrato:
 *   (a) referência posterior ao mês civil corrente de Maputo → `BusinessRuleError`
 *       `MES_REFERENCIA_FUTURO`; nada escrito (folha, payrolls) e nenhum exercício criado;
 *   (b) o mês corrente de Maputo continua permitido — e o mês corrente é o de Maputo,
 *       não o de UTC: às 22h30 UTC de 31/10 já é Novembro em Maputo (Novembro passa),
 *       às 21h30 UTC ainda é Outubro (Novembro é recusado);
 *   (c) meses passados continuam a processar.
 *
 * Setup no molde de `folha-data-referencia-569.test.ts`.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true ou sem INTEGRATION_DB_URL → saltado.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

// 31/10/2026 22h30 UTC = 01/11/2026 00h30 em Maputo (UTC+2): o mês corrente é Novembro.
const VIRAGEM_JA_NOVEMBRO = new Date(Date.UTC(2026, 9, 31, 22, 30));
// 31/10/2026 21h30 UTC = 31/10/2026 23h30 em Maputo: ainda é Outubro.
const VIRAGEM_AINDA_OUTUBRO = new Date(Date.UTC(2026, 9, 31, 21, 30));

describe.skipIf(skip)('Folha de pagamento — mês de referência futuro (#613)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let svc: any;

  const sufixo = Date.now();
  const TENANT = `tenant-folha-fut-${sufixo}`;
  const USER = `user-folha-fut-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };

  const run = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  function relogio(instante: Date) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(instante);
  }

  async function processar(mes: number, ano: number): Promise<any> {
    try {
      return await run(() => svc.processarFolhaMes({ mes, ano }, ctx));
    } catch (e) {
      return { erro: e };
    }
  }

  async function esperarRecusa(mes: number, ano: number) {
    const exerciciosAntes = await db.exercicioContabil.count({ where: { tenantId: TENANT } });
    const payrollsAntes = await db.payroll.count({ where: { tenantId: TENANT } });

    const r = await processar(mes, ano);
    expect(r.erro?.name, String(r.erro?.message ?? JSON.stringify(r))).toBe('BusinessRuleError');
    expect(r.erro.code).toBe('MES_REFERENCIA_FUTURO');

    expect(
      await db.folhaPagamento.count({ where: { tenantId: TENANT, anoReferencia: ano, mesReferencia: mes } }),
    ).toBe(0);
    expect(await db.payroll.count({ where: { tenantId: TENANT } })).toBe(payrollsAntes);
    expect(await db.exercicioContabil.count({ where: { tenantId: TENANT } })).toBe(exerciciosAntes);
    expect(await db.exercicioContabil.count({ where: { tenantId: TENANT, codigo: String(ano) } })).toBe(0);
  }

  async function esperarProcessada(mes: number, ano: number) {
    const r = await processar(mes, ano);
    expect(r.erro, String(r.erro?.message)).toBeUndefined();
    expect(r.folhaId).toBeTruthy();
    const f = await db.folhaPagamento.findFirst({ where: { id: r.folhaId } });
    expect(f.anoReferencia).toBe(ano);
    expect(f.mesReferencia).toBe(mes);
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ PayrollService: svc } = await import('@/server/services/pessoas-projetos/payroll.service'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant Folha Futura', slug: `folha-fut-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `${USER}@test.mz`, nome: 'RH', keycloakSub: `kc-${USER}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    await db.tabelaINSS.create({
      data: { tenantId: TENANT, vigenciaInicio: new Date(Date.UTC(2018, 0, 1)), taxaTrabalhador: '0.03', taxaEntidade: '0.04', tetoIncidencia: null },
    });
    await db.escalaoIRPS.create({
      data: {
        tenantId: TENANT, vigenciaInicio: new Date(Date.UTC(2020, 0, 1)), ordem: 1,
        limiteInferior: '0', limiteSuperior: null, taxa: '0.10', parcelaAbater: '0', numeroDependentes: 0,
      },
    });
    await db.colaborador.create({
      data: {
        tenantId: TENANT, codigo: 'FF1', nome: 'Colaborador FF1',
        dataNascimento: new Date(Date.UTC(1990, 0, 1)), genero: 'MASCULINO', estadoCivil: 'SOLTEIRO',
        nacionalidade: 'Moçambicana', naturalidadeProvincia: 'Maputo', naturalidadeDistrito: 'KaMpfumo',
        bi: `BIFF1${sufixo}`, nuit: `FF1-${sufixo}`, email: `ff1-${sufixo}@test.mz`, telefone: '840000000',
        enderecoRua: 'Av. 24 de Julho', enderecoNumero: '1', enderecoBairro: 'Polana',
        enderecoCidade: 'Maputo', enderecoProvincia: 'Maputo',
        emergenciaNome: 'Contacto', emergenciaParentesco: 'Irmão', emergenciaTelefone: '840000001',
        dataAdmissao: new Date(Date.UTC(2020, 0, 1)), status: 'ACTIVO', tipoContrato: 'EFECTIVO',
        regimeTrabalho: 'TEMPO_INTEGRAL', salarioBase: '10000', nivelAcesso: 'USUARIO',
      },
    });
  }, 180_000);

  it('(a) mês seguinte ao corrente de Maputo → MES_REFERENCIA_FUTURO, nada escrito', async () => {
    relogio(VIRAGEM_JA_NOVEMBRO);
    await esperarRecusa(12, 2026);
  }, 60_000);

  it('(a) ano seguinte → MES_REFERENCIA_FUTURO e nenhum exercício desse ano', async () => {
    relogio(VIRAGEM_JA_NOVEMBRO);
    await esperarRecusa(1, 2027);
    await esperarRecusa(6, 2030);
  }, 60_000);

  it('(b) 23h30 de 31/10 em Maputo: Novembro ainda é futuro', async () => {
    relogio(VIRAGEM_AINDA_OUTUBRO);
    await esperarRecusa(11, 2026);
  }, 60_000);

  it('(b) 00h30 de 01/11 em Maputo (22h30 UTC de 31/10): Novembro é o mês corrente e processa', async () => {
    relogio(VIRAGEM_JA_NOVEMBRO);
    await esperarProcessada(11, 2026);
  }, 60_000);

  it('(c) meses passados continuam a processar', async () => {
    relogio(VIRAGEM_JA_NOVEMBRO);
    await esperarProcessada(10, 2026);
    await esperarProcessada(3, 2025);
  }, 60_000);
});
