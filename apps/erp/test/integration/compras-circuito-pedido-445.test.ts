/**
 * Oráculo — issue #445: o circuito de aprovação de compras não se edita nem desactiva (e a
 * mensagem WORKFLOW_ACTIVO_DUPLICADO manda desactivar), a unicidade «um activo por tipo» é
 * verificada fora de transacção, e o pedido de compra aceita uma decisão depois de terminal.
 *
 * Contrato (decisão do orquestrador; o E2E `e2e/54-compras-circuito-pedido-445.spec.ts` prova
 * a porta de entrada):
 *
 *   Circuitos — duas actions NOVAS em `compras.actions.ts`, permissão `compras:configurar`:
 *     - `actualizarConfiguracaoWorkflowAction({ id, nome, tipo, ativo, niveis })` — mesma forma
 *       do `CreateConfiguracaoWorkflowSchema` mais o `id`; substitui nome, tipo, estado e níveis
 *       (com aprovadores). Activar por edição um circuito quando já há outro activo do mesmo
 *       tipo é recusado com `WORKFLOW_ACTIVO_DUPLICADO` e nada muda; um nome já usado por outro
 *       circuito do tenant é recusado como regra de negócio (nunca ERRO_INTERNO);
 *     - `desactivarConfiguracaoWorkflowAction({ id })` — passa o circuito a inactivo; depois
 *       disso, criar outro activo do mesmo tipo passa (é o que a mensagem promete) e o
 *       «Submeter» deixa de usar o circuito desactivado;
 *     - id de outro tenant → NAO_ENCONTRADO e nada muda; sem `compras:configurar` → SEM_PERMISSAO;
 *     - «um activo por tipo» resiste a escritas concorrentes (tranca na transacção ou índice
 *       único parcial): N criações activas simultâneas do mesmo tipo deixam exactamente UM
 *       activo, e as recusadas chegam como `WORKFLOW_ACTIVO_DUPLICADO` (um P2002 por mapear é
 *       ERRO_INTERNO e falha o caso). Idem para N activações simultâneas por edição.
 *
 *   Pedido de compra — `decidirAprovacaoAction` no ramo `pedidoCompraId` tem a mesma guarda do
 *   ramo da requisição: lê o pedido sob tranca (`FOR UPDATE`) e só aceita a decisão enquanto o
 *   pedido está ENVIADO (opção conservadora: é o único estado do qual as duas saídas da
 *   aprovação — CONFIRMADO e CANCELADO — são transições válidas em TRANSICOES_PEDIDO_COMPRA).
 *   Fora disso (CONFIRMADO, EM_TRANSITO, CANCELADO) recusa com `APROVACAO_ENCERRADA`, o estado
 *   do pedido não muda e a decisão continua PENDENTE. Decisões concorrentes de dois aprovadores
 *   QUALQUER_UM: exactamente uma conta. RASCUNHO fica fora deste contrato.
 *
 *   Os registos `AprovacaoCompra` do pedido são semeados por SQL do Prisma cru: nenhum serviço
 *   os cria hoje (não há «submeter pedido»); o que se prova é a decisão sobre eles.
 *
 * Sessão (`@/lib/auth`) é o único duplo (fronteira), mutável por `vi.hoisted`; `next/cache` é
 * dobrado porque o `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero,
 * `bootstrapContabilidade` (séries), `createSafeAction` e o `comprasService`.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó A:compras-circuito-pedido-445; um agente de implementação
 * que o altere é BLOCKER.
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

type Resultado = { ok: boolean; data?: any; error?: { code: string; message: string } };

const DECIDIR = 'compras:aprovacao:decidir';
const CONFIGURAR = 'compras:configurar';

type NomeAction =
  | 'criarConfiguracaoWorkflowAction'
  | 'actualizarConfiguracaoWorkflowAction'
  | 'desactivarConfiguracaoWorkflowAction'
  | 'decidirAprovacaoAction';

type Tipo = 'REQUISICAO_COMPRA' | 'PEDIDO_COMPRA';

describe.skipIf(skip)('Circuitos editáveis/desactiváveis e decisão do pedido sob tranca (#445) — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  // Acesso dinâmico: o que ainda não existe falha o caso, não o ficheiro.
  let compras: Record<string, (...args: any[]) => Promise<any>>;
  let actions: Record<string, (input: unknown) => Promise<Resultado>>;

  const sufixo = Date.now();
  // W: edição/desactivação de circuitos (com séries, para provar o «Submeter»).
  const TENANT_W = `tenant-wf-445-w-${sufixo}`;
  // O: outro tenant (isolamento).
  const TENANT_O = `tenant-wf-445-o-${sufixo}`;
  // K: concorrência na criação/activação (sem nada antes de cada caso).
  const TENANT_K = `tenant-wf-445-k-${sufixo}`;
  const TENANT_K2 = `tenant-wf-445-k2-${sufixo}`;
  // P: pedidos de compra com circuito PEDIDO_COMPRA QUALQUER_UM (P1, P2).
  const TENANT_P = `tenant-wf-445-p-${sufixo}`;

  const ADMIN_W = `user-wf-445-w-${sufixo}`;
  const OUTRO_W = `user-wf-445-w2-${sufixo}`;
  const ADMIN_O = `user-wf-445-o-${sufixo}`;
  const ADMIN_K = `user-wf-445-k-${sufixo}`;
  const ADMIN_K2 = `user-wf-445-k2-${sufixo}`;
  const COMPRADOR_P = `user-wf-445-pc-${sufixo}`;
  const APROV_P1 = `user-wf-445-p1-${sufixo}`;
  const APROV_P2 = `user-wf-445-p2-${sufixo}`;

  const email = (id: string) => `${id}@test.mz`;
  let fornecedorP = '';

  function sessao(userId: string, tenantId: string, permissions: string[]) {
    h.sessao = { user: { id: userId, tenantId, permissions, acesso: 'aberto' } };
  }

  function action(nome: NomeAction) {
    const fn = actions[nome];
    expect(typeof fn, `${nome} não está exportada de compras.actions.ts`).toBe('function');
    return fn;
  }

  const circuito = (
    nome: string,
    tipo: Tipo,
    aprovador: string,
    opcoes: { ativo?: boolean; nivelNome?: string; valorMaximo?: number; tipoAprovacao?: string } = {},
  ) => ({
    nome,
    tipo,
    ativo: opcoes.ativo ?? true,
    niveis: [
      {
        nivel: 1,
        nome: opcoes.nivelNome ?? 'Chefia',
        valorMinimo: 0,
        valorMaximo: opcoes.valorMaximo ?? 1_000_000_000,
        tipoAprovacao: opcoes.tipoAprovacao ?? 'QUALQUER_UM',
        aprovadores: [{ usuarioId: aprovador, email: email(aprovador) }],
      },
    ],
  });

  const criar = (input: unknown) => action('criarConfiguracaoWorkflowAction')(input);
  const actualizar = (input: unknown) => action('actualizarConfiguracaoWorkflowAction')(input);
  const desactivar = (id: string) => action('desactivarConfiguracaoWorkflowAction')({ id });

  /** Circuito tal como está na base (nome, tipo, estado e níveis com aprovadores). */
  async function retratoCircuito(id: string) {
    const w = await db.configuracaoWorkflow.findUnique({
      where: { id },
      include: { niveis: { include: { aprovadores: true }, orderBy: { nivel: 'asc' } } },
    });
    if (!w) return null;
    return {
      nome: w.nome,
      tipo: w.tipo,
      ativo: w.ativo,
      niveis: w.niveis.map(
        (n: any) =>
          `${n.nivel}|${n.nome}|${Number(n.valorMinimo)}|${Number(n.valorMaximo)}|${n.tipoAprovacao}|` +
          n.aprovadores.map((a: any) => a.usuarioId).sort().join(','),
      ),
    };
  }

  const activos = (tenantId: string, tipo: Tipo) =>
    db.configuracaoWorkflow.count({ where: { tenantId, tipo, ativo: true } });

  /** Cria pela action (sessão de W) e devolve o id. */
  async function criarEmW(input: ReturnType<typeof circuito>): Promise<string> {
    sessao(ADMIN_W, TENANT_W, [CONFIGURAR]);
    const r = await criar(input);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const w = await db.configuracaoWorkflow.findFirst({ where: { tenantId: TENANT_W, nome: input.nome } });
    expect(w, `o circuito ${input.nome} não foi criado`).toBeTruthy();
    return w.id;
  }

  /** Garante que W não tem circuito activo do tipo (desactiva por SQL os que restem de outros casos). */
  async function semActivosEmW(tipo: Tipo) {
    await db.configuracaoWorkflow.updateMany({ where: { tenantId: TENANT_W, tipo, ativo: true }, data: { ativo: false } });
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ comprasService: compras } = (await import('@/server/services/compras/compras.service')) as any);
    actions = (await import('@/server/actions/compras.actions')) as unknown as typeof actions;
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    const tenants = [
      [TENANT_W, `wf-445-w-${sufixo}`, `${sufixo}`.slice(-9)],
      [TENANT_O, `wf-445-o-${sufixo}`, `${sufixo + 1}`.slice(-9)],
      [TENANT_K, `wf-445-k-${sufixo}`, `${sufixo + 2}`.slice(-9)],
      [TENANT_K2, `wf-445-k2-${sufixo}`, `${sufixo + 3}`.slice(-9)],
      [TENANT_P, `wf-445-p-${sufixo}`, `${sufixo + 4}`.slice(-9)],
    ] as const;
    for (const [id, slug, nuit] of tenants) {
      await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit } });
    }
    const users: Array<[string, string]> = [
      [ADMIN_W, TENANT_W], [OUTRO_W, TENANT_W], [ADMIN_O, TENANT_O], [ADMIN_K, TENANT_K], [ADMIN_K2, TENANT_K2],
      [COMPRADOR_P, TENANT_P], [APROV_P1, TENANT_P], [APROV_P2, TENANT_P],
    ];
    for (const [id, tenantId] of users) {
      await db.user.create({ data: { id, tenantId, email: email(id), nome: id, keycloakSub: `kc-${id}` } });
    }
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT_W), { timeout: 60_000 });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT_P), { timeout: 60_000 });

    const f = await db.fornecedor.create({
      data: {
        tenantId: TENANT_P,
        codigo: `FOR-445-${sufixo}`,
        nome: `Fornecedor #445 ${sufixo}`,
        tipo: 'PESSOA_JURIDICA',
        nuit: `4${String(sufixo + 7).slice(-8)}`,
        email: `for-445-${sufixo}@test.mz`,
      },
    });
    fornecedorP = f.id;

    // Circuito de pedidos de P, pelo serviço real: um nível QUALQUER_UM com P1 e P2.
    const cP = { tenantId: TENANT_P, userId: COMPRADOR_P };
    await runCtx(cP, () =>
      compras.criarConfiguracaoWorkflow(
        {
          nome: `Circuito pedidos P ${sufixo}`,
          tipo: 'PEDIDO_COMPRA',
          ativo: true,
          niveis: [
            { nivel: 1, nome: 'Qualquer um', valorMinimo: 0, valorMaximo: 1_000_000_000, tipoAprovacao: 'QUALQUER_UM',
              aprovadores: [
                { usuarioId: APROV_P1, email: email(APROV_P1) },
                { usuarioId: APROV_P2, email: email(APROV_P2) },
              ] },
          ],
        },
        cP,
      ),
    );
  }, 180_000);

  // =========================================================================
  // Circuitos: editar
  // =========================================================================

  it('editar pela action substitui nome, estado e níveis (com aprovadores); a listagem mostra o novo', async () => {
    await semActivosEmW('PEDIDO_COMPRA');
    const id = await criarEmW(circuito(`Editar origem ${sufixo}`, 'PEDIDO_COMPRA', ADMIN_W, { ativo: false }));

    const novoNome = `Editar destino ${sufixo}`;
    sessao(ADMIN_W, TENANT_W, [CONFIGURAR]);
    const r = await actualizar({
      id,
      nome: novoNome,
      tipo: 'PEDIDO_COMPRA',
      ativo: true,
      niveis: [
        { nivel: 1, nome: 'Direcção financeira', valorMinimo: 0, valorMaximo: 100_000, tipoAprovacao: 'TODOS',
          aprovadores: [{ usuarioId: OUTRO_W, email: email(OUTRO_W) }] },
        { nivel: 2, nome: 'Administração', valorMinimo: 0, valorMaximo: 5_000_000, tipoAprovacao: 'QUALQUER_UM',
          aprovadores: [
            { usuarioId: ADMIN_W, email: email(ADMIN_W) },
            { usuarioId: OUTRO_W, email: email(OUTRO_W) },
          ] },
      ],
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);

    expect(await retratoCircuito(id)).toEqual({
      nome: novoNome,
      tipo: 'PEDIDO_COMPRA',
      ativo: true,
      niveis: [
        `1|Direcção financeira|0|100000|TODOS|${OUTRO_W}`,
        `2|Administração|0|5000000|QUALQUER_UM|${[ADMIN_W, OUTRO_W].sort().join(',')}`,
      ],
    });
    // Editar não cria um circuito novo.
    expect(await db.configuracaoWorkflow.count({ where: { tenantId: TENANT_W, nome: `Editar origem ${sufixo}` } })).toBe(0);

    const c = { tenantId: TENANT_W, userId: ADMIN_W };
    const lista = await runCtx(c, () => compras.listarConfiguracoesWorkflow(c));
    const w = lista.find((x: any) => x.id === id);
    expect(w?.nome).toBe(novoNome);
    expect(w?.niveis.map((n: any) => n.nome)).toEqual(['Direcção financeira', 'Administração']);
  });

  it('activar por edição quando já há outro activo do mesmo tipo é recusado (WORKFLOW_ACTIVO_DUPLICADO) e nada muda', async () => {
    await semActivosEmW('REQUISICAO_COMPRA');
    await criarEmW(circuito(`Activo req ${sufixo}`, 'REQUISICAO_COMPRA', ADMIN_W));
    const inactivo = await criarEmW(circuito(`Inactivo req ${sufixo}`, 'REQUISICAO_COMPRA', ADMIN_W, { ativo: false }));
    const antes = await retratoCircuito(inactivo);

    sessao(ADMIN_W, TENANT_W, [CONFIGURAR]);
    const r = await actualizar({
      id: inactivo,
      ...circuito(`Inactivo req renomeado ${sufixo}`, 'REQUISICAO_COMPRA', OUTRO_W, { ativo: true, nivelNome: 'Outro' }),
    });
    expect(r.ok, 'um segundo circuito activo do mesmo tipo foi aceite por edição').toBe(false);
    expect(r.error?.code).toBe('WORKFLOW_ACTIVO_DUPLICADO');
    expect(await retratoCircuito(inactivo)).toEqual(antes);
    expect(await activos(TENANT_W, 'REQUISICAO_COMPRA')).toBe(1);

    // Mudar o TIPO de um inactivo para um tipo com activo, activando-o, também é recusado.
    await semActivosEmW('PEDIDO_COMPRA');
    await criarEmW(circuito(`Activo ped ${sufixo}`, 'PEDIDO_COMPRA', ADMIN_W));
    const outroTipo = await criarEmW(circuito(`Inactivo troca ${sufixo}`, 'REQUISICAO_COMPRA', ADMIN_W, { ativo: false }));
    const antesTroca = await retratoCircuito(outroTipo);
    sessao(ADMIN_W, TENANT_W, [CONFIGURAR]);
    const troca = await actualizar({ id: outroTipo, ...circuito(`Inactivo troca ${sufixo}`, 'PEDIDO_COMPRA', ADMIN_W) });
    expect(troca.ok, 'activar por troca de tipo furou «um activo por tipo»').toBe(false);
    expect(troca.error?.code).toBe('WORKFLOW_ACTIVO_DUPLICADO');
    expect(await retratoCircuito(outroTipo)).toEqual(antesTroca);
    expect(await activos(TENANT_W, 'PEDIDO_COMPRA')).toBe(1);
  });

  it('editar o próprio circuito activo (sem mudar de tipo) não colide consigo mesmo', async () => {
    await semActivosEmW('REQUISICAO_COMPRA');
    const id = await criarEmW(circuito(`Activo auto ${sufixo}`, 'REQUISICAO_COMPRA', ADMIN_W));
    sessao(ADMIN_W, TENANT_W, [CONFIGURAR]);
    const r = await actualizar({
      id,
      ...circuito(`Activo auto ${sufixo}`, 'REQUISICAO_COMPRA', OUTRO_W, { nivelNome: 'Chefia revista', valorMaximo: 250_000 }),
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await retratoCircuito(id)).toEqual({
      nome: `Activo auto ${sufixo}`,
      tipo: 'REQUISICAO_COMPRA',
      ativo: true,
      niveis: [`1|Chefia revista|0|250000|QUALQUER_UM|${OUTRO_W}`],
    });
    expect(await activos(TENANT_W, 'REQUISICAO_COMPRA')).toBe(1);
  });

  it('editar para um nome já usado por outro circuito do tenant é recusado como regra de negócio', async () => {
    const a = await criarEmW(circuito(`Nome A ${sufixo}`, 'PEDIDO_COMPRA', ADMIN_W, { ativo: false }));
    await criarEmW(circuito(`Nome B ${sufixo}`, 'PEDIDO_COMPRA', ADMIN_W, { ativo: false }));
    const antes = await retratoCircuito(a);
    sessao(ADMIN_W, TENANT_W, [CONFIGURAR]);
    const r = await actualizar({ id: a, ...circuito(`Nome B ${sufixo}`, 'PEDIDO_COMPRA', ADMIN_W, { ativo: false }) });
    expect(r.ok, 'dois circuitos com o mesmo nome').toBe(false);
    expect(r.error?.code).not.toBe('ERRO_INTERNO');
    expect(await retratoCircuito(a)).toEqual(antes);
  });

  // =========================================================================
  // Circuitos: desactivar
  // =========================================================================

  it('desactivar: o circuito fica inactivo, outro activo do mesmo tipo passa a poder ser criado, e o «Submeter» deixa de o usar', async () => {
    await semActivosEmW('REQUISICAO_COMPRA');
    const id = await criarEmW(circuito(`Desactivar ${sufixo}`, 'REQUISICAO_COMPRA', OUTRO_W));
    const antes = await retratoCircuito(id);

    // Antes: o activo bloqueia outro activo (é o que a mensagem manda resolver).
    sessao(ADMIN_W, TENANT_W, [CONFIGURAR]);
    const bloqueado = await criar(circuito(`Substituto bloqueado ${sufixo}`, 'REQUISICAO_COMPRA', ADMIN_W));
    expect(bloqueado.ok).toBe(false);
    expect(bloqueado.error?.code).toBe('WORKFLOW_ACTIVO_DUPLICADO');

    const r = await desactivar(id);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await retratoCircuito(id)).toEqual({ ...antes, ativo: false });
    expect(await activos(TENANT_W, 'REQUISICAO_COMPRA')).toBe(0);

    // Sem circuito activo, o «Submeter» aprova de imediato — o desactivado já não conta.
    const c = { tenantId: TENANT_W, userId: ADMIN_W };
    const req = await runCtx(c, () =>
      compras.criarRequisicao(
        {
          data: new Date(),
          departamento: 'Compras #445',
          prioridade: 'MEDIA',
          justificativa: `Requisição do oráculo #445 (${sufixo})`,
          itens: [{ descricao: 'Resma de papel A4', quantidade: 1, unidadeMedida: 'UN', precoEstimado: 1_000 }],
        },
        c,
      ),
    );
    await runCtx(c, () => compras.submeterRequisicao(req.id, c));
    expect((await db.requisicaoCompra.findUnique({ where: { id: req.id } })).status).toBe('APROVADA');
    expect(await db.aprovacaoCompra.count({ where: { requisicaoCompraId: req.id } })).toBe(0);

    // Depois: o substituto activo passa.
    sessao(ADMIN_W, TENANT_W, [CONFIGURAR]);
    const substituto = await criar(circuito(`Substituto ${sufixo}`, 'REQUISICAO_COMPRA', ADMIN_W));
    expect(substituto.ok, JSON.stringify(substituto)).toBe(true);
    expect(await activos(TENANT_W, 'REQUISICAO_COMPRA')).toBe(1);
  });

  // =========================================================================
  // Circuitos: permissão e isolamento
  // =========================================================================

  it('sem compras:configurar → SEM_PERMISSAO em editar e desactivar, e nada muda', async () => {
    await semActivosEmW('PEDIDO_COMPRA');
    const id = await criarEmW(circuito(`Sem permissão ${sufixo}`, 'PEDIDO_COMPRA', ADMIN_W));
    const antes = await retratoCircuito(id);

    sessao(ADMIN_W, TENANT_W, ['compras:ver', DECIDIR]);
    const e = await actualizar({ id, ...circuito(`Sem permissão alterado ${sufixo}`, 'PEDIDO_COMPRA', ADMIN_W, { ativo: false }) });
    expect(e.ok).toBe(false);
    expect(e.error?.code).toBe('SEM_PERMISSAO');
    const d = await desactivar(id);
    expect(d.ok).toBe(false);
    expect(d.error?.code).toBe('SEM_PERMISSAO');
    expect(await retratoCircuito(id)).toEqual(antes);
  });

  it('circuito de outro tenant → NAO_ENCONTRADO em editar e desactivar, e nada muda', async () => {
    await semActivosEmW('PEDIDO_COMPRA');
    const id = await criarEmW(circuito(`Cross-tenant ${sufixo}`, 'PEDIDO_COMPRA', ADMIN_W));
    const antes = await retratoCircuito(id);

    sessao(ADMIN_O, TENANT_O, [CONFIGURAR]);
    const e = await actualizar({ id, ...circuito(`Roubado ${sufixo}`, 'PEDIDO_COMPRA', ADMIN_O, { ativo: false }) });
    expect(e.ok).toBe(false);
    expect(e.error?.code).toBe('NAO_ENCONTRADO');
    const d = await desactivar(id);
    expect(d.ok).toBe(false);
    expect(d.error?.code).toBe('NAO_ENCONTRADO');

    expect(await retratoCircuito(id)).toEqual(antes);
    expect(await db.configuracaoWorkflow.count({ where: { tenantId: TENANT_O } })).toBe(0);
  });

  // =========================================================================
  // Circuitos: «um activo por tipo» sob concorrência
  // =========================================================================

  it('N criações activas simultâneas do mesmo tipo deixam exactamente um activo; as outras são WORKFLOW_ACTIVO_DUPLICADO', async () => {
    sessao(ADMIN_K, TENANT_K, [CONFIGURAR]);
    // Aquece o pool de ligações: sem isto as primeiras consultas serializam-se na abertura
    // das ligações e a corrida não acontece.
    await Promise.all(Array.from({ length: 10 }, () => db.$executeRaw`SELECT pg_sleep(0.05)`));
    const N = 8;
    const tipos: Tipo[] = ['REQUISICAO_COMPRA', 'PEDIDO_COMPRA'];
    for (let ronda = 0; ronda < 3; ronda += 1) {
      for (const tipo of tipos) {
        await db.configuracaoWorkflow.deleteMany({ where: { tenantId: TENANT_K } });
        expect(await activos(TENANT_K, tipo)).toBe(0);
        const resultados = await Promise.all(
          Array.from({ length: N }, (_, i) => criar(circuito(`Corrida ${ronda}-${tipo}-${i} ${sufixo}`, tipo, ADMIN_K))),
        );
        const ok = resultados.filter((r) => r.ok);
        const recusados = resultados.filter((r) => !r.ok);
        expect(ok.length, `ronda ${ronda}/${tipo} — aceites: ${ok.length}`).toBe(1);
        expect(recusados.map((r) => r.error?.code)).toEqual(Array(N - 1).fill('WORKFLOW_ACTIVO_DUPLICADO'));
        expect(await activos(TENANT_K, tipo)).toBe(1);
        // As recusadas não deixaram circuitos (nem inactivos) para trás.
        expect(await db.configuracaoWorkflow.count({ where: { tenantId: TENANT_K } })).toBe(1);
      }
    }
  });

  it('N activações simultâneas por edição deixam no máximo um activo; as outras são WORKFLOW_ACTIVO_DUPLICADO', async () => {
    const N = 5;
    const ids: string[] = [];
    sessao(ADMIN_K2, TENANT_K2, [CONFIGURAR]);
    for (let i = 0; i < N; i += 1) {
      const r = await criar(circuito(`Inactivo ${i} ${sufixo}`, 'PEDIDO_COMPRA', ADMIN_K2, { ativo: false }));
      expect(r.ok, JSON.stringify(r)).toBe(true);
      const w = await db.configuracaoWorkflow.findFirst({ where: { tenantId: TENANT_K2, nome: `Inactivo ${i} ${sufixo}` } });
      ids.push(w.id);
    }
    expect(await activos(TENANT_K2, 'PEDIDO_COMPRA')).toBe(0);

    const resultados = await Promise.all(
      ids.map((id, i) => actualizar({ id, ...circuito(`Inactivo ${i} ${sufixo}`, 'PEDIDO_COMPRA', ADMIN_K2) })),
    );
    expect(resultados.filter((r) => r.ok).length, JSON.stringify(resultados)).toBe(1);
    expect(resultados.filter((r) => !r.ok).map((r) => r.error?.code)).toEqual(
      Array(N - 1).fill('WORKFLOW_ACTIVO_DUPLICADO'),
    );
    expect(await activos(TENANT_K2, 'PEDIDO_COMPRA')).toBe(1);
  });

  // =========================================================================
  // Pedido de compra: decisão sob tranca e estado terminal
  // =========================================================================

  const cP = () => ({ tenantId: TENANT_P, userId: COMPRADOR_P });

  /** Pedido ENVIADO pelo serviço real, com P1 e P2 PENDENTE no nível 1 (semeados por SQL). */
  async function pedidoEmAprovacao(): Promise<string> {
    const c = cP();
    const p = await runCtx(c, () =>
      compras.criarPedido(
        {
          fornecedorId: fornecedorP,
          data: new Date(),
          condicoesPagamento: '30 dias',
          prazoEntregaDias: 10,
          dataEntregaPrevista: new Date(Date.now() + 10 * 24 * 3600 * 1000),
          enderecoEntrega: 'Av. 25 de Setembro, Maputo',
          itens: [
            { descricao: 'Resma de papel A4', quantidade: 10, unidadeMedida: 'UN', precoUnitario: 300, desconto: 0, taxaIva: 0.16 },
          ],
        },
        c,
      ),
    );
    await runCtx(c, () => compras.enviarPedido(p.id, c));
    for (const ap of [APROV_P1, APROV_P2]) {
      await db.aprovacaoCompra.create({
        data: {
          tenantId: TENANT_P,
          pedidoCompraId: p.id,
          nivel: 1,
          aprovadorId: ap,
          aprovadorNome: email(ap),
          status: 'PENDENTE',
        },
      });
    }
    expect((await db.pedidoCompra.findUnique({ where: { id: p.id } })).status).toBe('ENVIADO');
    return p.id;
  }

  const lerPedido = async (id: string) => (await db.pedidoCompra.findUnique({ where: { id } })).status as string;
  const decisoes = async (id: string) =>
    (await db.aprovacaoCompra.findMany({ where: { pedidoCompraId: id }, orderBy: { aprovadorId: 'asc' } })).map(
      (a: any) => `${a.aprovadorId}|${a.status}`,
    );

  function decidir(aprovador: string, documentoId: string, status: 'APROVADO' | 'REJEITADO') {
    sessao(aprovador, TENANT_P, [DECIDIR]);
    return action('decidirAprovacaoAction')({
      documentoId,
      nivel: 1,
      status,
      ...(status === 'REJEITADO' ? { observacoes: 'Discordo deste pedido' } : {}),
    });
  }

  it('controlo: num pedido ENVIADO, a aprovação de um QUALQUER_UM confirma o pedido', async () => {
    const id = await pedidoEmAprovacao();
    const r = await decidir(APROV_P1, id, 'APROVADO');
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await lerPedido(id)).toBe('CONFIRMADO');
  });

  it('o segundo aprovador QUALQUER_UM não leva um pedido CONFIRMADO a CANCELADO', async () => {
    const id = await pedidoEmAprovacao();
    const p1 = await decidir(APROV_P1, id, 'APROVADO');
    expect(p1.ok, JSON.stringify(p1)).toBe(true);
    expect(await lerPedido(id)).toBe('CONFIRMADO');

    const p2 = await decidir(APROV_P2, id, 'REJEITADO');
    expect(p2.ok, 'um pedido CONFIRMADO foi cancelado por uma decisão tardia').toBe(false);
    expect(p2.error?.code).toBe('APROVACAO_ENCERRADA');
    expect(await lerPedido(id)).toBe('CONFIRMADO');
    expect(await decisoes(id)).toEqual([`${APROV_P1}|APROVADO`, `${APROV_P2}|PENDENTE`].sort());
  });

  it('o segundo aprovador QUALQUER_UM não reabre um pedido CANCELADO pela rejeição do primeiro', async () => {
    const id = await pedidoEmAprovacao();
    const p1 = await decidir(APROV_P1, id, 'REJEITADO');
    expect(p1.ok, JSON.stringify(p1)).toBe(true);
    expect(await lerPedido(id)).toBe('CANCELADO');

    const p2 = await decidir(APROV_P2, id, 'APROVADO');
    expect(p2.ok, 'um pedido CANCELADO aceitou uma aprovação depois').toBe(false);
    expect(p2.error?.code).toBe('APROVACAO_ENCERRADA');
    expect(await lerPedido(id)).toBe('CANCELADO');
    expect(await decisoes(id)).toEqual([`${APROV_P1}|REJEITADO`, `${APROV_P2}|PENDENTE`].sort());
  });

  it('pedido cancelado (ou já em trânsito) por fora do circuito não aceita decisão e não muda', async () => {
    const c = cP();
    const cancelado = await pedidoEmAprovacao();
    await runCtx(c, () => compras.cancelarPedido(cancelado, 'Cancelado pelo comprador #445', c));
    expect(await lerPedido(cancelado)).toBe('CANCELADO');
    const ap = await decidir(APROV_P1, cancelado, 'APROVADO');
    expect(ap.ok, 'um pedido CANCELADO foi confirmado por aprovação').toBe(false);
    expect(ap.error?.code).toBe('APROVACAO_ENCERRADA');
    expect(await lerPedido(cancelado)).toBe('CANCELADO');
    expect(await decisoes(cancelado)).toEqual([`${APROV_P1}|PENDENTE`, `${APROV_P2}|PENDENTE`].sort());

    const transito = await pedidoEmAprovacao();
    await runCtx(c, () => compras.confirmarPedido(transito, c));
    await runCtx(c, () => compras.marcarPedidoEmTransito(transito, c));
    expect(await lerPedido(transito)).toBe('EM_TRANSITO');
    const rj = await decidir(APROV_P2, transito, 'REJEITADO');
    expect(rj.ok, 'um pedido EM_TRANSITO foi cancelado por rejeição').toBe(false);
    expect(rj.error?.code).toBe('APROVACAO_ENCERRADA');
    expect(await lerPedido(transito)).toBe('EM_TRANSITO');
    expect(await decisoes(transito)).toEqual([`${APROV_P1}|PENDENTE`, `${APROV_P2}|PENDENTE`].sort());
  });

  it('decisões simultâneas de P1 (aprova) e P2 (rejeita) num pedido ENVIADO: exactamente uma conta', async () => {
    for (let ronda = 0; ronda < 4; ronda += 1) {
      const id = await pedidoEmAprovacao();
      // As duas chamadas partem antes de qualquer uma acabar; a sessão é lida por cada action
      // no arranque, por isso cada uma fixa a sua antes de ceder.
      const pA = (async () => {
        sessao(APROV_P1, TENANT_P, [DECIDIR]);
        return action('decidirAprovacaoAction')({ documentoId: id, nivel: 1, status: 'APROVADO' });
      })();
      const pB = (async () => {
        sessao(APROV_P2, TENANT_P, [DECIDIR]);
        return action('decidirAprovacaoAction')({
          documentoId: id, nivel: 1, status: 'REJEITADO', observacoes: 'Rejeição concorrente',
        });
      })();
      const [a, b] = await Promise.all([pA, pB]);

      const aceites = [a, b].filter((r) => r.ok).length;
      expect(aceites, `ronda ${ronda}: ${JSON.stringify([a, b])}`).toBe(1);
      const recusada = a.ok ? b : a;
      expect(recusada.error?.code, `ronda ${ronda}`).toBe('APROVACAO_ENCERRADA');

      const final = await lerPedido(id);
      const ds = await decisoes(id);
      if (a.ok) {
        expect(final).toBe('CONFIRMADO');
        expect(ds).toEqual([`${APROV_P1}|APROVADO`, `${APROV_P2}|PENDENTE`].sort());
      } else {
        expect(final).toBe('CANCELADO');
        expect(ds).toEqual([`${APROV_P1}|PENDENTE`, `${APROV_P2}|REJEITADO`].sort());
      }
    }
  });
});
