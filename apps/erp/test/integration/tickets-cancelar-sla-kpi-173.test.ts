/**
 * Oráculo — issue #173: em `/tickets`, «Cancelar» aparece em RESOLVIDO; «SLA em atraso» só se
 * actualiza na transição; o KPI «Em Progresso» é sempre 0.
 *
 * Defeitos (lidos no código em `4c8cdca`):
 *   - `ticket-acoes.tsx` decide o botão «Cancelar» com uma lista à mão (`estado !== 'CANCELADO'
 *     && estado !== 'FECHADO'`) em vez da máquina de estados — em RESOLVIDO o botão aparece e o
 *     servidor recusa (provado no lado do cliente em
 *     `src/app/(dashboard)/tickets/__tests__/acoes-sla-kpi-173.test.ts`);
 *   - `slaEmAtraso` é uma coluna escrita só em `transitarTicket`: um ticket ABERTO cujo prazo de
 *     resolução passa sem ninguém lhe tocar nunca fica «em atraso», e o filtro/KPI
 *     `slaEmAtraso: true` lê essa coluna parada;
 *   - o KPI «Em Progresso» filtra `EM_PROGRESSO` dentro de uma página de tickets `ABERTO` → 0.
 *
 * Contrato (decisão do orquestrador):
 *   SLA em atraso DERIVADO NA LEITURA — `prazo (slaDataLimiteResolucao) < agora` E estado não
 *   terminal (terminais: RESOLVIDO, FECHADO, CANCELADO — os de `recalcularSlaEmAtraso`). Vale
 *   para o campo `slaEmAtraso` devolvido por `obterTicket` e `listarTickets`, e para o filtro
 *   `listarTickets({ slaEmAtraso })` nos dois sentidos. O valor gravado na coluna deixa de
 *   decidir (é testado nos dois sentidos: coluna `false` com prazo vencido → em atraso; coluna
 *   `true` com prazo futuro ou estado terminal → não).
 *
 *   KPI por `count` no serviço — nome fixado aqui (molde do #104):
 *     ticketService.contarTickets({ estado?, prioridade?, slaEmAtraso? }, ctx) → number
 *   com o tenant explícito no `where`, os filtros combinados por E, e `slaEmAtraso` com a MESMA
 *   derivação da listagem. As páginas que o usam provam-se no oráculo estático.
 *
 *   Cancelar segue a máquina: RESOLVIDO → CANCELADO é recusado pelo servidor
 *   (`TRANSICAO_INVALIDA`) e o ticket fica RESOLVIDO (regressão — já hoje assim).
 *
 * Sessão (`@/lib/auth`) é o único duplo, mutável por `vi.hoisted`; `next/cache` é dobrado porque o
 * `updateTag` exige um pedido Next. Os tickets nascem pela `criarTicketAction` (número da série
 * TICKET, nunca inventado) e chegam aos estados pelas transições reais. O ÚNICO acesso directo à
 * base é para simular a passagem do tempo: mover `slaDataLimiteResolucao` para o passado/futuro e
 * pôr a coluna `slaEmAtraso` no valor «errado», para provar que ela já não decide.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó B:tickets-cancelar-sla-kpi-173; um agente de implementação que o
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
type Ctx = { tenantId: string; userId: string };

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

const HORA = 60 * 60_000;

describe.skipIf(skip)('Tickets — cancelar pela máquina, SLA derivado na leitura, KPI por count (#173) — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  // Acesso dinâmico: `contarTickets` ainda não existe — falha o caso, não o ficheiro.
  let svc: Record<string, any>;
  let actions: Record<string, (input: unknown) => Promise<Resultado>>;

  const sufixo = Date.now();
  const TENANT = `tenant-tkt-173-${sufixo}`;
  const OUTRO_TENANT = `tenant-tkt-173-outro-${sufixo}`;
  const USER = `cusrsolic173${sufixo}`;
  const AGENTE = `cusragent173${sufixo}`;
  const USER_OUTRO = `cusroutro173${sufixo}`;
  const ctx: Ctx = { tenantId: TENANT, userId: USER };
  const ctxOutro: Ctx = { tenantId: OUTRO_TENANT, userId: USER_OUTRO };
  let seq = 0;

  function sessao(userId = USER, tenantId = TENANT) {
    h.sessao = { user: { id: userId, tenantId, permissions: TODAS, acesso: 'aberto' } };
  }

  function action(nome: string) {
    const fn = actions[nome];
    expect(typeof fn, `${nome} não está exportada de tickets.actions.ts`).toBe('function');
    return fn;
  }

  async function novoTicket(prioridade = 'NORMAL'): Promise<string> {
    seq += 1;
    const r = await action('criarTicketAction')({
      titulo: `Rede em baixo ${seq}`,
      descricao: `Ticket do oráculo #173 (${seq}).`,
      tipo: 'INCIDENTE',
      prioridade,
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    return r.data.id as string;
  }

  async function transitar(ticketId: string, estadoAlvo: string, descricao = `Para ${estadoAlvo}`): Promise<Resultado> {
    return action('transitarTicketAction')({ ticketId, estadoAlvo, descricao });
  }

  /** Leva um ticket novo, pelas transições reais, até `estado`. */
  async function ticketEm(estado: string, prioridade = 'NORMAL', agente = AGENTE): Promise<string> {
    const id = await novoTicket(prioridade);
    const caminhos: Record<string, string[]> = {
      ABERTO: [],
      EM_PROGRESSO: ['EM_PROGRESSO'],
      AGUARDANDO_CLIENTE: ['AGUARDANDO_CLIENTE'],
      AGUARDANDO_TERCEIRO: ['AGUARDANDO_TERCEIRO'],
      RESOLVIDO: ['EM_PROGRESSO', 'RESOLVIDO'],
      FECHADO: ['EM_PROGRESSO', 'RESOLVIDO', 'FECHADO'],
      CANCELADO: ['CANCELADO'],
    };
    if (caminhos[estado].includes('EM_PROGRESSO')) {
      const a = await action('atribuirTicketAction')({ ticketId: id, atribuidoParaId: agente });
      expect(a.ok, JSON.stringify(a)).toBe(true);
    }
    for (const alvo of caminhos[estado]) {
      const r = await transitar(id, alvo);
      expect(r.ok, `${alvo}: ${JSON.stringify(r)}`).toBe(true);
    }
    expect((await lerTicket(id)).estado).toBe(estado);
    return id;
  }

  const lerTicket = (id: string) => db.ticket.findUnique({ where: { id } });

  /** Simula a passagem do tempo: prazo de resolução `horas` a partir de agora + coluna forçada. */
  async function prazo(id: string, horas: number, colunaSlaEmAtraso: boolean) {
    await db.ticket.update({
      where: { id },
      data: {
        slaDataLimiteResolucao: new Date(Date.now() + horas * HORA),
        slaEmAtraso: colunaSlaEmAtraso,
      },
    });
  }

  const em = (c: Ctx, fn: () => Promise<any>): Promise<any> => runCtx(c, fn) as Promise<any>;

  async function obter(id: string) {
    return em(ctx, () => svc.ticketService.obterTicket(id, ctx));
  }

  async function listarIds(filtros: Record<string, unknown>, c: Ctx = ctx): Promise<string[]> {
    const r = await em(c, () =>
      svc.ticketService.listarTickets({ take: 100, orderBy: 'createdAt', order: 'desc', ...filtros }, c),
    );
    return (r.items as Array<{ id: string }>).map((t) => t.id);
  }

  async function listarItem(id: string) {
    const r = await em(ctx, () =>
      svc.ticketService.listarTickets({ take: 100, orderBy: 'createdAt', order: 'desc' }, ctx),
    );
    const item = (r.items as Array<{ id: string; slaEmAtraso: boolean }>).find((t) => t.id === id);
    expect(item, `ticket ${id} não aparece na listagem`).toBeDefined();
    return item!;
  }

  async function contar(filtros: Record<string, unknown>, c: Ctx = ctx): Promise<number> {
    const f = svc.ticketService.contarTickets;
    expect(typeof f, 'ticketService.contarTickets não existe — o KPI tem de vir de um count no serviço').toBe(
      'function',
    );
    const n = await em(c, () => f.call(svc.ticketService, filtros, c));
    expect(typeof n, 'contarTickets devolve um número (não uma página)').toBe('number');
    return n as number;
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    svc = (await import('@/server/services/operacoes/ticket.service')) as unknown as Record<string, any>;
    actions = (await import('@/server/actions/tickets.actions')) as unknown as typeof actions;
    const { bootstrapSeriesDocumento } = await import('@/server/provisioning/tenant-bootstrap');

    for (const [id, slug, nuit] of [
      [TENANT, `tkt-173-${sufixo}`, `${sufixo}`.slice(-9)],
      [OUTRO_TENANT, `tkt-173-outro-${sufixo}`, `${sufixo + 1}`.slice(-9)],
    ] as const) {
      await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit } });
      await bootstrapSeriesDocumento(db, id);
    }
    for (const [id, tenantId, nome] of [
      [USER, TENANT, `Solicitante 173 ${sufixo}`],
      [AGENTE, TENANT, `Agente 173 ${sufixo}`],
      [USER_OUTRO, OUTRO_TENANT, `Alheio 173 ${sufixo}`],
    ] as const) {
      await db.user.create({
        data: { id, tenantId, nome, ativo: true, email: `${id}@test.mz`, keycloakSub: `kc-${id}` },
      });
    }
  }, 60_000);

  beforeEach(() => {
    sessao();
  });

  // ───────────────────────────── Cancelar ─────────────────────────────

  describe('cancelar segue a máquina de estados', () => {
    it('RESOLVIDO → CANCELADO é recusado (TRANSICAO_INVALIDA) e o ticket fica RESOLVIDO', async () => {
      const id = await ticketEm('RESOLVIDO');
      const r = await transitar(id, 'CANCELADO', 'Cliente desistiu');
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('TRANSICAO_INVALIDA');
      expect((await lerTicket(id)).estado).toBe('RESOLVIDO');
    });

    it('ABERTO → CANCELADO continua permitido', async () => {
      const id = await novoTicket();
      const r = await transitar(id, 'CANCELADO', 'Duplicado');
      expect(r.ok, JSON.stringify(r)).toBe(true);
      expect((await lerTicket(id)).estado).toBe('CANCELADO');
    });
  });

  // ───────────────────────────── SLA derivado na leitura ─────────────────────────────

  describe('SLA em atraso derivado na leitura (prazo < agora e estado não terminal)', () => {
    it('ABERTO cujo prazo passou sem transição (coluna false) → obterTicket e listarTickets dizem em atraso', async () => {
      const id = await novoTicket();
      await prazo(id, -2, false);

      expect((await obter(id)).slaEmAtraso).toBe(true);
      expect((await listarItem(id)).slaEmAtraso).toBe(true);
    });

    it('o filtro slaEmAtraso: true apanha-o e o slaEmAtraso: false deixa-o de fora', async () => {
      const id = await novoTicket();
      await prazo(id, -2, false);

      expect(await listarIds({ slaEmAtraso: true })).toContain(id);
      expect(await listarIds({ slaEmAtraso: false })).not.toContain(id);
    });

    it('sentido inverso: coluna true mas prazo futuro → não está em atraso, nem no filtro', async () => {
      const id = await novoTicket();
      await prazo(id, +5, true);

      expect((await obter(id)).slaEmAtraso).toBe(false);
      expect((await listarItem(id)).slaEmAtraso).toBe(false);
      expect(await listarIds({ slaEmAtraso: true })).not.toContain(id);
      expect(await listarIds({ slaEmAtraso: false })).toContain(id);
    });

    it.each(['EM_PROGRESSO', 'AGUARDANDO_CLIENTE', 'AGUARDANDO_TERCEIRO'])(
      '%s com prazo vencido (coluna false) → em atraso',
      async (estado) => {
        const id = await ticketEm(estado);
        await prazo(id, -1, false);

        expect((await obter(id)).slaEmAtraso).toBe(true);
        expect(await listarIds({ slaEmAtraso: true })).toContain(id);
      },
    );

    it.each(['RESOLVIDO', 'FECHADO', 'CANCELADO'])(
      '%s (terminal) com prazo vencido e coluna true → NÃO está em atraso, nem no filtro',
      async (estado) => {
        const id = await ticketEm(estado);
        await prazo(id, -3, true);

        expect((await obter(id)).slaEmAtraso).toBe(false);
        expect((await listarItem(id)).slaEmAtraso).toBe(false);
        expect(await listarIds({ slaEmAtraso: true })).not.toContain(id);
        expect(await listarIds({ slaEmAtraso: false })).toContain(id);
      },
    );
  });

  // ───────────────────────────── KPI por count ─────────────────────────────

  describe('ticketService.contarTickets — KPI pelo estado real', () => {
    // Tenant próprio, contagens exactas. Montado no primeiro caso deste bloco.
    const TENANT_K = `tenant-tkt-173-kpi-${sufixo}`;
    const USER_K = `cusrkpi173${sufixo}`;
    const AGENTE_K = `cusragkpi173${sufixo}`;
    const ctxK: Ctx = { tenantId: TENANT_K, userId: USER_K };
    let montado = false;

    async function montar() {
      if (montado) return;
      const { bootstrapSeriesDocumento } = await import('@/server/provisioning/tenant-bootstrap');
      await db.tenant.create({
        data: { id: TENANT_K, nome: `Tenant kpi 173 ${sufixo}`, slug: `tkt-173-kpi-${sufixo}`, nuit: `${sufixo + 2}`.slice(-9) },
      });
      await bootstrapSeriesDocumento(db, TENANT_K);
      for (const [id, nome] of [
        [USER_K, `Gestor KPI 173 ${sufixo}`],
        [AGENTE_K, `Agente KPI 173 ${sufixo}`],
      ] as const) {
        await db.user.create({
          data: { id, tenantId: TENANT_K, nome, ativo: true, email: `${id}@test.mz`, keycloakSub: `kc-${id}` },
        });
      }
      sessao(USER_K, TENANT_K);
      // 3 EM_PROGRESSO (1 URGENTE), 2 ABERTO (1 URGENTE), 1 AGUARDANDO_CLIENTE, 1 RESOLVIDO, 1 CANCELADO.
      const emProg = [
        await ticketEm('EM_PROGRESSO', 'NORMAL', AGENTE_K),
        await ticketEm('EM_PROGRESSO', 'URGENTE', AGENTE_K),
        await ticketEm('EM_PROGRESSO', 'ALTA', AGENTE_K),
      ];
      const abertos = [await ticketEm('ABERTO', 'NORMAL', AGENTE_K), await ticketEm('ABERTO', 'URGENTE', AGENTE_K)];
      const aguarda = await ticketEm('AGUARDANDO_CLIENTE', 'NORMAL', AGENTE_K);
      const resolvido = await ticketEm('RESOLVIDO', 'URGENTE', AGENTE_K);
      const cancelado = await ticketEm('CANCELADO', 'NORMAL', AGENTE_K);

      // SLA: vencidos (coluna false) em 1 EM_PROGRESSO, 1 ABERTO e 1 AGUARDANDO_CLIENTE → 3 em atraso;
      // vencido mas terminal (coluna true) no RESOLVIDO e no CANCELADO → não contam;
      // coluna true com prazo futuro num EM_PROGRESSO → não conta.
      await prazo(emProg[0], -2, false);
      await prazo(abertos[0], -2, false);
      await prazo(aguarda, -2, false);
      await prazo(resolvido, -2, true);
      await prazo(cancelado, -2, true);
      await prazo(emProg[1], +4, true);
      sessao();
      montado = true;
    }

    it('conta EM_PROGRESSO pelo estado real (não dentro de uma página de ABERTO)', async () => {
      await montar();
      expect(await contar({ estado: 'EM_PROGRESSO' }, ctxK)).toBe(3);
      expect(await contar({ estado: 'ABERTO' }, ctxK)).toBe(2);
      expect(await contar({ estado: 'RESOLVIDO' }, ctxK)).toBe(1);
    });

    it('sem filtros conta todos os tickets do tenant', async () => {
      await montar();
      expect(await contar({}, ctxK)).toBe(8);
    });

    it('combina filtros por E (prioridade + estado)', async () => {
      await montar();
      expect(await contar({ prioridade: 'URGENTE' }, ctxK)).toBe(3);
      expect(await contar({ prioridade: 'URGENTE', estado: 'ABERTO' }, ctxK)).toBe(1);
      expect(await contar({ prioridade: 'URGENTE', estado: 'EM_PROGRESSO' }, ctxK)).toBe(1);
    });

    it('slaEmAtraso usa a mesma derivação da listagem (prazo vencido e estado não terminal)', async () => {
      await montar();
      expect(await contar({ slaEmAtraso: true }, ctxK)).toBe(3);
      expect(await contar({ slaEmAtraso: false }, ctxK)).toBe(5);
      const lista = await listarIds({ slaEmAtraso: true }, ctxK);
      expect(lista).toHaveLength(3);
    });

    it('isolamento: os tickets de outro tenant não entram na contagem', async () => {
      await montar();
      sessao(USER_OUTRO, OUTRO_TENANT);
      const alheio = await novoTicket();
      sessao();
      expect(alheio).toBeTruthy();
      expect(await contar({}, ctxK)).toBe(8);
      expect(await contar({ estado: 'ABERTO' }, ctxK)).toBe(2);
      expect(await contar({ estado: 'ABERTO' }, ctxOutro)).toBe(1);
    });
  });
});
