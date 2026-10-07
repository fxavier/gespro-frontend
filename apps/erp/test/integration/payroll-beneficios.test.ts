/**
 * Oráculo #95 — benefícios entram na folha de pagamento (spec 06 × spec 08)
 *
 * Contra Postgres real (Testcontainers). Contrato:
 *   (P) `processarFolhaMes` carrega, em lote e dentro da transacção, os benefícios
 *       vigentes do mês de cada colaborador (mesma regra de `linhasPayrollDeBeneficios`:
 *       atribuição ACTIVA, periodicidade MENSAL, vigente no mês) e:
 *         - a comparticipação da empresa de um benefício TRIBUTÁVEL é provento
 *           (entra no bruto ⇒ base de INSS e de IRPS);
 *         - o desconto do colaborador é desconto diverso de natureza OUTRO
 *           (reduz o líquido, não a base de imposto);
 *         - a comparticipação de um benefício NÃO tributável não entra na folha.
 *   (R) `recalcularPayroll` (recalcularPayrollNoTx) usa a mesma carga: uma atribuição
 *       terminada depois do processamento deixa de contar no recálculo; uma nova passa a contar.
 *   (I) Reprocessar o mesmo mês não duplica as linhas de benefício.
 *   (T) Os totais da folha reflectem os benefícios; outro tenant e outros colaboradores
 *       não são tocados.
 *
 * Tabelas fiscais do teste (planas, para contas exactas à mão):
 *   INSS 3% trabalhador / 4% entidade, sem tecto; IRPS escalão único 10%, parcela 0.
 *
 * Colaborador A (salário 20 000), Julho/2026:
 *   - «Seguro de saúde» (SEGURO_SAUDE, MENSAL, tributável): empresa 1 000, colaborador 200
 *   - «Plano de comunicações» (SUBSIDIO_COMUNICACOES, MENSAL, NÃO tributável): empresa 500
 *   - ruído que NÃO pode entrar: atribuição TERMINADA, atribuição com dataFim antes do mês,
 *     atribuição que só começa depois do mês, benefício TRIMESTRAL.
 *   bruto = 21 000 · INSS trab. 630 · INSS ent. 840 · base IRPS 20 370 · IRPS 2 037
 *   outros descontos 200 · líquido = 21 000 − 630 − 2 037 − 200 = 18 133 · custo 21 840
 * Colaborador B (salário 10 000), sem benefícios: bruto 10 000 · INSS 300 · IRPS 970 · líquido 8 730.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

const MES = 7;
const ANO = 2026;

describe.skipIf(skip)('#95 — benefícios na folha de pagamento — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let svc: any; // PayrollService

  const sufixo = Date.now();
  const TENANT = `tenant-pay-ben-${sufixo}`;
  const TENANT_B = `tenant-pay-ben-b-${sufixo}`;
  const USER = `user-pay-ben-${sufixo}`;
  const USER_B = `user-pay-ben-b-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const ctxB = { tenantId: TENANT_B, userId: USER_B };

  let colA: string;
  let colB: string;
  let colOutroTenant: string;
  let atribSaude: string;
  let benefSaudeId: string;

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

  async function criarBeneficio(
    tenantId: string,
    nome: string,
    tipo: string,
    periodicidade: string,
    tributavel: boolean,
  ): Promise<string> {
    const b = await db.beneficio.create({
      data: {
        tenantId,
        nome,
        tipo,
        periodicidade,
        tributavel,
        custoTotal: '5000',
        comparticipacaoEmpresa: '0',
        descontoColaborador: '0',
        departamentosElegiveis: [],
        cargosElegiveis: [],
      },
    });
    return b.id;
  }

  async function atribuir(
    tenantId: string,
    beneficioId: string,
    colaboradorId: string,
    empresa: string,
    colaborador: string,
    extra: { dataInicio?: Date; dataFim?: Date | null; status?: string } = {},
  ): Promise<string> {
    const a = await db.beneficioColaborador.create({
      data: {
        tenantId,
        beneficioId,
        colaboradorId,
        comparticipacaoEmpresa: empresa,
        descontoColaborador: colaborador,
        dataInicio: extra.dataInicio ?? new Date(Date.UTC(2026, 0, 15, 12)),
        dataFim: extra.dataFim ?? null,
        status: extra.status ?? 'ACTIVO',
      },
    });
    return a.id;
  }

  async function payrollDe(colaboradorId: string, tenantId = TENANT) {
    const p = await db.payroll.findFirst({
      where: { tenantId, colaboradorId, anoReferencia: ANO, mesReferencia: MES },
      include: { linhas: true },
    });
    expect(p, `Payroll ${MES}/${ANO} do colaborador ${colaboradorId}`).not.toBeNull();
    return p as any;
  }

  const calculadas = (p: any) => (p.linhas as any[]).filter((l) => !l.manual);
  const somaProventos = (p: any) =>
    calculadas(p)
      .filter((l) => l.tipo === 'PROVENTO')
      .reduce((acc, l) => acc + Number(String(l.valor)), 0)
      .toFixed(2);

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ PayrollService: svc } = await import('@/server/services/pessoas-projetos/payroll.service'));

    for (const [id, user, n] of [
      [TENANT, USER, 0],
      [TENANT_B, USER_B, 1],
    ] as const) {
      await db.tenant.create({
        data: { id, nome: `Tenant payroll benef ${n}`, slug: `pay-ben-${n}-${sufixo}`, nuit: `${sufixo + n}`.slice(-9) },
      });
      await db.user.create({
        data: {
          id: user,
          tenantId: id,
          email: `pay-ben-${n}-${sufixo}@test.mz`,
          nome: 'Utilizador payroll',
          keycloakSub: `kc-pay-ben-${n}-${sufixo}`,
        },
      });
      await criarTabelas(id);
    }

    colA = await criarColaborador(TENANT, 'PBA', '20000');
    colB = await criarColaborador(TENANT, 'PBB', '10000');
    colOutroTenant = await criarColaborador(TENANT_B, 'PBX', '20000');

    benefSaudeId = await criarBeneficio(TENANT, 'Seguro de saúde', 'SEGURO_SAUDE', 'MENSAL', true);
    const comunicacoes = await criarBeneficio(TENANT, 'Plano de comunicações', 'SUBSIDIO_COMUNICACOES', 'MENSAL', false);
    const pensoes = await criarBeneficio(TENANT, 'Plano de pensões', 'PLANO_PENSOES', 'MENSAL', true);
    const trimestral = await criarBeneficio(TENANT, 'Seguro de vida trimestral', 'SEGURO_VIDA', 'TRIMESTRAL', true);

    // Entram
    atribSaude = await atribuir(TENANT, benefSaudeId, colA, '1000', '200');
    await atribuir(TENANT, comunicacoes, colA, '500', '0'); // não tributável: não entra
    // Ruído — não pode entrar
    await atribuir(TENANT, pensoes, colA, '3000', '300', { status: 'TERMINADO' });
    await atribuir(TENANT, pensoes, colA, '4000', '400', {
      dataInicio: new Date(Date.UTC(2025, 0, 1, 12)),
      dataFim: new Date(Date.UTC(2026, 4, 31, 12)), // acabou em Maio
    });
    await atribuir(TENANT, pensoes, colA, '5000', '500', {
      dataInicio: new Date(Date.UTC(2026, 8, 1, 12)), // só começa em Setembro
    });
    await atribuir(TENANT, trimestral, colA, '6100', '610');

    // Outro tenant: o mesmo tipo de benefício, que nunca pode chegar à folha do TENANT
    const saudeB = await criarBeneficio(TENANT_B, 'Seguro de saúde', 'SEGURO_SAUDE', 'MENSAL', true);
    await atribuir(TENANT_B, saudeB, colOutroTenant, '7777', '777');

    await noCtx(ctx, () => svc.processarFolhaMes({ mes: MES, ano: ANO }, ctx));
  });

  // -------------------------------------------------------------------------
  // (P) processarFolhaMes
  // -------------------------------------------------------------------------

  it('comparticipação de benefício tributável entra no bruto e na base de INSS/IRPS', async () => {
    const p = await payrollDe(colA);
    expect(s(p.salarioBruto), 'bruto = 20 000 + 1 000 (seguro de saúde, tributável)').toBe('21000.00');
    expect(s(p.descontoInss), 'INSS trab. 3% × 21 000').toBe('630.00');
    expect(s(p.encargoInssEntidade), 'INSS entidade 4% × 21 000').toBe('840.00');
    expect(s(p.descontoIrps), 'IRPS 10% × (21 000 − 630)').toBe('2037.00');
    expect(s(p.custoTotalEntidade)).toBe('21840.00');
  });

  it('desconto do colaborador entra como desconto diverso OUTRO e reduz o líquido', async () => {
    const p = await payrollDe(colA);
    expect(s(p.descontoOutros), 'só os 200 do seguro de saúde').toBe('200.00');
    expect(s(p.salarioLiquido), '21 000 − 630 − 2 037 − 200').toBe('18133.00');

    const descontosOutro = calculadas(p).filter((l) => l.tipo === 'DESCONTO' && l.natureza === 'OUTRO');
    expect(descontosOutro, 'uma linha de desconto OUTRO, a do benefício').toHaveLength(1);
    expect(s(descontosOutro[0].valor)).toBe('200.00');
    expect(descontosOutro[0].descricao).toContain('Seguro de saúde');
  });

  it('as linhas calculadas de provento somam o bruto (o benefício tem linha própria no recibo)', async () => {
    const p = await payrollDe(colA);
    expect(somaProventos(p)).toBe('21000.00');
    const provBenef = calculadas(p).filter(
      (l) => l.tipo === 'PROVENTO' && l.natureza !== 'BASE' && s(l.valor) === '1000.00',
    );
    expect(provBenef, 'uma linha de provento de 1 000 (o benefício tributável)').toHaveLength(1);
  });

  it('benefício não tributável, atribuições terminadas/fora do mês e periodicidade não mensal não entram', async () => {
    const p = await payrollDe(colA);
    const valores = (p.linhas as any[]).map((l) => s(l.valor));
    for (const v of ['500.00', '3000.00', '300.00', '4000.00', '400.00', '5000.00', '6100.00', '610.00']) {
      expect(valores, `nenhuma linha de ${v}`).not.toContain(v);
    }
  });

  it('colaborador sem benefícios fica igual ao cálculo sem benefícios', async () => {
    const p = await payrollDe(colB);
    expect(s(p.salarioBruto)).toBe('10000.00');
    expect(s(p.descontoInss)).toBe('300.00');
    expect(s(p.descontoIrps)).toBe('970.00');
    expect(s(p.descontoOutros)).toBe('0.00');
    expect(s(p.salarioLiquido)).toBe('8730.00');
  });

  it('totais da folha incluem os benefícios', async () => {
    const folha = await db.folhaPagamento.findFirst({
      where: { tenantId: TENANT, anoReferencia: ANO, mesReferencia: MES },
    });
    expect(folha).not.toBeNull();
    expect(s(folha.totalBruto), '21 000 + 10 000').toBe('31000.00');
    expect(s(folha.totalOutrosDescontos)).toBe('200.00');
    expect(s(folha.totalLiquido), '18 133 + 8 730').toBe('26863.00');
  });

  // -------------------------------------------------------------------------
  // (T) isolamento
  // -------------------------------------------------------------------------

  it('o benefício de outro tenant não chega à folha deste, e a folha do outro tenant usa só os seus', async () => {
    const p = await payrollDe(colA);
    expect((p.linhas as any[]).map((l) => s(l.valor))).not.toContain('7777.00');

    await noCtx(ctxB, () => svc.processarFolhaMes({ mes: MES, ano: ANO }, ctxB));
    const pb = await payrollDe(colOutroTenant, TENANT_B);
    expect(s(pb.salarioBruto), '20 000 + 7 777').toBe('27777.00');
    expect(s(pb.descontoOutros)).toBe('777.00');
  });

  // -------------------------------------------------------------------------
  // (I) reprocessar não duplica
  // -------------------------------------------------------------------------

  it('reprocessar o mês não duplica as linhas de benefício', async () => {
    await noCtx(ctx, () => svc.processarFolhaMes({ mes: MES, ano: ANO }, ctx));
    const p = await payrollDe(colA);
    expect(s(p.salarioBruto)).toBe('21000.00');
    expect(s(p.descontoOutros)).toBe('200.00');
    expect(somaProventos(p)).toBe('21000.00');
    expect(calculadas(p).filter((l) => l.tipo === 'DESCONTO' && l.natureza === 'OUTRO')).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // (R) recalcularPayroll
  // -------------------------------------------------------------------------

  it('recalcularPayroll reflecte uma nova atribuição e o fim de outra', async () => {
    const antes = await payrollDe(colA);

    // Nova atribuição tributável para A, depois do processamento
    const subsidioHab = await criarBeneficio(TENANT, 'Apoio à habitação', 'SUBSIDIO_HABITACAO', 'MENSAL', true);
    await atribuir(TENANT, subsidioHab, colA, '2000', '0');

    await noCtx(ctx, () => svc.recalcularPayroll(antes.id, ctx));
    let p = await payrollDe(colA);
    expect(s(p.salarioBruto), '20 000 + 1 000 + 2 000').toBe('23000.00');
    expect(s(p.descontoOutros)).toBe('200.00');
    expect(s(p.descontoInss), '3% × 23 000').toBe('690.00');
    expect(s(p.descontoIrps), '10% × (23 000 − 690)').toBe('2231.00');
    expect(s(p.salarioLiquido), '23 000 − 690 − 2 231 − 200').toBe('19879.00');

    // Termina o seguro de saúde: deixa de contar no recálculo
    await db.beneficioColaborador.update({ where: { id: atribSaude }, data: { status: 'TERMINADO' } });
    await noCtx(ctx, () => svc.recalcularPayroll(antes.id, ctx));
    p = await payrollDe(colA);
    expect(s(p.salarioBruto), '20 000 + 2 000').toBe('22000.00');
    expect(s(p.descontoOutros)).toBe('0.00');
    expect(calculadas(p).filter((l) => l.tipo === 'DESCONTO' && l.natureza === 'OUTRO')).toHaveLength(0);

    const folha = await db.folhaPagamento.findFirst({
      where: { tenantId: TENANT, anoReferencia: ANO, mesReferencia: MES },
    });
    expect(s(folha.totalBruto), '22 000 + 10 000').toBe('32000.00');
  });
});
