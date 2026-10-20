/**
 * Teste de integração — Folha de pagamento: lançamento no mês de referência (#569)
 *
 * `marcarProcessada` lançava a massa salarial com `new Date()`: a folha de Dezembro
 * processada em Janeiro caía no exercício seguinte e a DRE do ano ficava sem os
 * salários de Dezembro.
 *
 * Contrato:
 *   (a) a folha de um mês passado, processada hoje, lança no período desse mês, no
 *       último dia civil de Maputo do mês;
 *   (b) a folha de Dezembro lança no período 12, nunca no 13 (encerramento);
 *   (c) período de referência fechado → `BusinessRuleError` `PERIODO_FECHADO`, e nada
 *       muda: nem lançamento, nem estado da folha ou dos payrolls.
 *
 * Setup no molde de `folha-pagamento-concorrente-555.test.ts`.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true ou sem INTEGRATION_DB_URL → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { diaCivilMaputo } from '@/lib/periodo-fiscal';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

// Um ano já passado: qualquer folha dele é processada «depois» do mês de referência.
const ANO_REF = 2025;

describe.skipIf(skip)('Folha de pagamento — lançamento no mês de referência (#569)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let svc: any;

  const sufixo = Date.now();
  const TENANT = `tenant-folha-ref-${sufixo}`;
  const USER = `user-folha-ref-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };

  const run = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  async function folhaPendente(mes: number): Promise<string> {
    const r: any = await run(() => svc.processarFolhaMes({ mes, ano: ANO_REF }, ctx));
    return r.folhaId;
  }

  async function lancamentoDaFolha(folhaId: string) {
    const ls = await db.lancamento.findMany({ where: { tenantId: TENANT, documentoOrigemId: folhaId } });
    expect(ls).toHaveLength(1);
    const periodo = await db.periodoContabil.findFirst({ where: { id: ls[0].periodoId } });
    return { lancamento: ls[0], periodo };
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ PayrollService: svc } = await import('@/server/services/pessoas-projetos/payroll.service'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant Folha Referência', slug: `folha-ref-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
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
        tenantId: TENANT, codigo: 'FR1', nome: 'Colaborador FR1',
        dataNascimento: new Date(Date.UTC(1990, 0, 1)), genero: 'MASCULINO', estadoCivil: 'SOLTEIRO',
        nacionalidade: 'Moçambicana', naturalidadeProvincia: 'Maputo', naturalidadeDistrito: 'KaMpfumo',
        bi: `BIFR1${sufixo}`, nuit: `FR1-${sufixo}`, email: `fr1-${sufixo}@test.mz`, telefone: '840000000',
        enderecoRua: 'Av. 24 de Julho', enderecoNumero: '1', enderecoBairro: 'Polana',
        enderecoCidade: 'Maputo', enderecoProvincia: 'Maputo',
        emergenciaNome: 'Contacto', emergenciaParentesco: 'Irmão', emergenciaTelefone: '840000001',
        dataAdmissao: new Date(Date.UTC(2020, 0, 1)), status: 'ACTIVO', tipoContrato: 'EFECTIVO',
        regimeTrabalho: 'TEMPO_INTEGRAL', salarioBase: '10000', nivelAcesso: 'USUARIO',
      },
    });
  }, 180_000);

  it('(a) folha de Setembro processada depois → lançamento no período de Setembro, último dia do mês', async () => {
    const folhaId = await folhaPendente(9);
    const r: any = await run(() => svc.marcarProcessada(folhaId, ctx));

    const { lancamento, periodo } = await lancamentoDaFolha(folhaId);
    expect(r.lancamentoId).toBe(lancamento.id);
    expect(periodo.codigo).toBe(`${ANO_REF}-09`);
    expect(diaCivilMaputo(lancamento.data)).toBe(`${ANO_REF}-09-30`);
  }, 60_000);

  it('(b) folha de Dezembro → período 12, nunca o 13 (encerramento)', async () => {
    const folhaId = await folhaPendente(12);
    await run(() => svc.marcarProcessada(folhaId, ctx));

    const { lancamento, periodo } = await lancamentoDaFolha(folhaId);
    expect(periodo.codigo).toBe(`${ANO_REF}-12`);
    expect(periodo.ordem).toBe(12);
    expect(diaCivilMaputo(lancamento.data)).toBe(`${ANO_REF}-12-31`);
  }, 60_000);

  it('(c) período de referência fechado → PERIODO_FECHADO e nada é escrito', async () => {
    const folhaId = await folhaPendente(3);
    // O exercício do ANO_REF já existe (casos anteriores ou criado aqui pelo mesmo caminho).
    const { resolverPeriodo } = await import('@/server/services/financas/contabilidade.service');
    const p = await db.$transaction((tx: any) => resolverPeriodo(tx, new Date(Date.UTC(ANO_REF, 2, 15, 10)), TENANT, USER));
    expect(p.codigo).toBe(`${ANO_REF}-03`);
    await db.periodoContabil.update({ where: { id: p.id }, data: { estado: 'FECHADO', fechadoEm: new Date(), fechadoPorId: USER } });

    const antes = await db.lancamento.count({ where: { tenantId: TENANT } });
    let erro: any;
    try {
      await run(() => svc.marcarProcessada(folhaId, ctx));
    } catch (e) {
      erro = e;
    }
    expect(erro?.name, String(erro?.message)).toBe('BusinessRuleError');
    expect(erro.code).toBe('PERIODO_FECHADO');
    expect(erro.message).toContain(`${ANO_REF}-03`);

    expect(await db.lancamento.count({ where: { tenantId: TENANT } })).toBe(antes);
    const f = await db.folhaPagamento.findFirst({ where: { id: folhaId } });
    expect(f.status).toBe('PENDENTE');
    expect(f.lancamentoId).toBeNull();
    const ps = await db.payroll.findMany({ where: { folhaId } });
    expect(ps.length).toBeGreaterThan(0);
    expect(ps.every((x: any) => x.status === 'PENDENTE')).toBe(true);
  }, 60_000);
});
