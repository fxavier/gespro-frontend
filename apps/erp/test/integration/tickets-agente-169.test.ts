/**
 * Oráculo — issue #169: tickets sem atribuir agente, comentar ou avaliar; ABERTO → EM_PROGRESSO
 * exige agente e é, por isso, inalcançável («Os Meus Tickets» sempre vazio).
 *
 * O serviço (`ticket.service.ts`) e as actions (`tickets.actions.ts`) de atribuir, comentar,
 * avaliar e transitar já existem; falta a UI (provada em `e2e/52-tickets-agente-169.spec.ts`) e
 * as peças de servidor de que a UI precisa. Este ficheiro prova o lado do servidor. Contrato:
 *
 *   Procurar agentes (NOVO — alimenta o `ComboboxRemoto` de utilizadores do detalhe):
 *     - `procurarAgentesTicketAction({ q })`, permissão `tickets:atribuir`, leitura
 *       (`permiteEmLeitura: true`, sem `revalidate`), molde `procurarAprovadoresAction`: devolve
 *       `[{ id, nome, email }]` dos utilizadores ACTIVOS (`ativo`, sem `deletedAt`) do tenant da
 *       sessão cujo nome ou e-mail contém `q` (sem distinguir maiúsculas); nunca utilizadores de
 *       outro tenant nem inactivos; sem a permissão → `SEM_PERMISSAO`.
 *
 *   Atribuir (`atribuirTicketAction`, permissão `tickets:atribuir`):
 *     - NOVO: aceita `{ ticketId, atribuidoParaId }` SEM `atribuidoParaNome` — o combobox só
 *       conhece o id; o nome gravado é SEMPRE o `User.nome` lido no servidor, mesmo que o cliente
 *       mande outro (nome forjado é ignorado);
 *     - NOVO: `atribuidoParaId` de utilizador de OUTRO tenant → `NAO_ENCONTRADO` e o ticket fica
 *       como estava (hoje grava qualquer string); utilizador inactivo → recusado, nada muda;
 *     - grava uma `AtividadeTicket` `ATRIBUICAO` com `autorId` = utilizador da sessão;
 *     - ticket de outro tenant → `NAO_ENCONTRADO`; sem a permissão → `SEM_PERMISSAO`.
 *
 *   Transições (`transitarTicketAction`, regressão — passam a ser alcançáveis):
 *     - ABERTO → EM_PROGRESSO sem agente → `TICKET_SEM_AGENTE`, fica ABERTO;
 *     - depois de atribuir: ABERTO → EM_PROGRESSO → RESOLVIDO (grava `dataResolucao`) → FECHADO
 *       (grava `dataFechamento`), cada uma com `AtividadeTicket` `MUDANCA_STATUS`;
 *     - «Os Meus Tickets» (`listarTickets({ atribuidoParaId })`) devolve o ticket atribuído ao
 *       agente.
 *
 *   Comentar (`adicionarComentarioTicketAction`, permissão `tickets:comentar`):
 *     - grava `AtividadeTicket` `COMENTARIO` com o texto, `autorId`/`autorNome` do utilizador da
 *       sessão (lidos no servidor), visibilidade `PUBLICA` por omissão e `INTERNA` quando pedida;
 *       o primeiro comentário grava `dataPrimeiraResposta`;
 *     - comentário vazio → `VALIDACAO` e nada é gravado; ticket de outro tenant →
 *       `NAO_ENCONTRADO`; sem a permissão → `SEM_PERMISSAO`.
 *
 *   Avaliar (`avaliarTicketAction`, permissão `tickets:avaliar`):
 *     - ticket não FECHADO (ex.: EM_PROGRESSO) → `TICKET_NAO_FECHADO` e nada é gravado
 *       (RESOLVIDO não é fixado aqui: a regra actual — só FECHADO — mantém-se, decisão
 *       conservadora: menos código alterado);
 *     - FECHADO, pelo solicitante: grava `avaliacaoNota`, `avaliacaoComentario`, `avaliacaoData`
 *       e `avaliadoPorId` = utilizador da sessão;
 *     - DECISÃO CONSERVADORA (recusar > número errado): só o SOLICITANTE avalia (o agente que
 *       resolveu não pode dar nota ao próprio trabalho) e a avaliação é única — uma segunda é
 *       recusada e a primeira fica intacta;
 *     - nota fora de 1..5 → `VALIDACAO`.
 *
 * Sessão (`@/lib/auth`) é o único duplo (fronteira), mutável por `vi.hoisted`. `next/cache` é
 * dobrado porque o `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero,
 * `createSafeAction`, o serviço de tickets e a numeração por série (`bootstrapSeriesDocumento`
 * cria a série TICKET; os tickets nascem pela `criarTicketAction`, nunca com número inventado).
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó D:tickets-agente-169; um agente de implementação que o altere é
 * BLOCKER.
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
  'tickets:ver',
  'tickets:criar',
  'tickets:listar',
  'tickets:editar',
  'tickets:atribuir',
  'tickets:comentar',
  'tickets:transitar',
  'tickets:avaliar',
  'tickets:fechar',
];

describe.skipIf(skip)('Tickets — atribuir agente, comentar, avaliar e transições (#169) — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let svc: typeof import('@/server/services/operacoes/ticket.service');
  // Acesso dinâmico: `procurarAgentesTicketAction` ainda não existe — falha o caso, não o ficheiro.
  let actions: Record<string, (input: unknown) => Promise<Resultado>>;

  const sufixo = Date.now();
  const TENANT = `tenant-tkt-169-${sufixo}`;
  const OUTRO_TENANT = `tenant-tkt-169-outro-${sufixo}`;
  // Ids com forma de cuid (o schema pode passar a validar com `idEntidade()`).
  const USER = `cusrsolic169${sufixo}`; // solicitante / gestor
  const AGENTE = `cusragent169${sufixo}`;
  const INACTIVO = `cusrinact169${sufixo}`;
  const AGENTE_OUTRO = `cusroutro169${sufixo}`;
  const NOME_USER = `Solicitante Cento Sessenta ${sufixo}`;
  const NOME_AGENTE = `Agente Zacarias ${sufixo}`;
  const NOME_INACTIVO = `Agente Zacarias Inactivo ${sufixo}`;
  const NOME_AGENTE_OUTRO = `Agente Zacarias Alheio ${sufixo}`;
  let ticketOutroId: string;
  let seq = 0;

  function sessao(permissions: string[] = TODAS, userId = USER, tenantId = TENANT) {
    h.sessao = { user: { id: userId, tenantId, permissions, acesso: 'aberto' } };
  }

  function action(nome: string) {
    const fn = actions[nome];
    expect(typeof fn, `${nome} não está exportada de tickets.actions.ts`).toBe('function');
    return fn;
  }

  async function novoTicket(): Promise<string> {
    seq += 1;
    const r = await action('criarTicketAction')({
      titulo: `Impressora sem papel ${seq}`,
      descricao: `Ticket do oráculo #169 (${seq}).`,
      tipo: 'INCIDENTE',
      prioridade: 'NORMAL',
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    return r.data.id as string;
  }

  async function atribuir(ticketId: string, agente = AGENTE): Promise<Resultado> {
    return action('atribuirTicketAction')({ ticketId, atribuidoParaId: agente });
  }

  async function transitar(ticketId: string, estadoAlvo: string): Promise<Resultado> {
    return action('transitarTicketAction')({ ticketId, estadoAlvo, descricao: `Para ${estadoAlvo}` });
  }

  async function fechado(): Promise<string> {
    const id = await novoTicket();
    expect((await atribuir(id)).ok).toBe(true);
    for (const alvo of ['EM_PROGRESSO', 'RESOLVIDO', 'FECHADO']) {
      const r = await transitar(id, alvo);
      expect(r.ok, `${alvo}: ${JSON.stringify(r)}`).toBe(true);
    }
    return id;
  }

  const lerTicket = (id: string) => db.ticket.findUnique({ where: { id } });
  const atividades = (ticketId: string, tipo?: string) =>
    db.atividadeTicket.findMany({ where: { ticketId, ...(tipo ? { tipo } : {}) }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    svc = await import('@/server/services/operacoes/ticket.service');
    actions = (await import('@/server/actions/tickets.actions')) as unknown as typeof actions;
    const { bootstrapSeriesDocumento } = await import('@/server/provisioning/tenant-bootstrap');

    for (const [id, slug, nuit] of [
      [TENANT, `tkt-169-${sufixo}`, `${sufixo}`.slice(-9)],
      [OUTRO_TENANT, `tkt-169-outro-${sufixo}`, `${sufixo + 1}`.slice(-9)],
    ] as const) {
      await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit } });
      await bootstrapSeriesDocumento(db, id);
    }
    for (const [id, tenantId, nome, ativo] of [
      [USER, TENANT, NOME_USER, true],
      [AGENTE, TENANT, NOME_AGENTE, true],
      [INACTIVO, TENANT, NOME_INACTIVO, false],
      [AGENTE_OUTRO, OUTRO_TENANT, NOME_AGENTE_OUTRO, true],
    ] as const) {
      await db.user.create({
        data: { id, tenantId, nome, ativo, email: `${id}@test.mz`, keycloakSub: `kc-${id}` },
      });
    }

    // Ticket do outro tenant, criado pela action com a sessão do outro tenant.
    sessao(TODAS, AGENTE_OUTRO, OUTRO_TENANT);
    ticketOutroId = await novoTicket();
    sessao();
  }, 60_000);

  beforeEach(() => {
    sessao();
  });

  // ───────────────────────────── Procurar agentes ─────────────────────────────

  describe('procurarAgentesTicketAction (ComboboxRemoto)', () => {
    it('devolve só utilizadores activos do tenant da sessão, por nome ou e-mail', async () => {
      const r = await action('procurarAgentesTicketAction')({ q: 'zacarias' });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      const ids = (r.data as Array<{ id: string; nome: string; email: string }>).map((u) => u.id);
      expect(ids).toContain(AGENTE);
      expect(ids).not.toContain(INACTIVO);
      expect(ids).not.toContain(AGENTE_OUTRO);
      const agente = (r.data as Array<{ id: string; nome: string; email: string }>).find((u) => u.id === AGENTE);
      expect(agente).toMatchObject({ id: AGENTE, nome: NOME_AGENTE, email: `${AGENTE}@test.mz` });

      const porEmail = await action('procurarAgentesTicketAction')({ q: AGENTE.toUpperCase() });
      expect(porEmail.ok, JSON.stringify(porEmail)).toBe(true);
      expect((porEmail.data as Array<{ id: string }>).map((u) => u.id)).toEqual([AGENTE]);
    });

    it('sem tickets:atribuir → SEM_PERMISSAO', async () => {
      sessao(TODAS.filter((p) => p !== 'tickets:atribuir'));
      const r = await action('procurarAgentesTicketAction')({ q: 'zacarias' });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('SEM_PERMISSAO');
    });
  });

  // ───────────────────────────── Atribuir ─────────────────────────────

  describe('atribuirTicketAction', () => {
    it('aceita só o id do agente e grava o nome lido no servidor + actividade ATRIBUICAO', async () => {
      const id = await novoTicket();
      const r = await atribuir(id);
      expect(r.ok, JSON.stringify(r)).toBe(true);

      const t = await lerTicket(id);
      expect(t.atribuidoParaId).toBe(AGENTE);
      expect(t.atribuidoParaNome).toBe(NOME_AGENTE);

      const at = await atividades(id, 'ATRIBUICAO');
      expect(at).toHaveLength(1);
      expect(at[0].autorId).toBe(USER);
      expect(at[0].tenantId).toBe(TENANT);
    });

    it('ignora um nome forjado pelo cliente', async () => {
      const id = await novoTicket();
      const r = await action('atribuirTicketAction')({
        ticketId: id,
        atribuidoParaId: AGENTE,
        atribuidoParaNome: 'Nome Forjado',
      });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      expect((await lerTicket(id)).atribuidoParaNome).toBe(NOME_AGENTE);
    });

    it('agente de outro tenant → NAO_ENCONTRADO e o ticket fica sem agente', async () => {
      const id = await novoTicket();
      const r = await atribuir(id, AGENTE_OUTRO);
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('NAO_ENCONTRADO');
      const t = await lerTicket(id);
      expect(t.atribuidoParaId).toBeNull();
      expect(t.atribuidoParaNome).toBeNull();
      expect(await atividades(id, 'ATRIBUICAO')).toHaveLength(0);
    });

    it('agente inactivo → recusado e nada muda', async () => {
      const id = await novoTicket();
      const r = await atribuir(id, INACTIVO);
      expect(r.ok).toBe(false);
      expect((await lerTicket(id)).atribuidoParaId).toBeNull();
      expect(await atividades(id, 'ATRIBUICAO')).toHaveLength(0);
    });

    it('ticket de outro tenant → NAO_ENCONTRADO e o ticket alheio não muda', async () => {
      const r = await atribuir(ticketOutroId);
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('NAO_ENCONTRADO');
      expect((await lerTicket(ticketOutroId)).atribuidoParaId).toBeNull();
    });

    it('sem tickets:atribuir → SEM_PERMISSAO', async () => {
      const id = await novoTicket();
      sessao(TODAS.filter((p) => p !== 'tickets:atribuir'));
      const r = await atribuir(id);
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('SEM_PERMISSAO');
      expect((await lerTicket(id)).atribuidoParaId).toBeNull();
    });
  });

  // ───────────────────────────── Transições ─────────────────────────────

  describe('transições', () => {
    it('ABERTO → EM_PROGRESSO sem agente → TICKET_SEM_AGENTE e fica ABERTO', async () => {
      const id = await novoTicket();
      const r = await transitar(id, 'EM_PROGRESSO');
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('TICKET_SEM_AGENTE');
      expect((await lerTicket(id)).estado).toBe('ABERTO');
      expect(await atividades(id, 'MUDANCA_STATUS')).toHaveLength(0);
    });

    it('depois de atribuir: ABERTO → EM_PROGRESSO → RESOLVIDO → FECHADO, e aparece em «Os Meus Tickets»', async () => {
      const id = await novoTicket();
      expect((await atribuir(id)).ok).toBe(true);

      const emProgresso = await transitar(id, 'EM_PROGRESSO');
      expect(emProgresso.ok, JSON.stringify(emProgresso)).toBe(true);
      expect((await lerTicket(id)).estado).toBe('EM_PROGRESSO');

      const ctxAgente = { tenantId: TENANT, userId: AGENTE };
      const meus = await runCtx(ctxAgente, () =>
        svc.ticketService.listarTickets(
          { atribuidoParaId: AGENTE, take: 100, orderBy: 'createdAt', order: 'desc' } as never,
          ctxAgente,
        ),
      );
      expect(meus.items.map((t) => t.id)).toContain(id);

      const resolvido = await transitar(id, 'RESOLVIDO');
      expect(resolvido.ok, JSON.stringify(resolvido)).toBe(true);
      const tr = await lerTicket(id);
      expect(tr.estado).toBe('RESOLVIDO');
      expect(tr.dataResolucao).toBeInstanceOf(Date);

      const fecho = await transitar(id, 'FECHADO');
      expect(fecho.ok, JSON.stringify(fecho)).toBe(true);
      const tf = await lerTicket(id);
      expect(tf.estado).toBe('FECHADO');
      expect(tf.dataFechamento).toBeInstanceOf(Date);

      const mudancas = await atividades(id, 'MUDANCA_STATUS');
      expect(mudancas).toHaveLength(3);
      expect(mudancas.every((a: { autorId: string }) => a.autorId === USER)).toBe(true);
    });
  });

  // ───────────────────────────── Comentar ─────────────────────────────

  describe('adicionarComentarioTicketAction', () => {
    it('grava COMENTARIO com o autor da sessão, PUBLICA por omissão, e a data da primeira resposta', async () => {
      const id = await novoTicket();
      expect((await lerTicket(id)).dataPrimeiraResposta).toBeNull();

      const r = await action('adicionarComentarioTicketAction')({ ticketId: id, descricao: 'Já trocámos o toner.' });
      expect(r.ok, JSON.stringify(r)).toBe(true);

      const cs = await atividades(id, 'COMENTARIO');
      expect(cs).toHaveLength(1);
      expect(cs[0]).toMatchObject({
        descricao: 'Já trocámos o toner.',
        autorId: USER,
        autorNome: NOME_USER,
        visibilidade: 'PUBLICA',
        tenantId: TENANT,
      });
      expect((await lerTicket(id)).dataPrimeiraResposta).toBeInstanceOf(Date);

      const interna = await action('adicionarComentarioTicketAction')({
        ticketId: id,
        descricao: 'Nota interna: fornecedor contactado.',
        visibilidade: 'INTERNA',
      });
      expect(interna.ok, JSON.stringify(interna)).toBe(true);
      const todos = await atividades(id, 'COMENTARIO');
      expect(todos).toHaveLength(2);
      expect(todos[1].visibilidade).toBe('INTERNA');
    });

    it('comentário vazio → VALIDACAO e nada é gravado', async () => {
      const id = await novoTicket();
      const r = await action('adicionarComentarioTicketAction')({ ticketId: id, descricao: '' });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('VALIDACAO');
      expect(await atividades(id, 'COMENTARIO')).toHaveLength(0);
    });

    it('ticket de outro tenant → NAO_ENCONTRADO', async () => {
      const r = await action('adicionarComentarioTicketAction')({ ticketId: ticketOutroId, descricao: 'Intruso' });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('NAO_ENCONTRADO');
      expect(await atividades(ticketOutroId, 'COMENTARIO')).toHaveLength(0);
    });

    it('sem tickets:comentar → SEM_PERMISSAO', async () => {
      const id = await novoTicket();
      sessao(TODAS.filter((p) => p !== 'tickets:comentar'));
      const r = await action('adicionarComentarioTicketAction')({ ticketId: id, descricao: 'Sem permissão' });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('SEM_PERMISSAO');
      expect(await atividades(id, 'COMENTARIO')).toHaveLength(0);
    });
  });

  // ───────────────────────────── Avaliar ─────────────────────────────

  describe('avaliarTicketAction', () => {
    it('ticket EM_PROGRESSO → TICKET_NAO_FECHADO e nada é gravado', async () => {
      const id = await novoTicket();
      expect((await atribuir(id)).ok).toBe(true);
      expect((await transitar(id, 'EM_PROGRESSO')).ok).toBe(true);
      const r = await action('avaliarTicketAction')({ ticketId: id, nota: 5 });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('TICKET_NAO_FECHADO');
      const t = await lerTicket(id);
      expect(t.avaliacaoNota).toBeNull();
      expect(t.avaliacaoData).toBeNull();
    });

    it('FECHADO, pelo solicitante: grava nota, comentário, data e avaliador', async () => {
      const id = await fechado();
      const r = await action('avaliarTicketAction')({ ticketId: id, nota: 4, comentario: 'Rápido e simpático.' });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      const t = await lerTicket(id);
      expect(t.avaliacaoNota).toBe(4);
      expect(t.avaliacaoComentario).toBe('Rápido e simpático.');
      expect(t.avaliacaoData).toBeInstanceOf(Date);
      expect(t.avaliadoPorId).toBe(USER);
    });

    it('a avaliação é única: a segunda é recusada e a primeira fica intacta', async () => {
      const id = await fechado();
      expect((await action('avaliarTicketAction')({ ticketId: id, nota: 4 })).ok).toBe(true);
      const antes = await lerTicket(id);

      const segunda = await action('avaliarTicketAction')({ ticketId: id, nota: 1, comentario: 'Mudei de ideias' });
      expect(segunda.ok).toBe(false);
      const depois = await lerTicket(id);
      expect(depois.avaliacaoNota).toBe(4);
      expect(depois.avaliacaoComentario).toBeNull();
      expect(depois.avaliacaoData?.getTime()).toBe(antes.avaliacaoData?.getTime());
    });

    it('só o solicitante avalia: o agente atribuído é recusado e nada é gravado', async () => {
      const id = await fechado();
      sessao(TODAS, AGENTE);
      const r = await action('avaliarTicketAction')({ ticketId: id, nota: 5 });
      expect(r.ok).toBe(false);
      const t = await lerTicket(id);
      expect(t.avaliacaoNota).toBeNull();
      expect(t.avaliadoPorId).toBeNull();
    });

    it('nota fora de 1..5 → VALIDACAO', async () => {
      const id = await fechado();
      for (const nota of [0, 6]) {
        const r = await action('avaliarTicketAction')({ ticketId: id, nota });
        expect(r.ok).toBe(false);
        expect(r.error?.code).toBe('VALIDACAO');
      }
      expect((await lerTicket(id)).avaliacaoNota).toBeNull();
    });
  });
});
