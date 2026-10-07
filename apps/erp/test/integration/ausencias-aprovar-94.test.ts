/**
 * Oráculo — issue #94: as ausências nunca eram aprovadas, logo a folha nunca descontava faltas.
 *
 * `AusenciaService.aprovar` existia sem action nem botão; o payroll só desconta ausências
 * `APROVADA` (FALTA não justificada / licença sem vencimento). Contrato (molde das férias,
 * `aprovarFeriasAction`):
 *
 *   - `aprovarAusenciaAction({ id })` e `rejeitarAusenciaAction({ id, motivoRejeicao })`,
 *     em `src/server/actions/rh.actions.ts`, ambas com a permissão nova `rh:ausencias:aprovar`;
 *   - aprovar grava `APROVADA`, `aprovadoPorId` = utilizador da sessão e `dataAprovacao`;
 *   - rejeitar grava `REJEITADA` E o `motivoRejeicao` (coluna nova em `Ausencia`); sem motivo
 *     não rejeita;
 *   - sem a permissão → `SEM_PERMISSAO`; ausência de outro tenant → `NAO_ENCONTRADO`; nada muda;
 *   - critério de aceitação da issue: a ausência aprovada pela action reflecte-se na folha do
 *     mês quando esta é (re)calculada — linha `FALTA` e `descontoOutros` = salário/30 × dias.
 *
 * Sessão (`@/lib/auth`) é o único duplo (fronteira), mutável por `vi.hoisted`. `next/cache` é
 * dobrado porque o `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero,
 * `createSafeAction`, `AusenciaService.registar` e `PayrollService.processarFolhaMes`.
 * O colaborador e as tabelas INSS/IRPS são escritos pelo client cru (não são documentos
 * numerados nem lançamentos).
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó D:ausencias-aprovar-94; um agente de implementação que o
 * altere é BLOCKER.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const h = vi.hoisted(() => ({
  sessao: null as null | {
    user: { id: string; tenantId: string; permissions: string[]; acesso: 'aberto' | 'leitura' | 'fechado' };
  },
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => h.sessao) }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

type Resultado = { ok: boolean; data?: unknown; error?: { code: string; message: string } };

describe.skipIf(skip)('Aprovar/rejeitar ausências (#94) — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let rh: typeof import('@/server/services/pessoas-projetos/rh.service');
  let payroll: typeof import('@/server/services/pessoas-projetos/payroll.service');
  // Acesso dinâmico: as actions ainda não existem — falha o caso, não o ficheiro.
  let actions: Record<string, (input: unknown) => Promise<Resultado>>;

  const sufixo = Date.now();
  const TENANT = `tenant-aus-94-${sufixo}`;
  const OUTRO_TENANT = `tenant-aus-94-outro-${sufixo}`;
  const USER = `user-aus-94-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  // Março de 2027: dentro do período da folha [2027-03-01Z, 2027-04-01Z).
  const ANO = 2027;
  const MES = 3;

  let colaboradorId: string;
  let colaboradorOutroId: string;

  function sessao(permissions: string[]) {
    h.sessao = { user: { id: USER, tenantId: TENANT, permissions, acesso: 'aberto' } };
  }

  function action(nome: 'aprovarAusenciaAction' | 'rejeitarAusenciaAction') {
    const fn = actions[nome];
    expect(typeof fn, `${nome} não está exportada de rh.actions.ts`).toBe('function');
    return fn;
  }

  async function registarFalta(dia: number, dias = 1, tenant = TENANT, colab?: string): Promise<string> {
    const c = { tenantId: tenant, userId: USER };
    const inicio = new Date(Date.UTC(ANO, MES - 1, dia, 10));
    const fim = new Date(Date.UTC(ANO, MES - 1, dia + dias - 1, 10));
    const { id } = await runCtx(c, () =>
      rh.AusenciaService.registar(
        {
          colaboradorId: colab ?? colaboradorId,
          tipo: 'FALTA',
          dataInicio: inicio,
          dataFim: fim,
          justificada: false,
        } as never,
        c,
      ),
    );
    return id;
  }

  const ler = (id: string) => db.ausencia.findUnique({ where: { id } });

  async function criarColaborador(tenant: string, tag: string): Promise<string> {
    const c = await db.colaborador.create({
      data: {
        tenantId: tenant,
        codigo: `COL-${tag}-${sufixo}`,
        nome: `Colaborador ${tag}`,
        dataNascimento: new Date('1990-05-05T00:00:00Z'),
        genero: 'FEMININO',
        estadoCivil: 'SOLTEIRO',
        nacionalidade: 'Moçambicana',
        naturalidadeProvincia: 'Maputo',
        naturalidadeDistrito: 'KaMpfumo',
        bi: '110100000001A',
        nuit: '400000001',
        email: `colab-${tag}-${sufixo}@test.mz`,
        telefone: '+258840000001',
        enderecoRua: 'Av. 24 de Julho',
        enderecoNumero: '1',
        enderecoBairro: 'Polana',
        enderecoCidade: 'Maputo',
        enderecoProvincia: 'Maputo',
        emergenciaNome: 'Contacto',
        emergenciaParentesco: 'Irmão',
        emergenciaTelefone: '+258840000002',
        dataAdmissao: new Date('2020-01-01T00:00:00Z'),
        status: 'ACTIVO',
        tipoContrato: 'EFECTIVO',
        regimeTrabalho: 'TEMPO_INTEGRAL',
        salarioBase: '30000.00',
        nivelAcesso: 'USUARIO',
      },
      select: { id: true },
    });
    return c.id;
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    rh = await import('@/server/services/pessoas-projetos/rh.service');
    payroll = await import('@/server/services/pessoas-projetos/payroll.service');
    actions = (await import('@/server/actions/rh.actions')) as unknown as typeof actions;

    for (const [id, slug, nuit] of [
      [TENANT, `aus-94-${sufixo}`, `${sufixo}`.slice(-9)],
      [OUTRO_TENANT, `aus-94-outro-${sufixo}`, `${sufixo + 1}`.slice(-9)],
    ] as const) {
      await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit } });
    }
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `aus-94-${sufixo}@test.mz`, nome: 'Gestor RH', keycloakSub: `kc-aus-94-${sufixo}` },
    });

    colaboradorId = await criarColaborador(TENANT, 'a');
    colaboradorOutroId = await criarColaborador(OUTRO_TENANT, 'b');

    // Tabelas vigentes mínimas para a folha: INSS 3%/4%, IRPS a 0% (isola o desconto da falta).
    await db.tabelaINSS.create({
      data: {
        tenantId: TENANT,
        vigenciaInicio: new Date('2020-01-01T00:00:00Z'),
        taxaTrabalhador: '0.030000',
        taxaEntidade: '0.040000',
      },
    });
    await db.escalaoIRPS.create({
      data: {
        tenantId: TENANT,
        vigenciaInicio: new Date('2020-01-01T00:00:00Z'),
        ordem: 1,
        limiteInferior: '0.00',
        limiteSuperior: null,
        taxa: '0.000000',
        parcelaAbater: '0.00',
        numeroDependentes: 0,
      },
    });
  }, 60_000);

  beforeEach(() => {
    sessao(['rh:ausencias:aprovar']);
  });

  it('rh:ausencias:aprovar → aprovar grava APROVADA, aprovadoPorId e dataAprovacao', async () => {
    const id = await registarFalta(2);
    const r = await action('aprovarAusenciaAction')({ id });
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const a = await ler(id);
    expect(a.status).toBe('APROVADA');
    expect(a.aprovadoPorId).toBe(USER);
    expect(a.dataAprovacao).toBeInstanceOf(Date);
  });

  it('rejeitar grava REJEITADA e o motivoRejeicao', async () => {
    const id = await registarFalta(4);
    const motivo = 'Sem justificativo entregue no prazo';
    const r = await action('rejeitarAusenciaAction')({ id, motivoRejeicao: motivo });
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const a = await ler(id);
    expect(a.status).toBe('REJEITADA');
    expect(a.aprovadoPorId).toBe(USER);
    expect(a.dataAprovacao).toBeInstanceOf(Date);
    expect((a as any).motivoRejeicao).toBe(motivo);
  });

  it('rejeitar sem motivo é recusado e a ausência continua PENDENTE', async () => {
    const id = await registarFalta(5);
    const fn = action('rejeitarAusenciaAction');

    const semMotivo = await fn({ id });
    expect(semMotivo.ok).toBe(false);
    const vazio = await fn({ id, motivoRejeicao: '' });
    expect(vazio.ok).toBe(false);

    expect((await ler(id)).status).toBe('PENDENTE');
  });

  it('sem rh:ausencias:aprovar (só criar ausências e aprovar férias) → SEM_PERMISSAO, nada muda', async () => {
    const id = await registarFalta(6);
    sessao(['rh:ausencias:create', 'rh:ferias:aprovar']);

    const ap = await action('aprovarAusenciaAction')({ id });
    expect(ap.ok).toBe(false);
    expect(ap.error?.code).toBe('SEM_PERMISSAO');

    const rj = await action('rejeitarAusenciaAction')({ id, motivoRejeicao: 'x' });
    expect(rj.ok).toBe(false);
    expect(rj.error?.code).toBe('SEM_PERMISSAO');

    const a = await ler(id);
    expect(a.status).toBe('PENDENTE');
    expect(a.aprovadoPorId).toBeNull();
  });

  it('ausência de outro tenant → NAO_ENCONTRADO e continua PENDENTE', async () => {
    const id = await registarFalta(7, 1, OUTRO_TENANT, colaboradorOutroId);

    const ap = await action('aprovarAusenciaAction')({ id });
    expect(ap.ok).toBe(false);
    expect(ap.error?.code).toBe('NAO_ENCONTRADO');

    const rj = await action('rejeitarAusenciaAction')({ id, motivoRejeicao: 'Cross-tenant' });
    expect(rj.ok).toBe(false);
    expect(rj.error?.code).toBe('NAO_ENCONTRADO');

    expect((await ler(id)).status).toBe('PENDENTE');
  });

  it('ausência já aprovada não é rejeitada depois (nem o motivo é escrito)', async () => {
    const id = await registarFalta(8);
    expect((await action('aprovarAusenciaAction')({ id })).ok).toBe(true);

    const rj = await action('rejeitarAusenciaAction')({ id, motivoRejeicao: 'Tarde demais' });
    expect(rj.ok).toBe(false);

    const a = await ler(id);
    expect(a.status).toBe('APROVADA');
    expect((a as any).motivoRejeicao ?? null).toBeNull();
  });

  it('critério da issue: a falta aprovada pela action reflecte-se na folha do mês recalculada', async () => {
    // Folha isolada noutro mês para não somar as faltas dos casos anteriores.
    const MES_FOLHA = 5;
    const inicio = new Date(Date.UTC(ANO, MES_FOLHA - 1, 12, 10));
    const fim = new Date(Date.UTC(ANO, MES_FOLHA - 1, 13, 10));
    const { id } = await noCtx(() =>
      rh.AusenciaService.registar(
        { colaboradorId, tipo: 'FALTA', dataInicio: inicio, dataFim: fim, justificada: false } as never,
        ctx,
      ),
    );
    expect((await ler(id)).diasAusencia).toBe(2);

    const lerPayroll = () =>
      db.payroll.findFirst({
        where: { tenantId: TENANT, colaboradorId, anoReferencia: ANO, mesReferencia: MES_FOLHA },
        include: { linhas: true },
      });

    // A folha do mês já existe com a falta PENDENTE: nada é descontado.
    await noCtx(() => payroll.PayrollService.processarFolhaMes({ mes: MES_FOLHA, ano: ANO } as never, ctx));
    const antes = await lerPayroll();
    expect(antes).toBeTruthy();
    expect(antes.linhas.some((l: any) => l.natureza === 'FALTA')).toBe(false);
    expect(Number(antes.descontoOutros)).toBe(0);

    // Aprovar pela action e recalcular a folha: a falta passa a descontar salário/30 × 2 dias.
    const r = await action('aprovarAusenciaAction')({ id });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    await noCtx(() => payroll.PayrollService.processarFolhaMes({ mes: MES_FOLHA, ano: ANO } as never, ctx));

    const depois = await lerPayroll();
    const falta = depois.linhas.find((l: any) => l.natureza === 'FALTA');
    expect(falta, 'a folha recalculada não tem a linha FALTA').toBeTruthy();
    expect(String(falta.valor)).toBe('2000');
    expect(Number(depois.descontoOutros)).toBe(2000);
    expect(Number(depois.salarioLiquido)).toBeLessThan(Number(antes.salarioLiquido));
  });
});
