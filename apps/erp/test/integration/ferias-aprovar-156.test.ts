/**
 * Oráculo — issue #156: férias sem aprovar, iniciar período aquisitivo ou cancelar pedido.
 *
 * `aprovarFeriasAction` e `iniciarPeriodoFeriasAction` existiam sem botão; o cancelamento nem
 * action tinha. Contrato (molde do #94 nas ausências, PR #382):
 *
 *   - aprovar: `aprovarFeriasAction({ solicitacaoId, status: 'APROVADA' })`, permissão
 *     `rh:ferias:aprovar`; grava APROVADA, `aprovadoPorId` = utilizador da sessão,
 *     `dataAprovacao`, e desconta os dias do saldo (`Ferias.diasUsados`) UMA vez;
 *   - rejeitar: a mesma action com `status: 'REJEITADA'` e `motivoRejeicao` obrigatório; grava
 *     o motivo e não mexe no saldo;
 *   - uma transição inválida (aprovar/rejeitar o que já não está PENDENTE) é recusada como
 *     regra de negócio — nunca `ERRO_INTERNO` (o `transitar` lança `Error` cru, CLAUDE.md);
 *   - cancelar: `cancelarSolicitacaoFeriasAction({ solicitacaoId })`, permissão
 *     `rh:ferias:solicitar`, só PELO PRÓPRIO (o utilizador que submeteu o pedido) e só enquanto
 *     PENDENTE. Decisão conservadora do verificador: outro utilizador — mesmo com
 *     `rh:ferias:aprovar` — não cancela; o próprio não cancela um pedido já APROVADO (isso
 *     devolveria dias ao saldo sem o aprovador). Para saber quem submeteu, o `solicitar` passa a
 *     guardar o utilizador da sessão na solicitação (coluna nova, nome livre — este teste não
 *     a lê);
 *   - iniciar período aquisitivo: `iniciarPeriodoFeriasAction`, permissão `rh:ferias:create`;
 *     colaborador de outro tenant → `NAO_ENCONTRADO` e nada é criado; fim antes do início é
 *     recusado;
 *   - sem a permissão → `SEM_PERMISSAO`; solicitação de outro tenant → `NAO_ENCONTRADO`; nada muda.
 *
 * Sessão (`@/lib/auth`) é o único duplo (fronteira), mutável por `vi.hoisted`. `next/cache` é
 * dobrado porque o `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero,
 * `createSafeAction` e `FeriasService`. Colaboradores e períodos são escritos pelo client cru.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó D:ferias-aprovar-156; um agente de implementação que o
 * altere é BLOCKER.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

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
type NomeAction =
  | 'aprovarFeriasAction'
  | 'solicitarFeriasAction'
  | 'cancelarSolicitacaoFeriasAction'
  | 'iniciarPeriodoFeriasAction';

describe.skipIf(skip)('Férias: aprovar, rejeitar, cancelar e iniciar período (#156) — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let rh: typeof import('@/server/services/pessoas-projetos/rh.service');
  // Acesso dinâmico: a action de cancelar ainda não existe — falha o caso, não o ficheiro.
  let actions: Record<string, (input: unknown) => Promise<Resultado>>;

  const sufixo = Date.now();
  const TENANT = `tenant-fer-156-${sufixo}`;
  const OUTRO_TENANT = `tenant-fer-156-outro-${sufixo}`;
  const GESTOR = `user-fer-156-gestor-${sufixo}`;
  const EU = `user-fer-156-eu-${sufixo}`;
  const OUTRO = `user-fer-156-outro-${sufixo}`;

  let colaboradorId: string;
  let colaboradorOutroId: string;
  let feriasId: string;
  let feriasOutroId: string;

  const TODAS = ['rh:ferias:aprovar', 'rh:ferias:solicitar', 'rh:ferias:create'];

  function sessao(userId: string, permissions: string[], tenantId = TENANT) {
    h.sessao = { user: { id: userId, tenantId, permissions, acesso: 'aberto' } };
  }

  function action(nome: NomeAction) {
    const fn = actions[nome];
    expect(typeof fn, `${nome} não está exportada de rh.actions.ts`).toBe('function');
    return fn;
  }

  const lerSol = (id: string) => db.solicitacaoFerias.findUnique({ where: { id } });
  const diasUsados = async (id = feriasId) =>
    (await db.ferias.findUnique({ where: { id }, select: { diasUsados: true } })).diasUsados as number;

  /** Pedido PENDENTE submetido pela action, com a sessão de `userId` (é ele «o próprio»). */
  let diaSeguinte = 1;
  async function pedir(userId: string, dias = 2, fer = feriasId, tenant = TENANT): Promise<string> {
    const d = diaSeguinte;
    diaSeguinte += dias + 1;
    const inicio = new Date(Date.UTC(2027, 6, d, 10));
    const fim = new Date(Date.UTC(2027, 6, d + dias - 1, 10));
    sessao(userId, ['rh:ferias:solicitar'], tenant);
    const r = await action('solicitarFeriasAction')({
      feriasId: fer,
      dataInicio: inicio,
      dataFim: fim,
      diasSolicitados: dias,
      tipo: 'FRACIONADA',
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const id = (r.data as { id: string }).id;
    expect(typeof id).toBe('string');
    return id;
  }

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
    actions = (await import('@/server/actions/rh.actions')) as unknown as typeof actions;

    for (const [id, slug, nuit] of [
      [TENANT, `fer-156-${sufixo}`, `${sufixo}`.slice(-9)],
      [OUTRO_TENANT, `fer-156-outro-${sufixo}`, `${sufixo + 1}`.slice(-9)],
    ] as const) {
      await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit } });
    }
    for (const [id, tenantId, tag] of [
      [GESTOR, TENANT, 'gestor'],
      [EU, TENANT, 'eu'],
      [OUTRO, TENANT, 'outro'],
    ] as const) {
      await db.user.create({
        data: { id, tenantId, email: `fer-156-${tag}-${sufixo}@test.mz`, nome: `User ${tag}`, keycloakSub: `kc-fer-156-${tag}-${sufixo}` },
      });
    }

    colaboradorId = await criarColaborador(TENANT, 'a');
    colaboradorOutroId = await criarColaborador(OUTRO_TENANT, 'b');

    for (const [tenantId, colab, alvo] of [
      [TENANT, colaboradorId, 'meu'],
      [OUTRO_TENANT, colaboradorOutroId, 'outro'],
    ] as const) {
      const f = await db.ferias.create({
        data: {
          tenantId,
          colaboradorId: colab,
          periodoAquisitivoInicio: new Date('2026-01-01T10:00:00Z'),
          periodoAquisitivoFim: new Date('2026-12-31T10:00:00Z'),
          diasDisponiveis: 60,
          diasUsados: 0,
        },
        select: { id: true },
      });
      if (alvo === 'meu') feriasId = f.id;
      else feriasOutroId = f.id;
    }
  }, 60_000);

  // ─── aprovar / rejeitar ────────────────────────────────────────────────────

  it('rh:ferias:aprovar → aprovar grava APROVADA, aprovador, data e desconta o saldo', async () => {
    const id = await pedir(EU, 3);
    const antes = await diasUsados();

    sessao(GESTOR, ['rh:ferias:aprovar']);
    const r = await action('aprovarFeriasAction')({ solicitacaoId: id, status: 'APROVADA' });
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const s = await lerSol(id);
    expect(s.status).toBe('APROVADA');
    expect(s.aprovadoPorId).toBe(GESTOR);
    expect(s.dataAprovacao).toBeInstanceOf(Date);
    expect(await diasUsados()).toBe(antes + 3);
  });

  it('aprovar duas vezes: a segunda é recusada como regra de negócio e o saldo desconta uma só vez', async () => {
    const id = await pedir(EU, 2);
    sessao(GESTOR, ['rh:ferias:aprovar']);
    const fn = action('aprovarFeriasAction');
    expect((await fn({ solicitacaoId: id, status: 'APROVADA' })).ok).toBe(true);
    const depoisDaPrimeira = await diasUsados();

    const segunda = await fn({ solicitacaoId: id, status: 'APROVADA' });
    expect(segunda.ok).toBe(false);
    expect(segunda.error?.code, 'transição inválida chegou ao utilizador como «Erro interno»').not.toBe('ERRO_INTERNO');

    const rejeitarDepois = await fn({ solicitacaoId: id, status: 'REJEITADA', motivoRejeicao: 'Tarde demais' });
    expect(rejeitarDepois.ok).toBe(false);
    expect(rejeitarDepois.error?.code).not.toBe('ERRO_INTERNO');

    const s = await lerSol(id);
    expect(s.status).toBe('APROVADA');
    expect(s.motivoRejeicao ?? null).toBeNull();
    expect(await diasUsados()).toBe(depoisDaPrimeira);
  });

  it('rejeitar grava REJEITADA e o motivo, sem mexer no saldo', async () => {
    const id = await pedir(EU, 2);
    const antes = await diasUsados();
    const motivo = 'Período de fecho de contas';

    sessao(GESTOR, ['rh:ferias:aprovar']);
    const r = await action('aprovarFeriasAction')({ solicitacaoId: id, status: 'REJEITADA', motivoRejeicao: motivo });
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const s = await lerSol(id);
    expect(s.status).toBe('REJEITADA');
    expect(s.aprovadoPorId).toBe(GESTOR);
    expect(s.motivoRejeicao).toBe(motivo);
    expect(await diasUsados()).toBe(antes);
  });

  it('rejeitar sem motivo é recusado e o pedido continua PENDENTE', async () => {
    const id = await pedir(EU, 1);
    sessao(GESTOR, ['rh:ferias:aprovar']);
    const fn = action('aprovarFeriasAction');

    expect((await fn({ solicitacaoId: id, status: 'REJEITADA' })).ok).toBe(false);
    expect((await fn({ solicitacaoId: id, status: 'REJEITADA', motivoRejeicao: '' })).ok).toBe(false);

    const s = await lerSol(id);
    expect(s.status).toBe('PENDENTE');
    expect(s.aprovadoPorId).toBeNull();
  });

  it('sem rh:ferias:aprovar (só solicitar e aprovar ausências) → SEM_PERMISSAO, nada muda', async () => {
    const id = await pedir(EU, 1);
    const antes = await diasUsados();
    sessao(GESTOR, ['rh:ferias:solicitar', 'rh:ausencias:aprovar']);

    const ap = await action('aprovarFeriasAction')({ solicitacaoId: id, status: 'APROVADA' });
    expect(ap.ok).toBe(false);
    expect(ap.error?.code).toBe('SEM_PERMISSAO');

    const rj = await action('aprovarFeriasAction')({ solicitacaoId: id, status: 'REJEITADA', motivoRejeicao: 'x' });
    expect(rj.ok).toBe(false);
    expect(rj.error?.code).toBe('SEM_PERMISSAO');

    expect((await lerSol(id)).status).toBe('PENDENTE');
    expect(await diasUsados()).toBe(antes);
  });

  it('pedido de outro tenant → NAO_ENCONTRADO ao aprovar e rejeitar; continua PENDENTE', async () => {
    const outroCtx = { tenantId: OUTRO_TENANT, userId: OUTRO };
    const { id } = await runCtx(outroCtx, () =>
      rh.FeriasService.solicitar(
        {
          feriasId: feriasOutroId,
          dataInicio: new Date(Date.UTC(2027, 8, 1, 10)),
          dataFim: new Date(Date.UTC(2027, 8, 2, 10)),
          diasSolicitados: 2,
          tipo: 'FRACIONADA',
        } as never,
        outroCtx,
      ),
    );

    sessao(GESTOR, TODAS);
    const ap = await action('aprovarFeriasAction')({ solicitacaoId: id, status: 'APROVADA' });
    expect(ap.ok).toBe(false);
    expect(ap.error?.code).toBe('NAO_ENCONTRADO');

    const rj = await action('aprovarFeriasAction')({ solicitacaoId: id, status: 'REJEITADA', motivoRejeicao: 'Cross-tenant' });
    expect(rj.ok).toBe(false);
    expect(rj.error?.code).toBe('NAO_ENCONTRADO');

    const cc = await action('cancelarSolicitacaoFeriasAction')({ solicitacaoId: id });
    expect(cc.ok).toBe(false);
    expect(cc.error?.code).toBe('NAO_ENCONTRADO');

    expect((await lerSol(id)).status).toBe('PENDENTE');
    expect(await diasUsados(feriasOutroId)).toBe(0);
  });

  // ─── cancelar pelo próprio ─────────────────────────────────────────────────

  it('o próprio cancela o seu pedido PENDENTE: CANCELADA e os dias deixam de estar reservados', async () => {
    const id = await pedir(EU, 4);
    const ctx = { tenantId: TENANT, userId: EU };
    const saldoAntes = await runCtx(ctx, () => rh.FeriasService.obterSaldo(colaboradorId, ctx));
    const usadosAntes = await diasUsados();

    sessao(EU, ['rh:ferias:solicitar']);
    const r = await action('cancelarSolicitacaoFeriasAction')({ solicitacaoId: id });
    expect(r.ok, JSON.stringify(r)).toBe(true);

    expect((await lerSol(id)).status).toBe('CANCELADA');
    const saldoDepois = await runCtx(ctx, () => rh.FeriasService.obterSaldo(colaboradorId, ctx));
    expect(saldoDepois.diasPendentes).toBe(saldoAntes.diasPendentes - 4);
    expect(await diasUsados()).toBe(usadosAntes);
  });

  it('outro utilizador — mesmo com rh:ferias:aprovar — não cancela o pedido alheio', async () => {
    const id = await pedir(EU, 1);

    for (const perms of [['rh:ferias:solicitar'], TODAS]) {
      sessao(OUTRO, perms);
      const r = await action('cancelarSolicitacaoFeriasAction')({ solicitacaoId: id });
      expect(r.ok, `cancelou um pedido alheio com ${perms.join(',')}`).toBe(false);
      expect(r.error?.code).not.toBe('ERRO_INTERNO');
    }

    expect((await lerSol(id)).status).toBe('PENDENTE');
  });

  it('sem rh:ferias:solicitar → SEM_PERMISSAO, mesmo sendo o próprio', async () => {
    const id = await pedir(EU, 1);
    sessao(EU, ['rh:ferias:aprovar', 'rh:ferias:create']);

    const r = await action('cancelarSolicitacaoFeriasAction')({ solicitacaoId: id });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('SEM_PERMISSAO');
    expect((await lerSol(id)).status).toBe('PENDENTE');
  });

  it('o próprio não cancela um pedido já APROVADO (nem os dias voltam ao saldo)', async () => {
    const id = await pedir(EU, 2);
    sessao(GESTOR, ['rh:ferias:aprovar']);
    expect((await action('aprovarFeriasAction')({ solicitacaoId: id, status: 'APROVADA' })).ok).toBe(true);
    const usados = await diasUsados();

    sessao(EU, ['rh:ferias:solicitar']);
    const r = await action('cancelarSolicitacaoFeriasAction')({ solicitacaoId: id });
    expect(r.ok).toBe(false);
    expect(r.error?.code).not.toBe('ERRO_INTERNO');

    expect((await lerSol(id)).status).toBe('APROVADA');
    expect(await diasUsados()).toBe(usados);
  });

  it('cancelar duas vezes: a segunda é recusada como regra de negócio', async () => {
    const id = await pedir(EU, 1);
    sessao(EU, ['rh:ferias:solicitar']);
    const fn = action('cancelarSolicitacaoFeriasAction');
    expect((await fn({ solicitacaoId: id })).ok).toBe(true);

    const segunda = await fn({ solicitacaoId: id });
    expect(segunda.ok).toBe(false);
    expect(segunda.error?.code).not.toBe('ERRO_INTERNO');
    expect((await lerSol(id)).status).toBe('CANCELADA');
  });

  // ─── iniciar período aquisitivo ────────────────────────────────────────────

  const periodo = (colab: string) => ({
    colaboradorId: colab,
    periodoAquisitivoInicio: new Date('2027-01-01T10:00:00Z'),
    periodoAquisitivoFim: new Date('2027-12-31T10:00:00Z'),
    diasDisponiveis: 22,
  });

  it('rh:ferias:create → iniciar período aquisitivo cria o período do colaborador com 0 dias usados', async () => {
    sessao(GESTOR, ['rh:ferias:create']);
    const r = await action('iniciarPeriodoFeriasAction')(periodo(colaboradorId));
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const id = (r.data as { id: string }).id;
    const f = await db.ferias.findUnique({ where: { id } });
    expect(f.tenantId).toBe(TENANT);
    expect(f.colaboradorId).toBe(colaboradorId);
    expect(f.diasDisponiveis).toBe(22);
    expect(f.diasUsados).toBe(0);
  });

  it('iniciar período para colaborador de outro tenant → NAO_ENCONTRADO e nada é criado', async () => {
    sessao(GESTOR, ['rh:ferias:create']);
    const antes = await db.ferias.count({ where: { colaboradorId: colaboradorOutroId } });

    const r = await action('iniciarPeriodoFeriasAction')(periodo(colaboradorOutroId));
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NAO_ENCONTRADO');

    expect(await db.ferias.count({ where: { colaboradorId: colaboradorOutroId } })).toBe(antes);
    expect(await db.ferias.count({ where: { tenantId: TENANT, colaboradorId: colaboradorOutroId } })).toBe(0);
  });

  it('iniciar período com o fim antes do início é recusado e nada é criado', async () => {
    sessao(GESTOR, ['rh:ferias:create']);
    const antes = await db.ferias.count({ where: { tenantId: TENANT } });

    const r = await action('iniciarPeriodoFeriasAction')({
      ...periodo(colaboradorId),
      periodoAquisitivoInicio: new Date('2028-12-31T10:00:00Z'),
      periodoAquisitivoFim: new Date('2028-01-01T10:00:00Z'),
    });
    expect(r.ok).toBe(false);
    expect(await db.ferias.count({ where: { tenantId: TENANT } })).toBe(antes);
  });

  it('sem rh:ferias:create → SEM_PERMISSAO e nada é criado', async () => {
    sessao(GESTOR, ['rh:ferias:aprovar', 'rh:ferias:solicitar']);
    const antes = await db.ferias.count({ where: { tenantId: TENANT } });

    const r = await action('iniciarPeriodoFeriasAction')(periodo(colaboradorId));
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('SEM_PERMISSAO');
    expect(await db.ferias.count({ where: { tenantId: TENANT } })).toBe(antes);
  });
});
