/**
 * Oráculo — issue #162: «Editar» benefício dá 404; sem suspender/terminar atribuições.
 *
 * Contrato (decisão do orquestrador): rota de editar o benefício (molde golden standard) e
 * acções suspender/terminar atribuição (estados existentes ACTIVO/SUSPENSO/TERMINADO; AlertDialog
 * para confirmar; data de fim) — atribuições terminadas deixam de entrar na folha (#95).
 *
 * O que este ficheiro prova, pelas Server Actions reais (sessão é o único duplo):
 *   (E) Editar — `actualizarBeneficioAction` com o payload do formulário grava todos os campos
 *       editáveis; NÃO reescreve os valores das atribuições já feitas (menos dados alterados);
 *       benefício de outro tenant → NAO_ENCONTRADO e nada muda.
 *   (D) Detalhe — `BeneficioService.obter` devolve as atribuições ACTIVAS **e SUSPENSAS**:
 *       sem a suspensa no detalhe, «reactivar» e «terminar» uma suspensa são inalcançáveis
 *       pela UI. [RED hoje: o `obter` filtra só ACTIVO]
 *   (S) Suspender / reactivar / terminar — transições pelos estados existentes:
 *       ACTIVO → SUSPENSO → ACTIVO; ACTIVO|SUSPENSO → TERMINADO com a `dataFim` pedida;
 *       TERMINADO é final (suspender, reactivar e terminar recusam e nada muda);
 *       atribuição de outro tenant → NAO_ENCONTRADO.
 *   (F) Data de fim — terminar com `dataFim` anterior à `dataInicio` da atribuição é RECUSADO
 *       (opção conservadora: recusar > gravar uma vigência impossível) e a linha fica intacta.
 *       O código do erro fica com quem implementa (VALIDACAO ou regra de negócio). [RED hoje]
 *   (P) Folha (#95) — uma atribuição terminada (ou suspensa) PELA ACTION deixa de entrar no
 *       `processarFolhaMes`; reactivada volta a entrar.
 *
 * Tabelas fiscais planas (contas à mão): INSS 3% trab./4% ent., sem tecto; IRPS 10%, parcela 0.
 * Colaborador da folha: salário 20 000; benefício MENSAL tributável, empresa 1 000, colab. 200.
 *   com o benefício: bruto 21 000 · outros descontos 200
 *   sem o benefício: bruto 20 000 · outros descontos 0
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó B:beneficios-editar-162; um agente de implementação que o
 * altere é BLOCKER.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const h = vi.hoisted(() => ({
  sessao: null as null | {
    user: {
      id: string;
      tenantId: string;
      permissions: string[];
      acesso: 'aberto' | 'leitura' | 'fechado';
      emailVerificado?: boolean;
    };
  },
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => h.sessao) }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

type Resultado = { ok: boolean; data?: any; error?: { code: string; message: string } };
type Action = (input: unknown) => Promise<Resultado>;

const MES = 8;
const ANO = 2026;

describe.skipIf(skip)('#162 — editar benefício e suspender/terminar atribuições — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let beneficioSvc: any;
  let payrollSvc: any;
  let acoes: Record<string, Action>;

  const sufixo = Date.now();
  const TENANT = `tenant-ben-ed-162-${sufixo}`;
  const TENANT_B = `tenant-ben-ed-162-b-${sufixo}`;
  const USER = `cuserbened162${sufixo}`;
  const USER_B = `cuserbened162b${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };

  const PERMS = ['rh:beneficios:read', 'rh:beneficios:update', 'rh:beneficios:atribuir'];

  let seq = 0;
  async function criarColaborador(tenantId: string, tag: string, salario = '20000'): Promise<string> {
    seq += 1;
    const c = await db.colaborador.create({
      data: {
        tenantId,
        codigo: `B162-${tag}-${sufixo}`,
        nome: `Colaborador ${tag}`,
        dataNascimento: new Date(Date.UTC(1990, 0, 1)),
        genero: 'MASCULINO',
        estadoCivil: 'SOLTEIRO',
        nacionalidade: 'Moçambicana',
        naturalidadeProvincia: 'Maputo',
        naturalidadeDistrito: 'KaMpfumo',
        bi: `BI162${seq}${sufixo}`,
        nuit: `162${seq}-${sufixo}`,
        email: `b162-${tag.toLowerCase()}-${sufixo}@test.mz`,
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
      select: { id: true },
    });
    return c.id;
  }

  async function criarBeneficio(tenantId: string, nome: string, extra: Record<string, unknown> = {}): Promise<string> {
    const b = await db.beneficio.create({
      data: {
        tenantId,
        nome,
        tipo: 'SEGURO_SAUDE',
        periodicidade: 'MENSAL',
        tributavel: true,
        custoTotal: '5000',
        comparticipacaoEmpresa: '1000',
        descontoColaborador: '200',
        departamentosElegiveis: [],
        cargosElegiveis: [],
        ...extra,
      },
      select: { id: true },
    });
    return b.id;
  }

  async function atribuir(
    tenantId: string,
    beneficioId: string,
    colaboradorId: string,
    extra: { status?: string; dataInicio?: Date; dataFim?: Date | null; empresa?: string; colab?: string } = {},
  ): Promise<string> {
    const a = await db.beneficioColaborador.create({
      data: {
        tenantId,
        beneficioId,
        colaboradorId,
        comparticipacaoEmpresa: extra.empresa ?? '1000',
        descontoColaborador: extra.colab ?? '200',
        dataInicio: extra.dataInicio ?? new Date(Date.UTC(2026, 0, 15, 12)),
        dataFim: extra.dataFim ?? null,
        status: extra.status ?? 'ACTIVO',
      },
      select: { id: true },
    });
    return a.id;
  }

  const linhaAt = (id: string) => db.beneficioColaborador.findUnique({ where: { id } });
  const s = (v: unknown) => (v == null ? null : Number(String(v)).toFixed(2));

  function acao(nome: string): Action {
    const f = acoes[nome];
    expect(typeof f, `${nome} não está exportada de beneficios.actions`).toBe('function');
    return f;
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    // Acesso dinâmico: um export em falta falha o caso, não o ficheiro.
    acoes = (await import('@/server/actions/beneficios.actions')) as unknown as Record<string, Action>;
    beneficioSvc = ((await import('@/server/services/pessoas-projetos/beneficios.service')) as any).BeneficioService;
    payrollSvc = ((await import('@/server/services/pessoas-projetos/payroll.service')) as any).PayrollService;

    for (const [id, user, n] of [
      [TENANT, USER, 0],
      [TENANT_B, USER_B, 1],
    ] as const) {
      await db.tenant.create({
        data: { id, nome: `Tenant ben-ed-162 ${n}`, slug: `ben-ed-162-${n}-${sufixo}`, nuit: `${sufixo + n}`.slice(-9) },
      });
      await db.user.create({
        data: {
          id: user,
          tenantId: id,
          email: `ben-ed-162-${n}-${sufixo}@test.mz`,
          nome: 'Gestor RH',
          keycloakSub: `kc-ben-ed-162-${n}-${sufixo}`,
        },
      });
    }
    await db.tabelaINSS.create({
      data: {
        tenantId: TENANT,
        vigenciaInicio: new Date(Date.UTC(2018, 0, 1)),
        taxaTrabalhador: '0.03',
        taxaEntidade: '0.04',
        tetoIncidencia: null,
      },
    });
    await db.escalaoIRPS.create({
      data: {
        tenantId: TENANT,
        vigenciaInicio: new Date(Date.UTC(2024, 0, 1)),
        ordem: 1,
        limiteInferior: '0',
        limiteSuperior: null,
        taxa: '0.10',
        parcelaAbater: '0',
        numeroDependentes: 0,
      },
    });
  }, 60_000);

  beforeEach(() => {
    h.sessao = {
      user: { id: USER, tenantId: TENANT, permissions: PERMS, acesso: 'aberto', emailVerificado: true },
    };
  });

  // ───────────────────────────────────────────────────────────────────────────
  // (E) Editar
  // ───────────────────────────────────────────────────────────────────────────

  it('(E) editar com o payload do formulário grava todos os campos editáveis', async () => {
    const id = await criarBeneficio(TENANT, 'Seguro antes da edição');
    const r = await acao('actualizarBeneficioAction')({
      id,
      data: {
        nome: 'Seguro editado',
        tipo: 'SUBSIDIO_TRANSPORTE',
        descricao: 'Descrição editada',
        fornecedor: 'Fornecedor editado',
        custoTotal: '7500.50',
        comparticipacaoEmpresa: '1250.25',
        descontoColaborador: '300.75',
        periodicidade: 'TRIMESTRAL',
        tributavel: false,
      },
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const b = await db.beneficio.findUnique({ where: { id } });
    expect(b.nome).toBe('Seguro editado');
    expect(b.tipo).toBe('SUBSIDIO_TRANSPORTE');
    expect(b.descricao).toBe('Descrição editada');
    expect(b.fornecedor).toBe('Fornecedor editado');
    expect(s(b.custoTotal)).toBe('7500.50');
    expect(s(b.comparticipacaoEmpresa)).toBe('1250.25');
    expect(s(b.descontoColaborador)).toBe('300.75');
    expect(b.periodicidade).toBe('TRIMESTRAL');
    expect(b.tributavel).toBe(false);
  });

  it('(E) editar os valores do benefício NÃO reescreve as atribuições já feitas', async () => {
    const id = await criarBeneficio(TENANT, 'Seguro com atribuição');
    const col = await criarColaborador(TENANT, 'E2');
    const at = await atribuir(TENANT, id, col, { empresa: '1000', colab: '200' });

    const r = await acao('actualizarBeneficioAction')({
      id,
      data: { comparticipacaoEmpresa: '4000', descontoColaborador: '900' },
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const linha = await linhaAt(at);
    expect(s(linha.comparticipacaoEmpresa)).toBe('1000.00');
    expect(s(linha.descontoColaborador)).toBe('200.00');
    expect(linha.status).toBe('ACTIVO');
  });

  it('(E) benefício de outro tenant → NAO_ENCONTRADO e nada muda', async () => {
    const alheio = await criarBeneficio(TENANT_B, 'Benefício alheio');
    const r = await acao('actualizarBeneficioAction')({ id: alheio, data: { nome: 'Invadido' } });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NAO_ENCONTRADO');
    expect((await db.beneficio.findUnique({ where: { id: alheio } })).nome).toBe('Benefício alheio');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // (D) Detalhe mostra as suspensas
  // ───────────────────────────────────────────────────────────────────────────

  it('(D) o detalhe do benefício (obter) devolve as atribuições ACTIVAS e SUSPENSAS', async () => {
    const id = await criarBeneficio(TENANT, 'Seguro detalhe');
    const activa = await atribuir(TENANT, id, await criarColaborador(TENANT, 'D1'));
    const suspensa = await atribuir(TENANT, id, await criarColaborador(TENANT, 'D2'), { status: 'SUSPENSO' });

    const b = await runCtx(ctx, () => beneficioSvc.obter(id, ctx));
    const porId = new Map<string, any>((b.atribuicoes as any[]).map((a) => [a.id, a]));
    expect(porId.get(activa)?.status, 'a activa aparece no detalhe').toBe('ACTIVO');
    expect(
      porId.get(suspensa)?.status,
      'a suspensa tem de aparecer no detalhe — senão reactivar/terminar uma suspensa é inalcançável',
    ).toBe('SUSPENSO');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // (S) Transições
  // ───────────────────────────────────────────────────────────────────────────

  it('(S) suspender uma activa → SUSPENSO; reactivar → ACTIVO', async () => {
    const id = await criarBeneficio(TENANT, 'Seguro suspender');
    const at = await atribuir(TENANT, id, await criarColaborador(TENANT, 'S1'));

    const r1 = await acao('suspenderBeneficioAction')({ id: at });
    expect(r1.ok, JSON.stringify(r1)).toBe(true);
    expect((await linhaAt(at)).status).toBe('SUSPENSO');

    const r2 = await acao('reactivarBeneficioAction')({ id: at });
    expect(r2.ok, JSON.stringify(r2)).toBe(true);
    expect((await linhaAt(at)).status).toBe('ACTIVO');
  });

  it('(S) terminar uma activa → TERMINADO com a data de fim pedida', async () => {
    const id = await criarBeneficio(TENANT, 'Seguro terminar');
    const at = await atribuir(TENANT, id, await criarColaborador(TENANT, 'S2'));
    const fim = new Date(Date.UTC(2026, 6, 31, 12));

    const r = await acao('terminarBeneficioAction')({ id: at, dataFim: fim });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const linha = await linhaAt(at);
    expect(linha.status).toBe('TERMINADO');
    expect(linha.dataFim?.getTime()).toBe(fim.getTime());
  });

  it('(S) terminar sem data de fim grava uma data de fim (não fica nula)', async () => {
    const id = await criarBeneficio(TENANT, 'Seguro terminar hoje');
    const at = await atribuir(TENANT, id, await criarColaborador(TENANT, 'S2b'));
    const r = await acao('terminarBeneficioAction')({ id: at });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const linha = await linhaAt(at);
    expect(linha.status).toBe('TERMINADO');
    expect(linha.dataFim).not.toBeNull();
  });

  it('(S) terminar uma suspensa → TERMINADO', async () => {
    const id = await criarBeneficio(TENANT, 'Seguro suspensa→terminada');
    const at = await atribuir(TENANT, id, await criarColaborador(TENANT, 'S3'), { status: 'SUSPENSO' });
    const r = await acao('terminarBeneficioAction')({ id: at, dataFim: new Date(Date.UTC(2026, 6, 31, 12)) });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect((await linhaAt(at)).status).toBe('TERMINADO');
  });

  it('(S) TERMINADO é final: suspender, reactivar e terminar recusam e nada muda', async () => {
    const id = await criarBeneficio(TENANT, 'Seguro terminado');
    const fim = new Date(Date.UTC(2026, 3, 30, 12));
    const at = await atribuir(TENANT, id, await criarColaborador(TENANT, 'S4'), { status: 'TERMINADO', dataFim: fim });

    for (const [nome, input] of [
      ['suspenderBeneficioAction', { id: at }],
      ['reactivarBeneficioAction', { id: at }],
      ['terminarBeneficioAction', { id: at, dataFim: new Date(Date.UTC(2026, 9, 31, 12)) }],
    ] as const) {
      const r = await acao(nome)(input);
      expect(r.ok, `${nome} sobre TERMINADO foi aceite: ${JSON.stringify(r)}`).toBe(false);
      const linha = await linhaAt(at);
      expect(linha.status, nome).toBe('TERMINADO');
      expect(linha.dataFim?.getTime(), `${nome} mexeu na data de fim`).toBe(fim.getTime());
    }
  });

  it('(S) atribuição de outro tenant → NAO_ENCONTRADO em suspender e terminar, e nada muda', async () => {
    const idB = await criarBeneficio(TENANT_B, 'Benefício alheio S');
    const atB = await atribuir(TENANT_B, idB, await criarColaborador(TENANT_B, 'SX'));

    for (const [nome, input] of [
      ['suspenderBeneficioAction', { id: atB }],
      ['terminarBeneficioAction', { id: atB, dataFim: new Date(Date.UTC(2026, 6, 31, 12)) }],
    ] as const) {
      const r = await acao(nome)(input);
      expect(r.ok).toBe(false);
      expect(r.error?.code, nome).toBe('NAO_ENCONTRADO');
    }
    const linha = await linhaAt(atB);
    expect(linha.status).toBe('ACTIVO');
    expect(linha.dataFim).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // (F) Data de fim coerente
  // ───────────────────────────────────────────────────────────────────────────

  it('(F) terminar com data de fim anterior à data de início é recusado e a atribuição fica intacta', async () => {
    const id = await criarBeneficio(TENANT, 'Seguro data fim');
    const inicio = new Date(Date.UTC(2026, 5, 1, 12));
    const at = await atribuir(TENANT, id, await criarColaborador(TENANT, 'F1'), { dataInicio: inicio });
    const antes = await linhaAt(at);

    const r = await acao('terminarBeneficioAction')({ id: at, dataFim: new Date(Date.UTC(2026, 4, 31, 12)) });
    expect(r.ok, `data de fim antes do início foi aceite: ${JSON.stringify(r)}`).toBe(false);

    const depois = await linhaAt(at);
    expect(depois.status).toBe('ACTIVO');
    expect(depois.dataFim).toBeNull();
    expect(depois.updatedAt.getTime()).toBe(antes.updatedAt.getTime());
  });

  it('(F) terminar com data de fim igual à data de início é aceite', async () => {
    const id = await criarBeneficio(TENANT, 'Seguro data fim igual');
    const inicio = new Date(Date.UTC(2026, 5, 1, 12));
    const at = await atribuir(TENANT, id, await criarColaborador(TENANT, 'F2'), { dataInicio: inicio });
    const r = await acao('terminarBeneficioAction')({ id: at, dataFim: inicio });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect((await linhaAt(at)).status).toBe('TERMINADO');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // (P) Folha (#95)
  // ───────────────────────────────────────────────────────────────────────────

  describe('(P) folha de pagamento', () => {
    let colP: string;
    let atP: string;

    async function folhaDoColaborador() {
      await runCtx(ctx, () => payrollSvc.processarFolhaMes({ mes: MES, ano: ANO }, ctx));
      const p = await db.payroll.findFirst({
        where: { tenantId: TENANT, colaboradorId: colP, anoReferencia: ANO, mesReferencia: MES },
      });
      expect(p, `payroll ${MES}/${ANO}`).not.toBeNull();
      return p;
    }

    beforeAll(async () => {
      colP = await criarColaborador(TENANT, 'P1', '20000');
      const ben = await criarBeneficio(TENANT, 'Seguro na folha');
      atP = await atribuir(TENANT, ben, colP, { empresa: '1000', colab: '200' });
    });

    it('activa: entra na folha (bruto 21 000, outros descontos 200)', async () => {
      const p = await folhaDoColaborador();
      expect(s(p.salarioBruto)).toBe('21000.00');
      expect(s(p.descontoOutros)).toBe('200.00');
    });

    it('suspensa pela action: sai da folha; reactivada pela action: volta', async () => {
      expect((await acao('suspenderBeneficioAction')({ id: atP })).ok).toBe(true);
      let p = await folhaDoColaborador();
      expect(s(p.salarioBruto), 'suspensa não entra').toBe('20000.00');
      expect(s(p.descontoOutros)).toBe('0.00');

      expect((await acao('reactivarBeneficioAction')({ id: atP })).ok).toBe(true);
      p = await folhaDoColaborador();
      expect(s(p.salarioBruto), 'reactivada volta a entrar').toBe('21000.00');
    });

    it('terminada pela action: deixa de entrar na folha', async () => {
      const r = await acao('terminarBeneficioAction')({ id: atP, dataFim: new Date(Date.UTC(2026, 6, 31, 12)) });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      const p = await folhaDoColaborador();
      expect(s(p.salarioBruto), 'terminada não entra').toBe('20000.00');
      expect(s(p.descontoOutros)).toBe('0.00');
    });
  });
});
