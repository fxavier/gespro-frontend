/**
 * Oráculo — issue #108: requisições de compra sem UI para aprovar/rejeitar nem configurar
 * circuitos de aprovação.
 *
 * O serviço já tem aprovação por níveis (`decidirAprovacao`) e criação de circuitos
 * (`criarConfiguracaoWorkflow`); nenhum ecrã os usa. Este oráculo fixa o contrato do lado do
 * servidor que a UI nova vai consumir (o E2E `e2e/47-compras-requisicao-aprovar-108.spec.ts`
 * prova a porta de entrada):
 *
 *   Aprovar / rejeitar — `decidirAprovacaoAction({ documentoId, nivel, status, observacoes })`,
 *   permissão `compras:aprovacao:decidir` (já existentes):
 *     - o nível do circuito é respeitado: só o aprovador PENDENTE do nível corrente decide;
 *       o aprovador do nível 2 não decide antes de o nível 1 fechar; ao fechar o último nível
 *       a requisição passa a APROVADA;
 *     - rejeitar EXIGE motivo (`observacoes` não vazio, sem contar espaços): sem motivo é
 *       recusado e nada muda; com motivo grava REJEITADA e o motivo na decisão;
 *     - decisão (OBRIGAÇÃO NOVA, opção conservadora: recusar) numa requisição que já não está
 *       EM_APROVACAO — ex.: QUALQUER_UM com dois aprovadores, o primeiro já decidiu — é
 *       recusada como regra de negócio (nunca ERRO_INTERNO) e o estado não muda;
 *     - sem a permissão → SEM_PERMISSAO; requisição de outro tenant → NAO_ENCONTRADO.
 *
 *   Circuitos — `criarConfiguracaoWorkflowAction` (permissão `compras:configurar`, já existe) e
 *   `comprasService.listarConfiguracoesWorkflow(ctx)` (NOVO, lido pelo ecrã de circuitos):
 *     - devolve um array com os circuitos do tenant (id, nome, tipo, ativo e níveis com
 *       nivel, nome, tipoAprovacao e aprovadores {usuarioId, email}); nunca os de outro tenant;
 *     - um segundo circuito ACTIVO para o mesmo tipo é recusado (opção conservadora: o
 *       `encontrarWorkflow` faz `findFirst` e escolheria um ao acaso); outro tipo passa;
 *     - sem `compras:configurar` → SEM_PERMISSAO.
 *
 * Sessão (`@/lib/auth`) é o único duplo (fronteira), mutável por `vi.hoisted`; `next/cache` é
 * dobrado porque o `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero,
 * `bootstrapContabilidade` (séries), `createSafeAction` e o `comprasService`.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó A:compras-requisicao-aprovar-108; um agente de implementação
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

type Resultado = { ok: boolean; data?: unknown; error?: { code: string; message: string } };

const DECIDIR = 'compras:aprovacao:decidir';
const CONFIGURAR = 'compras:configurar';

describe.skipIf(skip)('Aprovar/rejeitar requisições e circuitos (#108) — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  // Acesso dinâmico: o que ainda não existe falha o caso, não o ficheiro.
  let compras: Record<string, (...args: any[]) => Promise<any>>;
  let actions: Record<string, (input: unknown) => Promise<Resultado>>;

  const sufixo = Date.now();
  // Tenant N: circuito de dois níveis (A no nível 1, B no nível 2).
  const TENANT_N = `tenant-req-108-n-${sufixo}`;
  // Tenant Q: circuito de um nível QUALQUER_UM com dois aprovadores (Q1, Q2).
  const TENANT_Q = `tenant-req-108-q-${sufixo}`;
  // Tenant C: configuração de circuitos pela action (sem requisições).
  const TENANT_C = `tenant-req-108-c-${sufixo}`;

  const SOLICITANTE_N = `user-req-108-sol-n-${sufixo}`;
  const APROV_A = `user-req-108-a-${sufixo}`;
  const APROV_B = `user-req-108-b-${sufixo}`;
  const SOLICITANTE_Q = `user-req-108-sol-q-${sufixo}`;
  const APROV_Q1 = `user-req-108-q1-${sufixo}`;
  const APROV_Q2 = `user-req-108-q2-${sufixo}`;
  const ADMIN_C = `user-req-108-c-${sufixo}`;

  const email = (id: string) => `${id}@test.mz`;

  function sessao(userId: string, tenantId: string, permissions: string[]) {
    h.sessao = { user: { id: userId, tenantId, permissions, acesso: 'aberto' } };
  }

  function action(nome: 'decidirAprovacaoAction' | 'criarConfiguracaoWorkflowAction') {
    const fn = actions[nome];
    expect(typeof fn, `${nome} não está exportada de compras.actions.ts`).toBe('function');
    return fn;
  }

  function servico(nome: string) {
    const fn = compras[nome];
    expect(typeof fn, `comprasService.${nome} não existe`).toBe('function');
    return fn.bind(compras);
  }

  /** Cria e submete uma requisição pelo serviço real (numeração pela série do bootstrap). */
  async function requisicaoSubmetida(tenantId: string, solicitante: string, valor: number): Promise<string> {
    const c = { tenantId, userId: solicitante };
    const req = await runCtx(c, () =>
      compras.criarRequisicao(
        {
          data: new Date(),
          departamento: 'Compras #108',
          prioridade: 'MEDIA',
          justificativa: `Requisição do oráculo #108 (${sufixo})`,
          itens: [{ descricao: 'Resma de papel A4', quantidade: 1, unidadeMedida: 'UN', precoEstimado: valor }],
        },
        c,
      ),
    );
    await runCtx(c, () => compras.submeterRequisicao(req.id, c));
    return req.id;
  }

  const lerReq = (id: string) => db.requisicaoCompra.findUnique({ where: { id } });
  const aprovacoes = (id: string) =>
    db.aprovacaoCompra.findMany({ where: { requisicaoCompraId: id }, orderBy: [{ nivel: 'asc' }, { aprovadorId: 'asc' }] });

  async function retrato(id: string) {
    const r = await lerReq(id);
    const a = await aprovacoes(id);
    return {
      status: r.status,
      aprovacoes: a.map((x: any) => `${x.nivel}|${x.aprovadorId}|${x.status}|${x.observacoes ?? ''}`),
    };
  }

  function decidir(documentoId: string, nivel: number, status: 'APROVADO' | 'REJEITADO', observacoes?: string) {
    return action('decidirAprovacaoAction')({
      documentoId,
      nivel,
      status,
      ...(observacoes === undefined ? {} : { observacoes }),
    });
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ comprasService: compras } = (await import('@/server/services/compras/compras.service')) as any);
    actions = (await import('@/server/actions/compras.actions')) as unknown as typeof actions;
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    const tenants = [
      [TENANT_N, `req-108-n-${sufixo}`, `${sufixo}`.slice(-9)],
      [TENANT_Q, `req-108-q-${sufixo}`, `${sufixo + 1}`.slice(-9)],
      [TENANT_C, `req-108-c-${sufixo}`, `${sufixo + 2}`.slice(-9)],
    ] as const;
    for (const [id, slug, nuit] of tenants) {
      await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit } });
    }
    const users: Array<[string, string]> = [
      [SOLICITANTE_N, TENANT_N], [APROV_A, TENANT_N], [APROV_B, TENANT_N],
      [SOLICITANTE_Q, TENANT_Q], [APROV_Q1, TENANT_Q], [APROV_Q2, TENANT_Q],
      [ADMIN_C, TENANT_C],
    ];
    for (const [id, tenantId] of users) {
      await db.user.create({ data: { id, tenantId, email: email(id), nome: id, keycloakSub: `kc-${id}` } });
    }
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT_N), { timeout: 60_000 });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT_Q), { timeout: 60_000 });

    // Circuitos pelo serviço real (já existe): o caminho da action é provado no bloco «circuitos».
    const cN = { tenantId: TENANT_N, userId: APROV_A };
    await runCtx(cN, () =>
      compras.criarConfiguracaoWorkflow(
        {
          nome: `Circuito N ${sufixo}`,
          tipo: 'REQUISICAO_COMPRA',
          ativo: true,
          niveis: [
            { nivel: 1, nome: 'Chefia', valorMinimo: 0, valorMaximo: 1_000_000_000, tipoAprovacao: 'QUALQUER_UM',
              aprovadores: [{ usuarioId: APROV_A, email: email(APROV_A) }] },
            { nivel: 2, nome: 'Direcção', valorMinimo: 0, valorMaximo: 1_000_000_000, tipoAprovacao: 'QUALQUER_UM',
              aprovadores: [{ usuarioId: APROV_B, email: email(APROV_B) }] },
          ],
        },
        cN,
      ),
    );
    const cQ = { tenantId: TENANT_Q, userId: APROV_Q1 };
    await runCtx(cQ, () =>
      compras.criarConfiguracaoWorkflow(
        {
          nome: `Circuito Q ${sufixo}`,
          tipo: 'REQUISICAO_COMPRA',
          ativo: true,
          niveis: [
            { nivel: 1, nome: 'Qualquer um', valorMinimo: 0, valorMaximo: 1_000_000_000, tipoAprovacao: 'QUALQUER_UM',
              aprovadores: [
                { usuarioId: APROV_Q1, email: email(APROV_Q1) },
                { usuarioId: APROV_Q2, email: email(APROV_Q2) },
              ] },
          ],
        },
        cQ,
      ),
    );
  }, 180_000);

  // -------------------------------------------------------------------------
  // Aprovar / rejeitar por nível
  // -------------------------------------------------------------------------

  it('respeita o nível: só o aprovador do nível corrente decide; o último nível aprova a requisição', async () => {
    const id = await requisicaoSubmetida(TENANT_N, SOLICITANTE_N, 5_000);
    expect(await retrato(id)).toEqual({
      status: 'EM_APROVACAO',
      aprovacoes: [`1|${APROV_A}|PENDENTE|`],
    });

    // B (nível 2) não decide antes de o nível 1 fechar — nem no 1 nem no 2.
    sessao(APROV_B, TENANT_N, [DECIDIR]);
    const bCedo2 = await decidir(id, 2, 'APROVADO');
    expect(bCedo2.ok).toBe(false);
    expect(bCedo2.error?.code).toBe('NAO_ENCONTRADO');
    const bCedo1 = await decidir(id, 1, 'APROVADO');
    expect(bCedo1.ok).toBe(false);
    expect(bCedo1.error?.code).toBe('NAO_ENCONTRADO');
    expect((await lerReq(id)).status).toBe('EM_APROVACAO');

    // A aprova o nível 1 → a requisição continua EM_APROVACAO e nasce o nível 2 para B.
    sessao(APROV_A, TENANT_N, [DECIDIR]);
    const a1 = await decidir(id, 1, 'APROVADO');
    expect(a1.ok, JSON.stringify(a1)).toBe(true);
    expect(await retrato(id)).toEqual({
      status: 'EM_APROVACAO',
      aprovacoes: [`1|${APROV_A}|APROVADO|`, `2|${APROV_B}|PENDENTE|`],
    });

    // A não decide o nível 2 (não é aprovador dele).
    const a2 = await decidir(id, 2, 'APROVADO');
    expect(a2.ok).toBe(false);
    expect(a2.error?.code).toBe('NAO_ENCONTRADO');

    // B aprova o nível 2 (último) → APROVADA.
    sessao(APROV_B, TENANT_N, [DECIDIR]);
    const b2 = await decidir(id, 2, 'APROVADO');
    expect(b2.ok, JSON.stringify(b2)).toBe(true);
    expect(await retrato(id)).toEqual({
      status: 'APROVADA',
      aprovacoes: [`1|${APROV_A}|APROVADO|`, `2|${APROV_B}|APROVADO|`],
    });
  });

  it('rejeitar sem motivo é recusado e nada muda; com motivo grava REJEITADA e o motivo', async () => {
    const id = await requisicaoSubmetida(TENANT_N, SOLICITANTE_N, 7_500);
    sessao(APROV_A, TENANT_N, [DECIDIR]);
    const antes = await retrato(id);
    expect(antes.status).toBe('EM_APROVACAO');

    const semMotivo = await decidir(id, 1, 'REJEITADO');
    expect(semMotivo.ok, 'rejeitar sem motivo foi aceite').toBe(false);
    const vazio = await decidir(id, 1, 'REJEITADO', '');
    expect(vazio.ok, 'rejeitar com motivo vazio foi aceite').toBe(false);
    const espacos = await decidir(id, 1, 'REJEITADO', '    ');
    expect(espacos.ok, 'rejeitar com motivo só de espaços foi aceite').toBe(false);
    expect(await retrato(id)).toEqual(antes);

    const motivo = 'Orçamento do departamento esgotado';
    const r = await decidir(id, 1, 'REJEITADO', motivo);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await retrato(id)).toEqual({
      status: 'REJEITADA',
      aprovacoes: [`1|${APROV_A}|REJEITADO|${motivo}`],
    });
    const [decisao] = await aprovacoes(id);
    expect(decisao.data).toBeInstanceOf(Date);
  });

  it('aprovar não exige motivo', async () => {
    const id = await requisicaoSubmetida(TENANT_N, SOLICITANTE_N, 1_000);
    sessao(APROV_A, TENANT_N, [DECIDIR]);
    const r = await decidir(id, 1, 'APROVADO');
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect((await aprovacoes(id))[0].status).toBe('APROVADO');
  });

  it('decisão numa requisição que já não está EM_APROVACAO é recusada e o estado não muda', async () => {
    // QUALQUER_UM: Q1 aprova → APROVADA; o registo de Q2 fica para trás e não pode desfazer.
    const aprovada = await requisicaoSubmetida(TENANT_Q, SOLICITANTE_Q, 2_000);
    sessao(APROV_Q1, TENANT_Q, [DECIDIR]);
    const q1 = await decidir(aprovada, 1, 'APROVADO');
    expect(q1.ok, JSON.stringify(q1)).toBe(true);
    expect((await lerReq(aprovada)).status).toBe('APROVADA');

    sessao(APROV_Q2, TENANT_Q, [DECIDIR]);
    const tarde = await decidir(aprovada, 1, 'REJEITADO', 'Discordo da compra');
    expect(tarde.ok, 'uma requisição APROVADA foi rejeitada depois').toBe(false);
    expect(tarde.error?.code).not.toBe('ERRO_INTERNO');
    expect((await lerReq(aprovada)).status).toBe('APROVADA');
    expect((await aprovacoes(aprovada)).some((a: any) => a.status === 'REJEITADO')).toBe(false);

    // Q1 rejeita → REJEITADA; Q2 não a aprova depois.
    const rejeitada = await requisicaoSubmetida(TENANT_Q, SOLICITANTE_Q, 3_000);
    sessao(APROV_Q1, TENANT_Q, [DECIDIR]);
    const rq1 = await decidir(rejeitada, 1, 'REJEITADO', 'Fornecedor não homologado');
    expect(rq1.ok, JSON.stringify(rq1)).toBe(true);
    expect((await lerReq(rejeitada)).status).toBe('REJEITADA');

    sessao(APROV_Q2, TENANT_Q, [DECIDIR]);
    const aprovarTarde = await decidir(rejeitada, 1, 'APROVADO');
    expect(aprovarTarde.ok, 'uma requisição REJEITADA aceitou uma aprovação depois').toBe(false);
    expect(aprovarTarde.error?.code).not.toBe('ERRO_INTERNO');
    expect((await lerReq(rejeitada)).status).toBe('REJEITADA');
    expect(
      (await aprovacoes(rejeitada)).filter((a: any) => a.aprovadorId === APROV_Q2).map((a: any) => a.status),
    ).not.toContain('APROVADO');
  });

  it('sem compras:aprovacao:decidir → SEM_PERMISSAO e nada muda', async () => {
    const id = await requisicaoSubmetida(TENANT_N, SOLICITANTE_N, 4_000);
    const antes = await retrato(id);
    sessao(APROV_A, TENANT_N, ['compras:ver', 'compras:requisicao:submeter', CONFIGURAR]);

    const ap = await decidir(id, 1, 'APROVADO');
    expect(ap.ok).toBe(false);
    expect(ap.error?.code).toBe('SEM_PERMISSAO');
    const rj = await decidir(id, 1, 'REJEITADO', 'Sem permissão');
    expect(rj.ok).toBe(false);
    expect(rj.error?.code).toBe('SEM_PERMISSAO');

    expect(await retrato(id)).toEqual(antes);
  });

  it('requisição de outro tenant → NAO_ENCONTRADO e nada muda', async () => {
    const id = await requisicaoSubmetida(TENANT_Q, SOLICITANTE_Q, 6_000);
    const antes = await retrato(id);
    // A sessão é de outro tenant, mesmo com o id de um aprovador real de Q.
    sessao(APROV_Q1, TENANT_N, [DECIDIR]);

    const ap = await decidir(id, 1, 'APROVADO');
    expect(ap.ok).toBe(false);
    expect(ap.error?.code).toBe('NAO_ENCONTRADO');
    const rj = await decidir(id, 1, 'REJEITADO', 'Cross-tenant');
    expect(rj.ok).toBe(false);
    expect(rj.error?.code).toBe('NAO_ENCONTRADO');

    expect(await retrato(id)).toEqual(antes);
  });

  // -------------------------------------------------------------------------
  // Circuitos de aprovação (ecrã de configuração)
  // -------------------------------------------------------------------------

  const circuito = (nome: string, tipo: 'REQUISICAO_COMPRA' | 'PEDIDO_COMPRA', aprovador = ADMIN_C) => ({
    nome,
    tipo,
    ativo: true,
    niveis: [
      { nivel: 1, nome: 'Chefia', valorMinimo: 0, valorMaximo: 50_000, tipoAprovacao: 'QUALQUER_UM',
        aprovadores: [{ usuarioId: aprovador, email: email(aprovador) }] },
      { nivel: 2, nome: 'Administração', valorMinimo: 0, valorMaximo: 10_000_000, tipoAprovacao: 'TODOS',
        aprovadores: [{ usuarioId: aprovador, email: email(aprovador) }] },
    ],
  });

  it('sem compras:configurar → SEM_PERMISSAO e nenhum circuito é criado', async () => {
    sessao(ADMIN_C, TENANT_C, [DECIDIR, 'compras:ver']);
    const r = await action('criarConfiguracaoWorkflowAction')(circuito(`Sem permissão ${sufixo}`, 'REQUISICAO_COMPRA'));
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('SEM_PERMISSAO');
    expect(await db.configuracaoWorkflow.count({ where: { tenantId: TENANT_C } })).toBe(0);
  });

  it('criar pela action e listar: o circuito aparece com níveis e aprovadores, só no próprio tenant', async () => {
    sessao(ADMIN_C, TENANT_C, [CONFIGURAR]);
    const nome = `Circuito requisições ${sufixo}`;
    const r = await action('criarConfiguracaoWorkflowAction')(circuito(nome, 'REQUISICAO_COMPRA'));
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const listar = servico('listarConfiguracoesWorkflow');
    const c = { tenantId: TENANT_C, userId: ADMIN_C };
    const lista = await runCtx(c, () => listar(c));
    expect(Array.isArray(lista), 'listarConfiguracoesWorkflow deve devolver um array').toBe(true);
    expect(lista.map((w: any) => w.nome)).toEqual([nome]);

    const [w] = lista;
    expect(typeof w.id).toBe('string');
    expect(w.tipo).toBe('REQUISICAO_COMPRA');
    expect(w.ativo).toBe(true);
    const niveis = [...w.niveis].sort((x: any, y: any) => x.nivel - y.nivel);
    expect(niveis.map((n: any) => `${n.nivel}|${n.nome}|${n.tipoAprovacao}`)).toEqual([
      '1|Chefia|QUALQUER_UM',
      '2|Administração|TODOS',
    ]);
    for (const n of niveis) {
      expect(n.aprovadores.map((a: any) => `${a.usuarioId}|${a.email}`)).toEqual([`${ADMIN_C}|${email(ADMIN_C)}`]);
    }
    expect(Number(niveis[0].valorMaximo)).toBe(50_000);

    // Isolamento: o tenant N só vê o seu circuito.
    const cN = { tenantId: TENANT_N, userId: APROV_A };
    const listaN = await runCtx(cN, () => listar(cN));
    expect(listaN.map((w: any) => w.nome)).toEqual([`Circuito N ${sufixo}`]);
  });

  it('segundo circuito ACTIVO para o mesmo tipo é recusado; outro tipo passa', async () => {
    sessao(ADMIN_C, TENANT_C, [CONFIGURAR]);
    const activosReq = () =>
      db.configuracaoWorkflow.count({ where: { tenantId: TENANT_C, tipo: 'REQUISICAO_COMPRA', ativo: true } });

    // Garante um circuito activo de requisições (independente da ordem dos casos).
    if ((await activosReq()) === 0) {
      const base = await action('criarConfiguracaoWorkflowAction')(circuito(`Base ${sufixo}`, 'REQUISICAO_COMPRA'));
      expect(base.ok, JSON.stringify(base)).toBe(true);
    }
    expect(await activosReq()).toBe(1);

    const dup = await action('criarConfiguracaoWorkflowAction')(circuito(`Duplicado ${sufixo}`, 'REQUISICAO_COMPRA'));
    expect(dup.ok, 'um segundo circuito activo de requisições foi aceite').toBe(false);
    expect(dup.error?.code).not.toBe('ERRO_INTERNO');
    expect(await activosReq()).toBe(1);

    const pedidos = await action('criarConfiguracaoWorkflowAction')(circuito(`Pedidos ${sufixo}`, 'PEDIDO_COMPRA'));
    expect(pedidos.ok, JSON.stringify(pedidos)).toBe(true);
  });
});
