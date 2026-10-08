/**
 * Oráculo — issue #167: projectos sem mudar estado, criar/editar tarefas, aprovar timesheets nem
 * criar marcos.
 *
 * As actions de transição do projecto, de criar/editar tarefa, de aprovar timesheet e de criar
 * marco já existem em `src/server/actions/projetos.actions.ts`; faltam a UI e duas peças de
 * servidor. Este ficheiro prova o lado do servidor (a UI é provada em
 * `e2e/51-projectos-transicoes-167.spec.ts`). Contrato:
 *
 *   Projecto (regressão — o ecrã passa a chamar `transitarStatusProjetoAction`):
 *     - PLANEAMENTO → EM_ANDAMENTO → PAUSADO → EM_ANDAMENTO → CONCLUIDO (grava `dataFimReal`)
 *       → ARQUIVADO; uma transição fora de `TRANSICOES_PROJETO` → `TRANSICAO_INVALIDA` e nada
 *       muda; sem `projetos:update` → `SEM_PERMISSAO`; projecto de outro tenant → `NAO_ENCONTRADO`.
 *
 *   Tarefa:
 *     - `criarTarefaAction` cria em `A_FAZER` com `criadoPorId` = utilizador da sessão;
 *     - NOVO: um `projetoId` de OUTRO tenant é recusado com `NAO_ENCONTRADO` e não cria nada
 *       (o formulário recebe o projecto do cliente; hoje o serviço grava a tarefa pendurada no
 *       projecto alheio);
 *     - `actualizarTarefaAction` edita o título; tarefa de outro tenant → `NAO_ENCONTRADO`;
 *     - NOVO: `TarefaService.obter(id, ctx)` (para o detalhe e o editar) devolve a tarefa com
 *       `id`, `codigo`, `titulo`, `status` e `projetoId`; de outro tenant → `NotFoundError`.
 *
 *   Timesheet:
 *     - `aprovarTimesheetAction` (regressão): grava `aprovado`, `aprovadoPorId`, `dataAprovacao`
 *       e soma as horas à tarefa; aprovar duas vezes é recusado;
 *     - NOVO: `rejeitarTimesheetAction({ id, motivoRejeicao })`, mesma permissão
 *       `projetos:timesheets:aprovar` (sem permissão nova): grava `motivoRejeicao` (coluna nova em
 *       `Timesheet`, molde de `Ausencia`), o registo continua `aprovado = false` e as horas da
 *       tarefa não mudam; sem motivo (ou só espaços) não rejeita; um timesheet já aprovado não
 *       se rejeita; um rejeitado não se aprova depois nem se rejeita outra vez (decisão
 *       conservadora: rejeitar é terminal — recusar > número errado); outro tenant →
 *       `NAO_ENCONTRADO`; sem permissão → `SEM_PERMISSAO`.
 *
 *   Marco:
 *     - `criarMarcoAction` cria em `PENDENTE`; NOVO: `projetoId` de outro tenant → `NAO_ENCONTRADO`
 *       e nada é criado; `transitarStatusMarcoAction` PENDENTE → EM_ANDAMENTO → CONCLUIDO grava
 *       `dataReal` e `progresso` 100.
 *
 * Sessão (`@/lib/auth`) é o único duplo (fronteira), mutável por `vi.hoisted`. `next/cache` é
 * dobrado porque o `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero,
 * `createSafeAction` e os serviços de projectos. Tenants, utilizador, colaborador e o projecto do
 * outro tenant são escritos pelo client cru (não são documentos numerados nem lançamentos).
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó D:projectos-transicoes-167; um agente de implementação que o
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

type Resultado = { ok: boolean; data?: any; error?: { code: string; message: string } };

const TODAS = [
  'projetos:read',
  'projetos:create',
  'projetos:update',
  'projetos:tarefas:read',
  'projetos:tarefas:create',
  'projetos:tarefas:update',
  'projetos:timesheets:read',
  'projetos:timesheets:create',
  'projetos:timesheets:aprovar',
  'projetos:marcos:create',
  'projetos:marcos:update',
];

describe.skipIf(skip)('Projectos — transições, tarefas, timesheets e marcos (#167) — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let svc: typeof import('@/server/services/pessoas-projetos/projetos.service');
  // Acesso dinâmico: `rejeitarTimesheetAction` ainda não existe — falha o caso, não o ficheiro.
  let actions: Record<string, (input: unknown) => Promise<Resultado>>;

  const sufixo = Date.now();
  const TENANT = `tenant-proj-167-${sufixo}`;
  const OUTRO_TENANT = `tenant-proj-167-outro-${sufixo}`;
  const USER = `user-proj-167-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  let colaboradorId: string;
  let colaboradorOutroId: string;
  let projetoOutroId: string;
  let seq = 0;

  function sessao(permissions: string[] = TODAS) {
    h.sessao = { user: { id: USER, tenantId: TENANT, permissions, acesso: 'aberto' } };
  }

  function action(nome: string) {
    const fn = actions[nome];
    expect(typeof fn, `${nome} não está exportada de projetos.actions.ts`).toBe('function');
    return fn;
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

  async function projetoCru(tenant: string, status = 'PLANEAMENTO'): Promise<string> {
    seq += 1;
    const p = await db.projeto.create({
      data: {
        tenantId: tenant,
        codigo: `PRJ-167-${sufixo}-${seq}`,
        nome: `Projecto 167 ${seq}`,
        tipo: 'INTERNO',
        status,
        prioridade: 'MEDIA',
        dataInicio: new Date('2027-01-04T10:00:00Z'),
        dataFimPrevista: new Date('2027-06-30T10:00:00Z'),
        tags: [],
      },
      select: { id: true },
    });
    return p.id;
  }

  async function novaTarefa(projetoId: string): Promise<string> {
    seq += 1;
    const r = await action('criarTarefaAction')({
      projetoId,
      codigo: `T167-${seq}`,
      titulo: `Tarefa ${seq}`,
      dataFimPrevista: '2027-03-31',
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    return r.data.id as string;
  }

  async function novoTimesheet(projetoId: string, tarefaId?: string, tenant = TENANT, colab?: string): Promise<string> {
    const c = { tenantId: tenant, userId: USER };
    const { id } = await runCtx(c, () =>
      svc.TimesheetService.registar(
        {
          projetoId,
          tarefaId,
          colaboradorId: colab ?? colaboradorId,
          data: new Date('2027-02-10T00:00:00Z'),
          horaInicio: new Date('2027-02-10T07:00:00Z'),
          horaFim: new Date('2027-02-10T09:00:00Z'),
          tipo: 'DESENVOLVIMENTO',
          faturavel: false,
        } as never,
        c,
      ),
    );
    return id;
  }

  const lerProjeto = (id: string) => db.projeto.findUnique({ where: { id } });
  const lerTarefa = (id: string) => db.tarefaProjeto.findUnique({ where: { id } });
  const lerTimesheet = (id: string) => db.timesheet.findUnique({ where: { id } });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    svc = await import('@/server/services/pessoas-projetos/projetos.service');
    actions = (await import('@/server/actions/projetos.actions')) as unknown as typeof actions;

    for (const [id, slug, nuit] of [
      [TENANT, `proj-167-${sufixo}`, `${sufixo}`.slice(-9)],
      [OUTRO_TENANT, `proj-167-outro-${sufixo}`, `${sufixo + 1}`.slice(-9)],
    ] as const) {
      await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit } });
    }
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `proj-167-${sufixo}@test.mz`, nome: 'Gestor de Projectos', keycloakSub: `kc-proj-167-${sufixo}` },
    });

    colaboradorId = await criarColaborador(TENANT, 'a');
    colaboradorOutroId = await criarColaborador(OUTRO_TENANT, 'b');
    projetoOutroId = await projetoCru(OUTRO_TENANT);
  }, 60_000);

  beforeEach(() => {
    sessao();
  });

  // ───────────────────────────── Projecto ─────────────────────────────

  describe('transições do projecto', () => {
    it('percorre PLANEAMENTO → EM_ANDAMENTO → PAUSADO → EM_ANDAMENTO → CONCLUIDO → ARQUIVADO', async () => {
      const id = await projetoCru(TENANT);
      const fn = action('transitarStatusProjetoAction');

      for (const alvo of ['EM_ANDAMENTO', 'PAUSADO', 'EM_ANDAMENTO']) {
        const r = await fn({ id, novoStatus: alvo });
        expect(r.ok, `${alvo}: ${JSON.stringify(r)}`).toBe(true);
        expect((await lerProjeto(id)).status).toBe(alvo);
      }
      expect((await lerProjeto(id)).dataFimReal).toBeNull();

      const concluir = await fn({ id, novoStatus: 'CONCLUIDO' });
      expect(concluir.ok, JSON.stringify(concluir)).toBe(true);
      const concluido = await lerProjeto(id);
      expect(concluido.status).toBe('CONCLUIDO');
      expect(concluido.dataFimReal).toBeInstanceOf(Date);

      const arquivar = await fn({ id, novoStatus: 'ARQUIVADO' });
      expect(arquivar.ok, JSON.stringify(arquivar)).toBe(true);
      expect((await lerProjeto(id)).status).toBe('ARQUIVADO');
    });

    it('transição fora do mapa (PLANEAMENTO → CONCLUIDO) → TRANSICAO_INVALIDA e nada muda', async () => {
      const id = await projetoCru(TENANT);
      const r = await action('transitarStatusProjetoAction')({ id, novoStatus: 'CONCLUIDO' });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('TRANSICAO_INVALIDA');
      const p = await lerProjeto(id);
      expect(p.status).toBe('PLANEAMENTO');
      expect(p.dataFimReal).toBeNull();
    });

    it('sem projetos:update → SEM_PERMISSAO; projecto de outro tenant → NAO_ENCONTRADO', async () => {
      const id = await projetoCru(TENANT);
      sessao(['projetos:read']);
      const semPerm = await action('transitarStatusProjetoAction')({ id, novoStatus: 'EM_ANDAMENTO' });
      expect(semPerm.ok).toBe(false);
      expect(semPerm.error?.code).toBe('SEM_PERMISSAO');
      expect((await lerProjeto(id)).status).toBe('PLANEAMENTO');

      sessao();
      const alheio = await action('transitarStatusProjetoAction')({ id: projetoOutroId, novoStatus: 'EM_ANDAMENTO' });
      expect(alheio.ok).toBe(false);
      expect(alheio.error?.code).toBe('NAO_ENCONTRADO');
      expect((await lerProjeto(projetoOutroId)).status).toBe('PLANEAMENTO');
    });
  });

  // ───────────────────────────── Tarefas ─────────────────────────────

  describe('criar e editar tarefas', () => {
    it('criarTarefaAction cria em A_FAZER no projecto, com criadoPorId = utilizador da sessão', async () => {
      const projetoId = await projetoCru(TENANT, 'EM_ANDAMENTO');
      const id = await novaTarefa(projetoId);
      const t = await lerTarefa(id);
      expect(t.tenantId).toBe(TENANT);
      expect(t.projetoId).toBe(projetoId);
      expect(t.status).toBe('A_FAZER');
      expect(t.criadoPorId).toBe(USER);
    });

    it('criarTarefaAction com projecto de OUTRO tenant → NAO_ENCONTRADO e nada é criado', async () => {
      const r = await action('criarTarefaAction')({
        projetoId: projetoOutroId,
        codigo: `T167-X-${sufixo}`,
        titulo: 'Tarefa pendurada em projecto alheio',
        dataFimPrevista: '2027-03-31',
      });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('NAO_ENCONTRADO');
      expect(await db.tarefaProjeto.count({ where: { projetoId: projetoOutroId } })).toBe(0);
      expect(await db.tarefaProjeto.count({ where: { tenantId: TENANT, codigo: `T167-X-${sufixo}` } })).toBe(0);
    });

    it('actualizarTarefaAction edita o título; tarefa de outro tenant → NAO_ENCONTRADO', async () => {
      const projetoId = await projetoCru(TENANT, 'EM_ANDAMENTO');
      const id = await novaTarefa(projetoId);
      const r = await action('actualizarTarefaAction')({ id, data: { titulo: 'Título revisto' } });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      expect((await lerTarefa(id)).titulo).toBe('Título revisto');

      const alheia = await db.tarefaProjeto.create({
        data: {
          tenantId: OUTRO_TENANT,
          projetoId: projetoOutroId,
          codigo: `T167-OUTRA-${sufixo}`,
          titulo: 'Tarefa alheia',
          tipo: 'TAREFA',
          status: 'A_FAZER',
          prioridade: 'MEDIA',
          dataFimPrevista: new Date('2027-03-31T10:00:00Z'),
          criadoPorId: 'outro',
          dependencias: [],
          tags: [],
        },
        select: { id: true },
      });
      const x = await action('actualizarTarefaAction')({ id: alheia.id, data: { titulo: 'Invadida' } });
      expect(x.ok).toBe(false);
      expect(x.error?.code).toBe('NAO_ENCONTRADO');
      expect((await lerTarefa(alheia.id)).titulo).toBe('Tarefa alheia');
    });

    it('TarefaService.obter devolve a tarefa do tenant e recusa a de outro tenant (NotFoundError)', async () => {
      const obter = (svc.TarefaService as any).obter as undefined | ((id: string, c: typeof ctx) => Promise<any>);
      expect(typeof obter, 'TarefaService.obter não existe').toBe('function');

      const projetoId = await projetoCru(TENANT, 'EM_ANDAMENTO');
      const id = await novaTarefa(projetoId);
      const t = await noCtx(() => obter!.call(svc.TarefaService, id, ctx));
      expect(t).toMatchObject({ id, status: 'A_FAZER', projetoId });
      expect(typeof t.codigo).toBe('string');
      expect(typeof t.titulo).toBe('string');

      const outroCtx = { tenantId: OUTRO_TENANT, userId: USER };
      await expect(runCtx(outroCtx, () => obter!.call(svc.TarefaService, id, outroCtx))).rejects.toMatchObject({
        code: 'NAO_ENCONTRADO',
      });
    });
  });

  // ───────────────────────────── Timesheets ─────────────────────────────

  describe('aprovar e rejeitar timesheets', () => {
    it('aprovar grava aprovado, aprovadoPorId, dataAprovacao e soma as horas à tarefa; a segunda vez é recusada', async () => {
      const projetoId = await projetoCru(TENANT, 'EM_ANDAMENTO');
      const tarefaId = await novaTarefa(projetoId);
      const id = await novoTimesheet(projetoId, tarefaId);

      const r = await action('aprovarTimesheetAction')({ id });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      const ts = await lerTimesheet(id);
      expect(ts.aprovado).toBe(true);
      expect(ts.aprovadoPorId).toBe(USER);
      expect(ts.dataAprovacao).toBeInstanceOf(Date);
      expect((await lerTarefa(tarefaId)).horasTrabalhadas).toBe(2);

      const outra = await action('aprovarTimesheetAction')({ id });
      expect(outra.ok).toBe(false);
      expect((await lerTarefa(tarefaId)).horasTrabalhadas).toBe(2);
    });

    it('rejeitar grava o motivoRejeicao, continua por aprovar e não mexe nas horas da tarefa', async () => {
      const projetoId = await projetoCru(TENANT, 'EM_ANDAMENTO');
      const tarefaId = await novaTarefa(projetoId);
      const id = await novoTimesheet(projetoId, tarefaId);
      const motivo = 'Horas fora do âmbito da tarefa';

      const r = await action('rejeitarTimesheetAction')({ id, motivoRejeicao: motivo });
      expect(r.ok, JSON.stringify(r)).toBe(true);

      const ts = await lerTimesheet(id);
      expect((ts as any).motivoRejeicao).toBe(motivo);
      expect(ts.aprovado).toBe(false);
      expect((await lerTarefa(tarefaId)).horasTrabalhadas).toBe(0);
    });

    it('rejeitar é terminal: o rejeitado não se aprova depois nem se rejeita outra vez', async () => {
      const projetoId = await projetoCru(TENANT, 'EM_ANDAMENTO');
      const tarefaId = await novaTarefa(projetoId);
      const id = await novoTimesheet(projetoId, tarefaId);
      expect((await action('rejeitarTimesheetAction')({ id, motivoRejeicao: 'Duplicado' })).ok).toBe(true);

      const ap = await action('aprovarTimesheetAction')({ id });
      expect(ap.ok).toBe(false);
      const rj = await action('rejeitarTimesheetAction')({ id, motivoRejeicao: 'Outro motivo' });
      expect(rj.ok).toBe(false);

      const ts = await lerTimesheet(id);
      expect(ts.aprovado).toBe(false);
      expect(ts.aprovadoPorId).toBeNull();
      expect((ts as any).motivoRejeicao).toBe('Duplicado');
      expect((await lerTarefa(tarefaId)).horasTrabalhadas).toBe(0);
    });

    it('rejeitar sem motivo (ausente, vazio ou só espaços) é recusado e nada muda', async () => {
      const projetoId = await projetoCru(TENANT, 'EM_ANDAMENTO');
      const id = await novoTimesheet(projetoId);
      const fn = action('rejeitarTimesheetAction');

      for (const input of [{ id }, { id, motivoRejeicao: '' }, { id, motivoRejeicao: '   ' }]) {
        const r = await fn(input);
        expect(r.ok, JSON.stringify(input)).toBe(false);
      }
      const ts = await lerTimesheet(id);
      expect(ts.aprovado).toBe(false);
      expect((ts as any).motivoRejeicao ?? null).toBeNull();
    });

    it('um timesheet já aprovado não se rejeita (nem o motivo é escrito, nem as horas descem)', async () => {
      const projetoId = await projetoCru(TENANT, 'EM_ANDAMENTO');
      const tarefaId = await novaTarefa(projetoId);
      const id = await novoTimesheet(projetoId, tarefaId);
      expect((await action('aprovarTimesheetAction')({ id })).ok).toBe(true);

      const rj = await action('rejeitarTimesheetAction')({ id, motivoRejeicao: 'Tarde demais' });
      expect(rj.ok).toBe(false);

      const ts = await lerTimesheet(id);
      expect(ts.aprovado).toBe(true);
      expect((ts as any).motivoRejeicao ?? null).toBeNull();
      expect((await lerTarefa(tarefaId)).horasTrabalhadas).toBe(2);
    });

    it('sem projetos:timesheets:aprovar → SEM_PERMISSAO para aprovar e para rejeitar; nada muda', async () => {
      const projetoId = await projetoCru(TENANT, 'EM_ANDAMENTO');
      const id = await novoTimesheet(projetoId);
      sessao(['projetos:timesheets:read', 'projetos:timesheets:create']);

      const ap = await action('aprovarTimesheetAction')({ id });
      expect(ap.ok).toBe(false);
      expect(ap.error?.code).toBe('SEM_PERMISSAO');
      const rj = await action('rejeitarTimesheetAction')({ id, motivoRejeicao: 'x' });
      expect(rj.ok).toBe(false);
      expect(rj.error?.code).toBe('SEM_PERMISSAO');

      const ts = await lerTimesheet(id);
      expect(ts.aprovado).toBe(false);
      expect((ts as any).motivoRejeicao ?? null).toBeNull();
    });

    it('timesheet de outro tenant → NAO_ENCONTRADO para aprovar e para rejeitar; nada muda', async () => {
      const id = await novoTimesheet(projetoOutroId, undefined, OUTRO_TENANT, colaboradorOutroId);

      const ap = await action('aprovarTimesheetAction')({ id });
      expect(ap.ok).toBe(false);
      expect(ap.error?.code).toBe('NAO_ENCONTRADO');
      const rj = await action('rejeitarTimesheetAction')({ id, motivoRejeicao: 'Cross-tenant' });
      expect(rj.ok).toBe(false);
      expect(rj.error?.code).toBe('NAO_ENCONTRADO');

      const ts = await lerTimesheet(id);
      expect(ts.aprovado).toBe(false);
      expect((ts as any).motivoRejeicao ?? null).toBeNull();
    });
  });

  // ───────────────────────────── Marcos ─────────────────────────────

  describe('criar marcos', () => {
    it('criarMarcoAction cria em PENDENTE; a transição PENDENTE → EM_ANDAMENTO → CONCLUIDO grava dataReal e 100%', async () => {
      const projetoId = await projetoCru(TENANT, 'EM_ANDAMENTO');
      const r = await action('criarMarcoAction')({ projetoId, nome: 'Entrega da fase 1', dataPrevista: '2027-04-15' });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      const id = r.data.id as string;

      const m = await db.marco.findUnique({ where: { id } });
      expect(m.tenantId).toBe(TENANT);
      expect(m.projetoId).toBe(projetoId);
      expect(m.status).toBe('PENDENTE');

      const fn = action('transitarStatusMarcoAction');
      expect((await fn({ id, novoStatus: 'EM_ANDAMENTO' })).ok).toBe(true);
      const c = await fn({ id, novoStatus: 'CONCLUIDO' });
      expect(c.ok, JSON.stringify(c)).toBe(true);
      const fim = await db.marco.findUnique({ where: { id } });
      expect(fim.status).toBe('CONCLUIDO');
      expect(fim.dataReal).toBeInstanceOf(Date);
      expect(fim.progresso).toBe(100);
    });

    it('criarMarcoAction com projecto de OUTRO tenant → NAO_ENCONTRADO e nada é criado', async () => {
      const r = await action('criarMarcoAction')({
        projetoId: projetoOutroId,
        nome: 'Marco pendurado em projecto alheio',
        dataPrevista: '2027-04-15',
      });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('NAO_ENCONTRADO');
      expect(await db.marco.count({ where: { projetoId: projetoOutroId } })).toBe(0);
    });
  });
});
