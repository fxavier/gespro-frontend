/**
 * Oráculo — issue #168: configurações de projectos gravadas que ninguém lê.
 *
 * `ConfiguracaoProjeto` tem três campos de comportamento, escritos por
 * `actualizarConfiguracaoProjetoAction` e lidos por ninguém. Contrato (decisão do orquestrador,
 * opção conservadora onde ficou em aberto):
 *
 *   politicaAprovacaoTimesheet — LIGADA a `TimesheetService.registar` (o leitor natural):
 *     - MANUAL (omissão, com ou sem registo de configuração): o timesheet nasce por aprovar
 *       (`aprovado = false`, sem `dataAprovacao`), e as horas da tarefa não mudam;
 *     - AUTOMATICA: o timesheet nasce aprovado (`aprovado = true`, `dataAprovacao` gravada,
 *       `aprovadoPorId = null` — ninguém aprovou; atribuir a aprovação a quem regista seria
 *       falso) e as horas somam-se à tarefa, como em `aprovar`; aprovar depois → `JA_APROVADO`;
 *     - nos dois sentidos: MANUAL → AUTOMATICA → MANUAL muda o estado com que os registos
 *       seguintes nascem; os já gravados não mudam (append-only);
 *     - a configuração de um projecto não afecta outro projecto.
 *
 *   tiposTarefaAtivos — LIGADA a `TarefaService.criar` (o leitor natural):
 *     - tipo fora da lista activa → `BusinessRuleError` `TIPO_TAREFA_INATIVO` e nada é criado
 *       (recusar > gravar um tipo que a configuração diz desligado);
 *     - tipo na lista → cria; sem configuração gravada todos os tipos estão activos;
 *     - nos dois sentidos: desligar recusa, voltar a ligar aceita;
 *     - editar uma tarefa já existente cujo tipo foi desligado continua a funcionar (o tipo não se
 *       edita; a configuração não apaga nem bloqueia o que existe).
 *
 *   papeisEquipaAtivos — RETIRADA: os papéis vivem em `MembroEquipa`, que pertence a uma
 *     `Equipa` partilhável por vários projectos — não há leitor natural por projecto. Sai do
 *     formulário e do schema da action; a coluna fica (sem migração — menos dados alterados).
 *     Aqui prova-se que a action deixa de a escrever; o schema e o formulário são provados em
 *     `src/lib/validations/__tests__/configuracao-projeto-168.test.ts`.
 *
 * Sessão (`@/lib/auth`) é o único duplo (fronteira), mutável por `vi.hoisted`. `next/cache` é
 * dobrado porque o `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero,
 * `createSafeAction` e os serviços de projectos.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó A:projectos-configuracoes-168; um agente de implementação que o
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
  'projetos:config:read',
  'projetos:config:update',
  'projetos:tarefas:read',
  'projetos:tarefas:create',
  'projetos:tarefas:update',
  'projetos:timesheets:read',
  'projetos:timesheets:create',
  'projetos:timesheets:aprovar',
];

const TODOS_TIPOS = ['TAREFA', 'BUG', 'MELHORIA', 'DOCUMENTACAO', 'TESTE'];

describe.skipIf(skip)('Projectos — configurações lidas pelo comportamento (#168) — DB efémera', () => {
  let db: any;
  let actions: Record<string, (input: unknown) => Promise<Resultado>>;

  const sufixo = Date.now();
  const TENANT = `tenant-proj-168-${sufixo}`;
  const USER = `user-proj-168-${sufixo}`;

  let colaboradorId: string;
  let seq = 0;

  function sessao(permissions: string[] = TODAS) {
    h.sessao = { user: { id: USER, tenantId: TENANT, permissions, acesso: 'aberto' } };
  }

  function action(nome: string) {
    const fn = actions[nome];
    expect(typeof fn, `${nome} não está exportada de projetos.actions.ts`).toBe('function');
    return fn;
  }

  async function projetoCru(): Promise<string> {
    seq += 1;
    const p = await db.projeto.create({
      data: {
        tenantId: TENANT,
        codigo: `PRJ-168-${sufixo}-${seq}`,
        nome: `Projecto 168 ${seq}`,
        tipo: 'INTERNO',
        status: 'EM_ANDAMENTO',
        prioridade: 'MEDIA',
        dataInicio: new Date('2027-01-04T10:00:00Z'),
        dataFimPrevista: new Date('2027-06-30T10:00:00Z'),
        tags: [],
      },
      select: { id: true },
    });
    return p.id;
  }

  async function configurar(
    projetoId: string,
    cfg: { politicaAprovacaoTimesheet?: 'MANUAL' | 'AUTOMATICA'; tiposTarefaAtivos?: string[] },
  ) {
    const r = await action('actualizarConfiguracaoProjetoAction')({
      projetoId,
      politicaAprovacaoTimesheet: cfg.politicaAprovacaoTimesheet ?? 'MANUAL',
      tiposTarefaAtivos: cfg.tiposTarefaAtivos ?? TODOS_TIPOS,
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  }

  async function criarTarefa(projetoId: string, tipo?: string): Promise<Resultado> {
    seq += 1;
    return action('criarTarefaAction')({
      projetoId,
      codigo: `T168-${seq}`,
      titulo: `Tarefa ${seq}`,
      ...(tipo ? { tipo } : {}),
      dataFimPrevista: '2027-03-31',
    });
  }

  async function novaTarefa(projetoId: string, tipo?: string): Promise<string> {
    const r = await criarTarefa(projetoId, tipo);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    return r.data.id as string;
  }

  async function registarTimesheet(projetoId: string, tarefaId?: string): Promise<string> {
    const r = await action('registarTimesheetAction')({
      projetoId,
      tarefaId,
      colaboradorId,
      data: '2027-02-10',
      horaInicio: '2027-02-10T07:00:00Z',
      horaFim: '2027-02-10T09:00:00Z',
      tipo: 'DESENVOLVIMENTO',
      faturavel: false,
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    return r.data.id as string;
  }

  const lerTarefa = (id: string) => db.tarefaProjeto.findUnique({ where: { id } });
  const lerTimesheet = (id: string) => db.timesheet.findUnique({ where: { id } });
  const contarTarefas = (projetoId: string) => db.tarefaProjeto.count({ where: { projetoId } });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    actions = (await import('@/server/actions/projetos.actions')) as unknown as typeof actions;

    await db.tenant.create({
      data: { id: TENANT, nome: `Tenant proj-168-${sufixo}`, slug: `proj-168-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `proj-168-${sufixo}@test.mz`, nome: 'Gestor de Projectos', keycloakSub: `kc-proj-168-${sufixo}` },
    });
    const c = await db.colaborador.create({
      data: {
        tenantId: TENANT,
        codigo: `COL-168-${sufixo}`,
        nome: 'Colaborador 168',
        dataNascimento: new Date('1990-05-05T00:00:00Z'),
        genero: 'FEMININO',
        estadoCivil: 'SOLTEIRO',
        nacionalidade: 'Moçambicana',
        naturalidadeProvincia: 'Maputo',
        naturalidadeDistrito: 'KaMpfumo',
        bi: '110100000168A',
        nuit: '400000168',
        email: `colab-168-${sufixo}@test.mz`,
        telefone: '+258840000168',
        enderecoRua: 'Av. 24 de Julho',
        enderecoNumero: '1',
        enderecoBairro: 'Polana',
        enderecoCidade: 'Maputo',
        enderecoProvincia: 'Maputo',
        emergenciaNome: 'Contacto',
        emergenciaParentesco: 'Irmão',
        emergenciaTelefone: '+258840000169',
        dataAdmissao: new Date('2020-01-01T00:00:00Z'),
        status: 'ACTIVO',
        tipoContrato: 'EFECTIVO',
        regimeTrabalho: 'TEMPO_INTEGRAL',
        salarioBase: '30000.00',
        nivelAcesso: 'USUARIO',
      },
      select: { id: true },
    });
    colaboradorId = c.id;
  }, 60_000);

  beforeEach(() => {
    sessao();
  });

  // ─────────────────── politicaAprovacaoTimesheet ───────────────────

  describe('política de aprovação de timesheet', () => {
    it('sem configuração gravada (omissão MANUAL): o timesheet nasce por aprovar e as horas não mudam', async () => {
      const projetoId = await projetoCru();
      const tarefaId = await novaTarefa(projetoId);
      const id = await registarTimesheet(projetoId, tarefaId);

      const ts = await lerTimesheet(id);
      expect(ts.aprovado).toBe(false);
      expect(ts.dataAprovacao).toBeNull();
      expect(ts.aprovadoPorId).toBeNull();
      expect((await lerTarefa(tarefaId)).horasTrabalhadas).toBe(0);
    });

    it('MANUAL gravada: o timesheet nasce por aprovar', async () => {
      const projetoId = await projetoCru();
      await configurar(projetoId, { politicaAprovacaoTimesheet: 'MANUAL' });
      const tarefaId = await novaTarefa(projetoId);
      const id = await registarTimesheet(projetoId, tarefaId);

      const ts = await lerTimesheet(id);
      expect(ts.aprovado).toBe(false);
      expect(ts.dataAprovacao).toBeNull();
      expect((await lerTarefa(tarefaId)).horasTrabalhadas).toBe(0);
    });

    it('AUTOMATICA: o timesheet nasce aprovado (sem aprovador humano), soma as horas à tarefa e não se aprova outra vez', async () => {
      const projetoId = await projetoCru();
      await configurar(projetoId, { politicaAprovacaoTimesheet: 'AUTOMATICA' });
      const tarefaId = await novaTarefa(projetoId);
      const id = await registarTimesheet(projetoId, tarefaId);

      const ts = await lerTimesheet(id);
      expect(ts.aprovado).toBe(true);
      expect(ts.dataAprovacao).toBeInstanceOf(Date);
      expect(ts.aprovadoPorId).toBeNull();
      expect(ts.motivoRejeicao).toBeNull();
      expect((await lerTarefa(tarefaId)).horasTrabalhadas).toBe(2);

      const outra = await action('aprovarTimesheetAction')({ id });
      expect(outra.ok).toBe(false);
      expect(outra.error?.code).toBe('JA_APROVADO');
      expect((await lerTarefa(tarefaId)).horasTrabalhadas).toBe(2);
    });

    it('AUTOMATICA sem tarefa associada: nasce aprovado na mesma', async () => {
      const projetoId = await projetoCru();
      await configurar(projetoId, { politicaAprovacaoTimesheet: 'AUTOMATICA' });
      const id = await registarTimesheet(projetoId);
      const ts = await lerTimesheet(id);
      expect(ts.aprovado).toBe(true);
      expect(ts.dataAprovacao).toBeInstanceOf(Date);
    });

    it('nos dois sentidos: MANUAL → AUTOMATICA → MANUAL muda os registos seguintes e não toca nos já gravados', async () => {
      const projetoId = await projetoCru();
      const tarefaId = await novaTarefa(projetoId);

      await configurar(projetoId, { politicaAprovacaoTimesheet: 'MANUAL' });
      const t1 = await registarTimesheet(projetoId, tarefaId);
      expect((await lerTimesheet(t1)).aprovado).toBe(false);

      await configurar(projetoId, { politicaAprovacaoTimesheet: 'AUTOMATICA' });
      const t2 = await registarTimesheet(projetoId, tarefaId);
      expect((await lerTimesheet(t2)).aprovado).toBe(true);
      // O registo anterior não é aprovado retroactivamente pela mudança de política.
      expect((await lerTimesheet(t1)).aprovado).toBe(false);
      expect((await lerTarefa(tarefaId)).horasTrabalhadas).toBe(2);

      await configurar(projetoId, { politicaAprovacaoTimesheet: 'MANUAL' });
      const t3 = await registarTimesheet(projetoId, tarefaId);
      const ts3 = await lerTimesheet(t3);
      expect(ts3.aprovado).toBe(false);
      expect(ts3.dataAprovacao).toBeNull();
      // O que já estava aprovado continua aprovado.
      expect((await lerTimesheet(t2)).aprovado).toBe(true);
      expect((await lerTarefa(tarefaId)).horasTrabalhadas).toBe(2);
    });

    it('a política de um projecto não se aplica a outro projecto', async () => {
      const automatico = await projetoCru();
      const manual = await projetoCru();
      await configurar(automatico, { politicaAprovacaoTimesheet: 'AUTOMATICA' });

      const idManual = await registarTimesheet(manual);
      expect((await lerTimesheet(idManual)).aprovado).toBe(false);
      const idAuto = await registarTimesheet(automatico);
      expect((await lerTimesheet(idAuto)).aprovado).toBe(true);
    });
  });

  // ─────────────────────── tiposTarefaAtivos ───────────────────────

  describe('tipos de tarefa activos', () => {
    it('sem configuração gravada: todos os tipos são aceites', async () => {
      const projetoId = await projetoCru();
      for (const tipo of TODOS_TIPOS) {
        const r = await criarTarefa(projetoId, tipo);
        expect(r.ok, `${tipo}: ${JSON.stringify(r)}`).toBe(true);
      }
      expect(await contarTarefas(projetoId)).toBe(TODOS_TIPOS.length);
    });

    it('tipo desligado → TIPO_TAREFA_INATIVO e nada é criado; tipo ligado → cria', async () => {
      const projetoId = await projetoCru();
      await configurar(projetoId, { tiposTarefaAtivos: ['TAREFA', 'MELHORIA'] });

      const recusada = await criarTarefa(projetoId, 'BUG');
      expect(recusada.ok).toBe(false);
      expect(recusada.error?.code).toBe('TIPO_TAREFA_INATIVO');
      expect(await contarTarefas(projetoId)).toBe(0);

      const aceite = await criarTarefa(projetoId, 'MELHORIA');
      expect(aceite.ok, JSON.stringify(aceite)).toBe(true);
      expect((await lerTarefa(aceite.data.id)).tipo).toBe('MELHORIA');
      expect(await contarTarefas(projetoId)).toBe(1);
    });

    it('nos dois sentidos: desligar recusa, voltar a ligar aceita', async () => {
      const projetoId = await projetoCru();

      await configurar(projetoId, { tiposTarefaAtivos: ['TAREFA'] });
      const r1 = await criarTarefa(projetoId, 'TESTE');
      expect(r1.ok).toBe(false);
      expect(r1.error?.code).toBe('TIPO_TAREFA_INATIVO');

      await configurar(projetoId, { tiposTarefaAtivos: ['TAREFA', 'TESTE'] });
      const r2 = await criarTarefa(projetoId, 'TESTE');
      expect(r2.ok, JSON.stringify(r2)).toBe(true);

      await configurar(projetoId, { tiposTarefaAtivos: ['TAREFA'] });
      const r3 = await criarTarefa(projetoId, 'TESTE');
      expect(r3.ok).toBe(false);
      expect(r3.error?.code).toBe('TIPO_TAREFA_INATIVO');

      expect(await contarTarefas(projetoId)).toBe(1);
    });

    it('a lista de um projecto não se aplica a outro projecto', async () => {
      const restrito = await projetoCru();
      const livre = await projetoCru();
      await configurar(restrito, { tiposTarefaAtivos: ['TAREFA'] });

      expect((await criarTarefa(livre, 'BUG')).ok).toBe(true);
      expect((await criarTarefa(restrito, 'BUG')).error?.code).toBe('TIPO_TAREFA_INATIVO');
    });

    it('editar uma tarefa existente cujo tipo foi desligado continua a funcionar', async () => {
      const projetoId = await projetoCru();
      const tarefaId = await novaTarefa(projetoId, 'BUG');
      await configurar(projetoId, { tiposTarefaAtivos: ['TAREFA'] });

      const r = await action('actualizarTarefaAction')({ id: tarefaId, data: { titulo: 'Título revisto' } });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      const t = await lerTarefa(tarefaId);
      expect(t.titulo).toBe('Título revisto');
      expect(t.tipo).toBe('BUG');
    });
  });

  // ─────────────────────── papeisEquipaAtivos ───────────────────────

  describe('papéis de equipa activos (retirados)', () => {
    it('a action deixa de escrever papeisEquipaAtivos — enviado ou não, a coluna não guarda escolha nenhuma', async () => {
      const projetoId = await projetoCru();
      const r = await action('actualizarConfiguracaoProjetoAction')({
        projetoId,
        politicaAprovacaoTimesheet: 'MANUAL',
        tiposTarefaAtivos: TODOS_TIPOS,
        papeisEquipaAtivos: ['GERENTE'],
      });
      expect(r.ok, JSON.stringify(r)).toBe(true);

      const cfg = await db.configuracaoProjeto.findUnique({ where: { projetoId } });
      expect(cfg).not.toBeNull();
      expect(cfg.tiposTarefaAtivos).toEqual(TODOS_TIPOS);
      // Nada lê esta escolha; gravá-la seria prometer um comportamento que não existe.
      expect(cfg.papeisEquipaAtivos).toEqual([]);
    });
  });
});
