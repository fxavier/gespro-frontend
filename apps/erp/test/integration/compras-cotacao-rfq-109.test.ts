/**
 * Oráculo — issue #109: cotações RFQ sem UI para enviar, registar respostas, adjudicar ou
 * cancelar («a cotação fica sempre no estado inicial»).
 *
 * O serviço (`comprasService.enviarCotacao/registarResposta/adjudicarCotacao/cancelarCotacao`) e
 * as actions (`enviarCotacaoAction`, `registarRespostaCotacaoAction`, `adjudicarCotacaoAction`,
 * `cancelarCotacaoAction`, com as permissões `compras:cotacao:{enviar,resposta,adjudicar,
 * cancelar}`) já existem; nenhum ecrã os usa. Este oráculo fixa o contrato do lado do servidor
 * que o detalhe `/compras/cotacoes/[id]` e as rotas dedicadas vão consumir (o E2E
 * `e2e/48-compras-cotacao-rfq-109.spec.ts` prova a porta de entrada):
 *
 *   Ciclo pelas actions: RASCUNHO →(enviar) ENVIADA →(1.ª resposta) RESPONDIDA →(adjudicar)
 *   ADJUDICADA; cancelar a partir de RASCUNHO, ENVIADA ou RESPONDIDA → CANCELADA.
 *
 *   Registar resposta:
 *     - grava o preço por item com subtotal = quantidade × preço e marca o convite RESPONDIDA
 *       com data de resposta e prazo;
 *     - (OBRIGAÇÃO NOVA) o `valorTotal` do convite passa a ser Σ subtotais da resposta — o ecrã de
 *       adjudicação compara fornecedores por ele; hoje fica nulo;
 *     - (OBRIGAÇÃO NOVA, conservadora: recusar) um `itemCotacaoId` que não é desta cotação é
 *       recusado e nada é escrito (hoje o `findUnique` não está restrito e a resposta fica
 *       pendurada num item de outra cotação);
 *     - fornecedor não convidado → recusado; cotação fora de ENVIADA/RESPONDIDA → recusado.
 *
 *   Adjudicar (OBRIGAÇÃO NOVA, conservadora: recusar): o vencedor tem de ser um fornecedor
 *   convidado DESTA cotação que RESPONDEU. Um convidado sem resposta, um fornecedor não
 *   convidado ou um fornecedor de outro tenant é recusado como regra de negócio (nunca
 *   ERRO_INTERNO) e nada muda. Hoje grava qualquer id como vencedor.
 *
 *   Enviar (OBRIGAÇÃO NOVA, conservadora: recusar): uma cotação sem fornecedores convidados
 *   não é enviada — ninguém a poderia responder e não há forma de convidar depois.
 *
 *   Leitura para o ecrã:
 *     - `obterCotacao` devolve o NOME de cada fornecedor (hoje devolve o id) e, em cada resposta
 *       de item, o `fornecedorId` de quem respondeu (hoje '');
 *     - `listarCotacoes` devolve `totalFornecedores`/`totalRespostas` reais (hoje 0/0 fixos — a
 *       coluna «Fornecedores» da lista mostra sempre 0/0).
 *
 *   Transições inválidas (enviar duas vezes, cancelar ADJUDICADA, responder/adjudicar
 *   CANCELADA…) → recusadas como regra de negócio, nunca ERRO_INTERNO, estado intacto.
 *   Sem a permissão da acção → SEM_PERMISSAO; cotação de outro tenant → NAO_ENCONTRADO.
 *
 * Sessão (`@/lib/auth`) é o único duplo (fronteira), mutável por `vi.hoisted`; `next/cache` é
 * dobrado porque o `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero,
 * `bootstrapContabilidade` (série COTACAO_RFQ), `createSafeAction` e o `comprasService`.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó A:compras-cotacao-rfq-109; um agente de implementação que o
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

const ENVIAR = 'compras:cotacao:enviar';
const RESPOSTA = 'compras:cotacao:resposta';
const ADJUDICAR = 'compras:cotacao:adjudicar';
const CANCELAR = 'compras:cotacao:cancelar';
const TODAS = ['compras:ver', 'compras:cotacao:criar', ENVIAR, RESPOSTA, ADJUDICAR, CANCELAR];

type NomeAction =
  | 'enviarCotacaoAction'
  | 'registarRespostaCotacaoAction'
  | 'adjudicarCotacaoAction'
  | 'cancelarCotacaoAction';

describe.skipIf(skip)('Cotações RFQ — enviar, responder, adjudicar, cancelar (#109) — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  // Acesso dinâmico: o que ainda não se comporta como o contrato falha o caso, não o ficheiro.
  let compras: Record<string, (...args: any[]) => Promise<any>>;
  let actions: Record<string, (input: unknown) => Promise<Resultado>>;

  const sufixo = Date.now();
  const TENANT = `tenant-rfq-109-${sufixo}`;
  const OUTRO = `tenant-rfq-109-o-${sufixo}`;
  const USER = `user-rfq-109-${sufixo}`;
  const USER_OUTRO = `user-rfq-109-o-${sufixo}`;

  // Fornecedores do TENANT: F1 e F2 convidados; F3 existe mas não é convidado.
  // FO pertence ao OUTRO tenant.
  const forn: Record<'F1' | 'F2' | 'F3' | 'FO', { id: string; nome: string }> = {} as any;

  const ctx = { tenantId: TENANT, userId: USER };
  const ctxOutro = { tenantId: OUTRO, userId: USER_OUTRO };

  function sessao(userId: string, tenantId: string, permissions: string[]) {
    h.sessao = { user: { id: userId, tenantId, permissions, acesso: 'aberto' } };
  }

  function action(nome: NomeAction) {
    const fn = actions[nome];
    expect(typeof fn, `${nome} não está exportada de compras.actions.ts`).toBe('function');
    return fn;
  }

  const enviar = (cotacaoId: string) => action('enviarCotacaoAction')({ cotacaoId });
  const cancelar = (cotacaoId: string, motivo = 'Cancelada pelo oráculo #109') =>
    action('cancelarCotacaoAction')({ cotacaoId, motivo });
  const adjudicar = (cotacaoId: string, fornecedorVencedorId: string) =>
    action('adjudicarCotacaoAction')({ cotacaoId, fornecedorVencedorId });

  async function itensDe(cotacaoId: string): Promise<Array<{ id: string; descricao: string }>> {
    return db.itemCotacao.findMany({ where: { cotacaoId }, orderBy: { descricao: 'asc' } });
  }

  /** Resposta com o mesmo prazo em todos os itens; `precos` por descrição do item. */
  async function responder(cotacaoId: string, fornecedorId: string, precos: Record<string, number>, prazo = 10) {
    const itens = await itensDe(cotacaoId);
    return action('registarRespostaCotacaoAction')({
      cotacaoId,
      fornecedorId,
      prazoEntregaDias: prazo,
      condicoesPagamento: '30 dias',
      respostas: itens
        .filter((i) => precos[i.descricao] !== undefined)
        .map((i) => ({ itemCotacaoId: i.id, precoUnitario: precos[i.descricao], prazoEntregaDias: prazo })),
    });
  }

  /** Cria uma cotação pelo serviço real (numeração pela série COTACAO_RFQ do bootstrap). */
  async function novaCotacao(fornecedoresIds: string[] | undefined, c = ctx): Promise<string> {
    const validade = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const cot = await runCtx(c, () =>
      compras.criarCotacao(
        {
          dataValidade: validade,
          observacoes: `Cotação do oráculo #109 (${sufixo})`,
          itens: [
            { descricao: 'Cadeira de escritório', quantidade: 4, unidadeMedida: 'UN' },
            { descricao: 'Mesa de reunião', quantidade: 2, unidadeMedida: 'UN' },
          ],
          ...(fornecedoresIds ? { fornecedoresIds } : {}),
        },
        c,
      ),
    );
    return cot.id;
  }

  async function enviada(fornecedoresIds = [forn.F1.id, forn.F2.id]): Promise<string> {
    const id = await novaCotacao(fornecedoresIds);
    sessao(USER, TENANT, TODAS);
    const r = await enviar(id);
    expect(r.ok, `enviar falhou: ${JSON.stringify(r)}`).toBe(true);
    return id;
  }

  async function respondida(): Promise<string> {
    const id = await enviada();
    const r = await responder(id, forn.F1.id, { 'Cadeira de escritório': 150, 'Mesa de reunião': 1000 });
    expect(r.ok, `responder falhou: ${JSON.stringify(r)}`).toBe(true);
    return id;
  }

  async function retrato(cotacaoId: string) {
    const c = await db.cotacao.findUnique({ where: { id: cotacaoId } });
    const convites = await db.cotacaoFornecedor.findMany({ where: { cotacaoId }, orderBy: { fornecedorId: 'asc' } });
    const respostas = await db.respostaItemCotacao.findMany({
      where: { cotacaoFornecedor: { cotacaoId } },
      orderBy: [{ itemCotacaoId: 'asc' }, { cotacaoFornecedorId: 'asc' }],
    });
    return {
      status: c.status,
      vencedor: c.vencedorFornecedorId ?? null,
      convites: convites.map((x: any) => `${x.fornecedorId}|${x.status}|${x.valorTotal?.toString() ?? ''}`),
      respostas: respostas.map((r: any) => `${r.itemCotacaoId}|${r.cotacaoFornecedorId}|${r.precoUnitario.toString()}`),
    };
  }

  function recusadaComoRegra(r: Resultado, oQue: string) {
    expect(r.ok, `${oQue} foi aceite`).toBe(false);
    expect(r.error?.code, `${oQue} rebentou como erro interno: ${JSON.stringify(r)}`).not.toBe('ERRO_INTERNO');
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ comprasService: compras } = (await import('@/server/services/compras/compras.service')) as any);
    actions = (await import('@/server/actions/compras.actions')) as unknown as typeof actions;
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    const tenants = [
      [TENANT, `rfq-109-${sufixo}`, `${sufixo}`.slice(-9)],
      [OUTRO, `rfq-109-o-${sufixo}`, `${sufixo + 1}`.slice(-9)],
    ] as const;
    for (const [id, slug, nuit] of tenants) {
      await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit } });
    }
    await db.user.create({ data: { id: USER, tenantId: TENANT, email: `${USER}@test.mz`, nome: 'Compras', keycloakSub: `kc-${USER}` } });
    await db.user.create({
      data: { id: USER_OUTRO, tenantId: OUTRO, email: `${USER_OUTRO}@test.mz`, nome: 'Outro', keycloakSub: `kc-${USER_OUTRO}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, OUTRO), { timeout: 60_000 });

    const defs: Array<['F1' | 'F2' | 'F3' | 'FO', string, string]> = [
      ['F1', TENANT, 'Papelaria Maputo Lda'],
      ['F2', TENANT, 'Móveis da Matola SA'],
      ['F3', TENANT, 'Escritório Total Lda'],
      ['FO', OUTRO, 'Fornecedor de Outro Tenant'],
    ];
    let n = 0;
    for (const [chave, tenantId, nome] of defs) {
      n += 1;
      const f = await db.fornecedor.create({
        data: {
          tenantId,
          codigo: `FOR-109-${chave}-${sufixo}`,
          nome,
          tipo: 'PESSOA_JURIDICA',
          nuit: `4${String(sufixo + n).slice(-8)}`,
          email: `for-109-${chave.toLowerCase()}-${sufixo}@test.mz`,
        },
      });
      forn[chave] = { id: f.id, nome };
    }
  }, 180_000);

  // -------------------------------------------------------------------------
  // Ciclo completo
  // -------------------------------------------------------------------------

  it('ciclo pelas actions: enviar → responder (subtotais e valorTotal) → adjudicar ao respondente', async () => {
    const id = await novaCotacao([forn.F1.id, forn.F2.id]);
    expect((await retrato(id)).status).toBe('RASCUNHO');

    sessao(USER, TENANT, TODAS);
    const env = await enviar(id);
    expect(env.ok, JSON.stringify(env)).toBe(true);
    expect((await retrato(id)).status).toBe('ENVIADA');

    const resp = await responder(id, forn.F1.id, { 'Cadeira de escritório': 150, 'Mesa de reunião': 1000 }, 12);
    expect(resp.ok, JSON.stringify(resp)).toBe(true);

    const cot = await db.cotacao.findUnique({ where: { id } });
    expect(cot.status).toBe('RESPONDIDA');
    const convite = await db.cotacaoFornecedor.findFirst({ where: { cotacaoId: id, fornecedorId: forn.F1.id } });
    expect(convite.status).toBe('RESPONDIDA');
    expect(convite.dataResposta).toBeInstanceOf(Date);
    expect(convite.prazoEntregaDias).toBe(12);
    // 4 × 150 + 2 × 1000 = 2600
    expect(convite.valorTotal?.toString(), 'valorTotal do convite não é Σ subtotais').toBe('2600');

    const itens = await itensDe(id);
    const respostas = await db.respostaItemCotacao.findMany({ where: { cotacaoFornecedorId: convite.id } });
    const porItem = new Map(respostas.map((r: any) => [r.itemCotacaoId, r]));
    const cadeira = itens.find((i) => i.descricao === 'Cadeira de escritório')!;
    const mesa = itens.find((i) => i.descricao === 'Mesa de reunião')!;
    expect((porItem.get(cadeira.id) as any)?.subtotal.toString()).toBe('600');
    expect((porItem.get(mesa.id) as any)?.subtotal.toString()).toBe('2000');

    const naoRespondeu = await db.cotacaoFornecedor.findFirst({ where: { cotacaoId: id, fornecedorId: forn.F2.id } });
    expect(naoRespondeu.status).toBe('PENDENTE');

    const adj = await adjudicar(id, forn.F1.id);
    expect(adj.ok, JSON.stringify(adj)).toBe(true);
    const final = await retrato(id);
    expect(final.status).toBe('ADJUDICADA');
    expect(final.vencedor).toBe(forn.F1.id);
  });

  // -------------------------------------------------------------------------
  // Leitura para o ecrã
  // -------------------------------------------------------------------------

  it('obterCotacao devolve o nome dos fornecedores e quem respondeu a cada item', async () => {
    const id = await respondida();
    const d = await runCtx(ctx, () => compras.obterCotacao(id, ctx));

    const nomes = Object.fromEntries(d.fornecedores.map((f: any) => [f.fornecedorId, f.fornecedorNome]));
    expect(nomes).toEqual({ [forn.F1.id]: forn.F1.nome, [forn.F2.id]: forn.F2.nome });
    expect(d.totalFornecedores).toBe(2);
    expect(d.totalRespostas).toBe(1);

    const f1 = d.fornecedores.find((f: any) => f.fornecedorId === forn.F1.id);
    expect(f1.status).toBe('RESPONDIDA');
    expect(Number(f1.valorTotal)).toBe(2600);

    for (const item of d.itens) {
      expect(item.respostas, `item ${item.descricao} sem a resposta do F1`).toHaveLength(1);
      expect(item.respostas[0].fornecedorId, 'resposta sem o fornecedor que a deu').toBe(forn.F1.id);
    }
  });

  it('listarCotacoes devolve os totais reais de fornecedores e respostas', async () => {
    const id = await respondida();
    const pagina = await runCtx(ctx, () =>
      compras.listarCotacoes({ take: 100, orderBy: 'createdAt', orderDir: 'desc' }, ctx),
    );
    const linha = pagina.items.find((c: any) => c.id === id);
    expect(linha, 'a cotação não aparece na listagem').toBeTruthy();
    expect(linha.status).toBe('RESPONDIDA');
    expect({ fornecedores: linha.totalFornecedores, respostas: linha.totalRespostas }).toEqual({
      fornecedores: 2,
      respostas: 1,
    });
  });

  // -------------------------------------------------------------------------
  // Adjudicar só a quem respondeu
  // -------------------------------------------------------------------------

  it('adjudicar a quem não respondeu, a um não convidado ou a um fornecedor de outro tenant é recusado', async () => {
    const id = await respondida();
    const antes = await retrato(id);
    expect(antes.status).toBe('RESPONDIDA');
    sessao(USER, TENANT, TODAS);

    recusadaComoRegra(await adjudicar(id, forn.F2.id), 'adjudicar a um convidado sem resposta');
    expect(await retrato(id)).toEqual(antes);

    recusadaComoRegra(await adjudicar(id, forn.F3.id), 'adjudicar a um fornecedor não convidado');
    expect(await retrato(id)).toEqual(antes);

    recusadaComoRegra(await adjudicar(id, forn.FO.id), 'adjudicar a um fornecedor de outro tenant');
    expect(await retrato(id)).toEqual(antes);
  });

  it('adjudicar sem respostas (ENVIADA) é recusado e o estado não muda', async () => {
    const id = await enviada();
    const antes = await retrato(id);
    recusadaComoRegra(await adjudicar(id, forn.F1.id), 'adjudicar uma cotação ENVIADA sem respostas');
    expect(await retrato(id)).toEqual(antes);
  });

  // -------------------------------------------------------------------------
  // Enviar
  // -------------------------------------------------------------------------

  it('enviar sem fornecedores convidados é recusado; enviar duas vezes é recusado', async () => {
    const semConvidados = await novaCotacao(undefined);
    sessao(USER, TENANT, TODAS);
    recusadaComoRegra(await enviar(semConvidados), 'enviar uma cotação sem fornecedores convidados');
    expect((await retrato(semConvidados)).status).toBe('RASCUNHO');

    const id = await enviada();
    const antes = await retrato(id);
    recusadaComoRegra(await enviar(id), 'enviar uma cotação já ENVIADA');
    expect(await retrato(id)).toEqual(antes);
  });

  // -------------------------------------------------------------------------
  // Registar resposta
  // -------------------------------------------------------------------------

  it('responder em RASCUNHO, por fornecedor não convidado ou com item de outra cotação é recusado e nada é escrito', async () => {
    const rascunho = await novaCotacao([forn.F1.id]);
    sessao(USER, TENANT, TODAS);
    const antesR = await retrato(rascunho);
    recusadaComoRegra(
      await responder(rascunho, forn.F1.id, { 'Cadeira de escritório': 10 }),
      'responder a uma cotação em RASCUNHO',
    );
    expect(await retrato(rascunho)).toEqual(antesR);

    const id = await enviada();
    const antes = await retrato(id);

    recusadaComoRegra(
      await responder(id, forn.F3.id, { 'Cadeira de escritório': 10 }),
      'resposta de um fornecedor não convidado',
    );
    expect(await retrato(id)).toEqual(antes);

    // Item de OUTRA cotação do mesmo tenant.
    const alheia = await novaCotacao([forn.F1.id]);
    const [itemAlheio] = await itensDe(alheia);
    const r = await action('registarRespostaCotacaoAction')({
      cotacaoId: id,
      fornecedorId: forn.F1.id,
      prazoEntregaDias: 5,
      respostas: [{ itemCotacaoId: itemAlheio.id, precoUnitario: 99, prazoEntregaDias: 5 }],
    });
    recusadaComoRegra(r, 'resposta com um item de outra cotação');
    expect(await retrato(id)).toEqual(antes);
    expect(await db.respostaItemCotacao.count({ where: { itemCotacaoId: itemAlheio.id } })).toBe(0);
  });

  it('uma segunda resposta do mesmo fornecedor substitui a primeira (preços e valorTotal)', async () => {
    const id = await respondida();
    const r = await responder(id, forn.F1.id, { 'Cadeira de escritório': 140, 'Mesa de reunião': 900 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const convite = await db.cotacaoFornecedor.findFirst({ where: { cotacaoId: id, fornecedorId: forn.F1.id } });
    // 4 × 140 + 2 × 900 = 2360
    expect(convite.valorTotal?.toString()).toBe('2360');
    expect(await db.respostaItemCotacao.count({ where: { cotacaoFornecedorId: convite.id } })).toBe(2);
    expect((await retrato(id)).status).toBe('RESPONDIDA');
  });

  // -------------------------------------------------------------------------
  // Cancelar e estados terminais
  // -------------------------------------------------------------------------

  it('cancela a partir de RASCUNHO, ENVIADA e RESPONDIDA', async () => {
    sessao(USER, TENANT, TODAS);
    const rascunho = await novaCotacao([forn.F1.id]);
    const env = await enviada();
    const resp = await respondida();
    for (const id of [rascunho, env, resp]) {
      const r = await cancelar(id);
      expect(r.ok, JSON.stringify(r)).toBe(true);
      expect((await retrato(id)).status).toBe('CANCELADA');
    }
  });

  it('ADJUDICADA e CANCELADA são terminais: nenhuma acção passa e nada muda', async () => {
    const adjudicada = await respondida();
    sessao(USER, TENANT, TODAS);
    expect((await adjudicar(adjudicada, forn.F1.id)).ok).toBe(true);
    const antesA = await retrato(adjudicada);
    recusadaComoRegra(await cancelar(adjudicada), 'cancelar uma cotação ADJUDICADA');
    recusadaComoRegra(await enviar(adjudicada), 'enviar uma cotação ADJUDICADA');
    recusadaComoRegra(
      await responder(adjudicada, forn.F2.id, { 'Cadeira de escritório': 1 }),
      'responder a uma cotação ADJUDICADA',
    );
    recusadaComoRegra(await adjudicar(adjudicada, forn.F1.id), 'adjudicar de novo uma cotação ADJUDICADA');
    expect(await retrato(adjudicada)).toEqual(antesA);

    const cancelada = await respondida();
    expect((await cancelar(cancelada)).ok).toBe(true);
    const antesC = await retrato(cancelada);
    recusadaComoRegra(await adjudicar(cancelada, forn.F1.id), 'adjudicar uma cotação CANCELADA');
    recusadaComoRegra(
      await responder(cancelada, forn.F2.id, { 'Cadeira de escritório': 1 }),
      'responder a uma cotação CANCELADA',
    );
    recusadaComoRegra(await enviar(cancelada), 'enviar uma cotação CANCELADA');
    recusadaComoRegra(await cancelar(cancelada), 'cancelar de novo uma cotação CANCELADA');
    expect(await retrato(cancelada)).toEqual(antesC);
  });

  // -------------------------------------------------------------------------
  // Permissões e isolamento
  // -------------------------------------------------------------------------

  it('cada acção exige a sua permissão: sem ela → SEM_PERMISSAO e nada muda', async () => {
    const rascunho = await novaCotacao([forn.F1.id, forn.F2.id]);
    const resp = await respondida();
    const antesR = await retrato(rascunho);
    const antesResp = await retrato(resp);

    const casos: Array<[string, () => Promise<Resultado>]> = [
      [ENVIAR, () => enviar(rascunho)],
      [RESPOSTA, () => responder(resp, forn.F2.id, { 'Cadeira de escritório': 1 })],
      [ADJUDICAR, () => adjudicar(resp, forn.F1.id)],
      [CANCELAR, () => cancelar(resp)],
    ];
    for (const [perm, chamar] of casos) {
      sessao(USER, TENANT, TODAS.filter((p) => p !== perm));
      const r = await chamar();
      expect(r.ok, `${perm} em falta e a acção passou`).toBe(false);
      expect(r.error?.code, `${perm} em falta`).toBe('SEM_PERMISSAO');
    }
    expect(await retrato(rascunho)).toEqual(antesR);
    expect(await retrato(resp)).toEqual(antesResp);
  });

  it('cotação de outro tenant → NAO_ENCONTRADO e nada muda', async () => {
    const rascunho = await novaCotacao([forn.F1.id]);
    const resp = await respondida();
    const antesR = await retrato(rascunho);
    const antesResp = await retrato(resp);

    sessao(USER_OUTRO, OUTRO, TODAS);
    for (const [oQue, r] of [
      ['enviar', await enviar(rascunho)],
      ['responder', await responder(resp, forn.F2.id, { 'Cadeira de escritório': 1 })],
      ['adjudicar', await adjudicar(resp, forn.F1.id)],
      ['cancelar', await cancelar(resp)],
    ] as Array<[string, Resultado]>) {
      expect(r.ok, `${oQue} de outro tenant passou`).toBe(false);
      expect(r.error?.code, `${oQue} de outro tenant`).toBe('NAO_ENCONTRADO');
    }
    await expect(runCtx(ctxOutro, () => compras.obterCotacao(resp, ctxOutro))).rejects.toMatchObject({
      code: 'NAO_ENCONTRADO',
    });
    expect(await retrato(rascunho)).toEqual(antesR);
    expect(await retrato(resp)).toEqual(antesResp);
  });
});
