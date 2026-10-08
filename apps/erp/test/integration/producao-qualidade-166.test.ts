/**
 * Oráculo — issue #166: `OrdemProducao.qualidadeAprovada` sem escritor, logo nenhuma ordem conclui.
 *
 * `transitarStatus(→ CONCLUIDA)` exige `qualidadeAprovada = true` (`QUALIDADE_NAO_APROVADA`), mas
 * nada no produto escreve `true`. Contrato (decisão do orquestrador; as escolhas em aberto foram
 * fechadas pelo verificador do lado conservador e são contrato):
 *
 *   - aprovar: `aprovarQualidadeOrdemAction({ id, observacoes? })` (em `producao.actions.ts`),
 *     permissão EXISTENTE `producao:ordens:update` (nenhuma permissão nova — não exige `db:seed`);
 *     grava `qualidadeAprovada = true`, `qualidadeObservacoes` = observações (quando dadas),
 *     `qualidadeAvaliadaPorId` = utilizador da sessão e `qualidadeAvaliadaEm` = agora;
 *   - reprovar: `reprovarQualidadeOrdemAction({ id, motivo })`, mesma permissão; `motivo`
 *     obrigatório (vazio ou só espaços é recusado e nada muda); grava `qualidadeAprovada = false`,
 *     `qualidadeObservacoes` = motivo, avaliador e instante. Reprovar NÃO muda o estado da ordem
 *     (continua EM_PRODUCAO, para retrabalho e nova inspecção);
 *   - só em EM_PRODUCAO: PLANEADA, LIBERADA, PAUSADA, CONCLUIDA e CANCELADA recusam as duas
 *     operações como regra de negócio (nunca `ERRO_INTERNO`) e nada muda — em particular uma
 *     ordem CONCLUIDA não pode ser reprovada depois de dar entrada do produto em stock;
 *   - as colunas `qualidadeObservacoes`, `qualidadeAvaliadaPorId`, `qualidadeAvaliadaEm` são
 *     novas e anuláveis; o campo geral `OrdemProducao.observacoes` NÃO é usado nem alterado;
 *   - sem permissão → `SEM_PERMISSAO`; ordem de outro tenant → `NAO_ENCONTRADO`; tenant em modo
 *     de leitura → `ACESSO_LEITURA`; nada muda em nenhum dos casos;
 *   - estado-com-escritor: o predicado de decisão (`concluir`) é provado nos dois sentidos —
 *     aprovar → concluir passa; aprovar → reprovar → concluir recusa `QUALIDADE_NAO_APROVADA`;
 *     reprovar → aprovar → concluir passa.
 *
 * Sessão (`@/lib/auth`) é o único duplo (fronteira), mutável por `vi.hoisted`; `next/cache` é
 * dobrado porque o `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero,
 * `bootstrapContabilidade` (série ORDEM_PRODUCAO), `createSafeAction`, `OrdemProducaoService` e o
 * contrato de stock real (a conclusão dá entrada do produto acabado na localização `PA`).
 * As ordens nascem pela `criarOrdemProducaoAction` (número da série, nunca inventado) e mudam de
 * estado pela `transitarStatusOrdemProducaoAction`.
 *
 * ESTADO ESPERADO antes da implementação: RED — as duas actions não existem e as colunas novas
 * também não.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó A:producao-qualidade-166; um agente de implementação que o
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
  | 'aprovarQualidadeOrdemAction'
  | 'reprovarQualidadeOrdemAction'
  | 'criarOrdemProducaoAction'
  | 'transitarStatusOrdemProducaoAction';

describe.skipIf(skip)('Produção: aprovar/reprovar o controlo de qualidade da ordem (#166) — DB efémera', () => {
  let db: any;
  // Acesso dinâmico: as actions novas ainda não existem — falha o caso, não o ficheiro.
  let actions: Record<string, (input: unknown) => Promise<Resultado>>;

  const sufixo = Date.now();
  const TENANT = `tenant-pq-166-${sufixo}`;
  const OUTRO_TENANT = `tenant-pq-166-outro-${sufixo}`;
  const GESTOR = `user-pq-166-gestor-${sufixo}`;
  const INSPECTOR = `user-pq-166-insp-${sufixo}`;
  const OUTRO = `user-pq-166-outro-${sufixo}`;

  const PERMS = ['producao:ordens:create', 'producao:ordens:update', 'producao:ordens:read'];

  const produtos: Record<string, { id: string; sku: string; nome: string }> = {};
  let localPaId: string;

  function sessao(userId: string, permissions: string[], tenantId = TENANT, acesso: 'aberto' | 'leitura' = 'aberto') {
    h.sessao = { user: { id: userId, tenantId, permissions, acesso } };
  }

  function action(nome: NomeAction) {
    const fn = actions[nome];
    expect(typeof fn, `${nome} não está exportada de producao.actions.ts`).toBe('function');
    return fn;
  }

  const ler = (id: string) => db.ordemProducao.findUnique({ where: { id } });

  async function criarOrdem(tenantId = TENANT, userId = GESTOR): Promise<string> {
    const p = produtos[tenantId];
    sessao(userId, PERMS, tenantId);
    const r = await action('criarOrdemProducaoAction')({
      produtoId: p.id,
      codigoProduto: p.sku,
      nomeProduto: p.nome,
      quantidade: 5,
      unidadeMedida: 'UN',
      prioridade: 'MEDIA',
      dataPrevisaoInicio: new Date(Date.UTC(2026, 9, 1, 10)),
      dataPrevisaoFim: new Date(Date.UTC(2026, 9, 10, 10)),
      observacoes: 'Observação geral da ordem — não é a da qualidade',
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const id = (r.data as { id: string }).id;
    expect(typeof id).toBe('string');
    return id;
  }

  async function transitar(id: string, novoStatus: string, tenantId = TENANT, userId = GESTOR): Promise<Resultado> {
    sessao(userId, PERMS, tenantId);
    return action('transitarStatusOrdemProducaoAction')({ id, novoStatus });
  }

  async function levarA(id: string, caminho: string[], tenantId = TENANT): Promise<void> {
    for (const s of caminho) {
      const r = await transitar(id, s, tenantId);
      expect(r.ok, `transição para ${s}: ${JSON.stringify(r)}`).toBe(true);
    }
  }

  /** Ordem já em EM_PRODUCAO (PLANEADA → LIBERADA → EM_PRODUCAO, sem BOM: não reserva nada). */
  async function ordemEmProducao(tenantId = TENANT): Promise<string> {
    const id = await criarOrdem(tenantId, tenantId === TENANT ? GESTOR : OUTRO);
    await levarA(id, ['LIBERADA', 'EM_PRODUCAO'], tenantId);
    expect((await ler(id)).status).toBe('EM_PRODUCAO');
    return id;
  }

  async function aprovar(id: string, observacoes?: string, userId = INSPECTOR): Promise<Resultado> {
    sessao(userId, ['producao:ordens:update', 'producao:ordens:read']);
    return action('aprovarQualidadeOrdemAction')(observacoes === undefined ? { id } : { id, observacoes });
  }

  async function reprovar(id: string, motivo: unknown, userId = INSPECTOR): Promise<Resultado> {
    sessao(userId, ['producao:ordens:update', 'producao:ordens:read']);
    return action('reprovarQualidadeOrdemAction')({ id, motivo });
  }

  async function saldoPa(): Promise<number> {
    const s = await db.saldoStock.findMany({
      where: { tenantId: TENANT, produtoId: produtos[TENANT].id, localizacaoId: localPaId },
      select: { saldo: true },
    });
    return s.reduce((a: number, x: { saldo: unknown }) => a + Number(x.saldo), 0);
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    actions = (await import('@/server/actions/producao.actions')) as unknown as typeof actions;
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    for (const [id, slug, nuit] of [
      [TENANT, `pq-166-${sufixo}`, `${sufixo}`.slice(-9)],
      [OUTRO_TENANT, `pq-166-o-${sufixo}`, `${sufixo + 1}`.slice(-9)],
    ] as const) {
      await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit } });
    }
    for (const [id, tenantId, tag] of [
      [GESTOR, TENANT, 'gestor'],
      [INSPECTOR, TENANT, 'insp'],
      [OUTRO, OUTRO_TENANT, 'outro'],
    ] as const) {
      await db.user.create({
        data: { id, tenantId, email: `pq-166-${tag}-${sufixo}@test.mz`, nome: `User ${tag}`, keycloakSub: `kc-pq-166-${tag}-${sufixo}` },
      });
    }
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, OUTRO_TENANT), { timeout: 60_000 });

    for (const tenantId of [TENANT, OUTRO_TENANT]) {
      const cat = await db.categoriaProduto.create({ data: { tenantId, nome: `Mobiliário ${tenantId}` } });
      const sku = `CAD-166-${tenantId === TENANT ? 'A' : 'B'}-${sufixo}`;
      const p = await db.produto.create({
        data: {
          tenantId,
          sku,
          nome: 'Cadeira de pinho',
          categoriaId: cat.id,
          unidadeMedida: 'UN',
          precoVenda: '2500.00',
          precoCompra: '1500.00',
          margemLucro: '0.40',
          stockMinimo: '0',
        },
        select: { id: true, sku: true, nome: true },
      });
      produtos[tenantId] = p;
      const pa = await db.localizacao.create({
        data: { tenantId, codigo: 'PA', nome: `Armazém de produto acabado ${tenantId}`, tipo: 'ARMAZEM' },
        select: { id: true },
      });
      if (tenantId === TENANT) localPaId = pa.id;
    }
  }, 120_000);

  // ─── a lacuna, tal como está ───────────────────────────────────────────────

  it('ordem EM_PRODUCAO sem aprovação continua a não concluir (QUALIDADE_NAO_APROVADA)', async () => {
    const id = await ordemEmProducao();
    const r = await transitar(id, 'CONCLUIDA');
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('QUALIDADE_NAO_APROVADA');
    expect((await ler(id)).status).toBe('EM_PRODUCAO');
  });

  // ─── escritor: aprovar ─────────────────────────────────────────────────────

  it('aprovar grava qualidadeAprovada, observações, avaliador e instante; não toca no estado nem nas observações gerais', async () => {
    const id = await ordemEmProducao();
    const antes = await ler(id);
    const t0 = Date.now();

    const r = await aprovar(id, 'Acabamento conforme amostra; 5/5 inspeccionadas');
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const o = await ler(id);
    expect(o.qualidadeAprovada).toBe(true);
    expect(o.qualidadeObservacoes).toBe('Acabamento conforme amostra; 5/5 inspeccionadas');
    expect(o.qualidadeAvaliadaPorId).toBe(INSPECTOR);
    expect(o.qualidadeAvaliadaEm).toBeInstanceOf(Date);
    expect((o.qualidadeAvaliadaEm as Date).getTime()).toBeGreaterThanOrEqual(t0 - 5_000);
    expect(o.status).toBe('EM_PRODUCAO');
    expect(o.observacoes).toBe(antes.observacoes);
  });

  it('aprovar sem observações é aceite (observações são opcionais)', async () => {
    const id = await ordemEmProducao();
    const r = await aprovar(id);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const o = await ler(id);
    expect(o.qualidadeAprovada).toBe(true);
    expect(o.qualidadeAvaliadaPorId).toBe(INSPECTOR);
  });

  // ─── estado-com-escritor: o predicado nos dois sentidos ────────────────────

  it('aprovar → concluir: a ordem conclui e dá entrada do produto acabado em PA', async () => {
    const id = await ordemEmProducao();
    const saldoAntes = await saldoPa();

    expect((await aprovar(id, 'OK')).ok).toBe(true);
    const r = await transitar(id, 'CONCLUIDA');
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const o = await ler(id);
    expect(o.status).toBe('CONCLUIDA');
    expect(o.qualidadeAprovada).toBe(true);
    expect(await saldoPa()).toBe(saldoAntes + 5);
  });

  it('aprovar → reprovar (true → false): a conclusão volta a ser recusada e o motivo fica gravado', async () => {
    const id = await ordemEmProducao();
    expect((await aprovar(id, 'Primeira inspecção OK')).ok).toBe(true);
    expect((await ler(id)).qualidadeAprovada).toBe(true);

    const r = await reprovar(id, 'Fissura no encosto detectada na re-inspecção', GESTOR);
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const o = await ler(id);
    expect(o.qualidadeAprovada).toBe(false);
    expect(o.qualidadeObservacoes).toBe('Fissura no encosto detectada na re-inspecção');
    expect(o.qualidadeAvaliadaPorId).toBe(GESTOR);
    expect(o.qualidadeAvaliadaEm).toBeInstanceOf(Date);
    expect(o.status, 'reprovar não muda o estado da ordem').toBe('EM_PRODUCAO');

    const c = await transitar(id, 'CONCLUIDA');
    expect(c.ok).toBe(false);
    expect(c.error?.code).toBe('QUALIDADE_NAO_APROVADA');
    expect((await ler(id)).status).toBe('EM_PRODUCAO');
  });

  it('reprovar → aprovar (false → true): depois do retrabalho a ordem conclui', async () => {
    const id = await ordemEmProducao();
    expect((await reprovar(id, 'Verniz com escorridos')).ok).toBe(true);
    expect((await ler(id)).qualidadeAprovada).toBe(false);
    expect((await ler(id)).qualidadeObservacoes).toBe('Verniz com escorridos');

    expect((await aprovar(id, 'Retrabalho verificado')).ok).toBe(true);
    const o = await ler(id);
    expect(o.qualidadeAprovada).toBe(true);
    expect(o.qualidadeObservacoes).toBe('Retrabalho verificado');

    const c = await transitar(id, 'CONCLUIDA');
    expect(c.ok, JSON.stringify(c)).toBe(true);
    expect((await ler(id)).status).toBe('CONCLUIDA');
  });

  // ─── reprovar exige motivo ─────────────────────────────────────────────────

  it('reprovar sem motivo (ausente, vazio ou só espaços) é recusado e nada muda', async () => {
    const id = await ordemEmProducao();
    expect((await aprovar(id, 'OK')).ok).toBe(true);
    const antes = await ler(id);

    sessao(INSPECTOR, ['producao:ordens:update']);
    const fn = action('reprovarQualidadeOrdemAction');
    for (const input of [{ id }, { id, motivo: '' }, { id, motivo: '   ' }]) {
      const r = await fn(input);
      expect(r.ok, `aceitou ${JSON.stringify(input)}`).toBe(false);
      expect(r.error?.code).not.toBe('ERRO_INTERNO');
    }

    const o = await ler(id);
    expect(o.qualidadeAprovada).toBe(true);
    expect(o.qualidadeObservacoes).toBe(antes.qualidadeObservacoes);
    expect(o.qualidadeAvaliadaPorId).toBe(antes.qualidadeAvaliadaPorId);
  });

  // ─── só no estado em que faz sentido ───────────────────────────────────────

  it.each([
    ['PLANEADA', [] as string[]],
    ['LIBERADA', ['LIBERADA']],
    ['PAUSADA', ['LIBERADA', 'EM_PRODUCAO', 'PAUSADA']],
    ['CANCELADA', ['CANCELADA']],
  ])('em %s aprovar e reprovar são recusados como regra de negócio e nada muda', async (estado, caminho) => {
    const id = await criarOrdem();
    await levarA(id, caminho);
    expect((await ler(id)).status).toBe(estado);

    const ap = await aprovar(id, 'Tentativa fora de estado');
    expect(ap.ok, `aprovou em ${estado}`).toBe(false);
    expect(ap.error?.code, 'estado inválido chegou como «Erro interno»').not.toBe('ERRO_INTERNO');

    const rp = await reprovar(id, 'Tentativa fora de estado');
    expect(rp.ok, `reprovou em ${estado}`).toBe(false);
    expect(rp.error?.code).not.toBe('ERRO_INTERNO');

    const o = await ler(id);
    expect(o.status).toBe(estado);
    expect(o.qualidadeAprovada).toBe(false);
    expect(o.qualidadeObservacoes ?? null).toBeNull();
    expect(o.qualidadeAvaliadaPorId ?? null).toBeNull();
    expect(o.qualidadeAvaliadaEm ?? null).toBeNull();
  });

  it('uma ordem CONCLUIDA não pode ser reprovada (nem re-aprovada) depois de dar entrada em stock', async () => {
    const id = await ordemEmProducao();
    expect((await aprovar(id, 'OK')).ok).toBe(true);
    expect((await transitar(id, 'CONCLUIDA')).ok).toBe(true);
    const antes = await ler(id);

    const rp = await reprovar(id, 'Reclamação do cliente');
    expect(rp.ok).toBe(false);
    expect(rp.error?.code).not.toBe('ERRO_INTERNO');

    const ap = await aprovar(id, 'Outra vez');
    expect(ap.ok).toBe(false);
    expect(ap.error?.code).not.toBe('ERRO_INTERNO');

    const o = await ler(id);
    expect(o.status).toBe('CONCLUIDA');
    expect(o.qualidadeAprovada).toBe(true);
    expect(o.qualidadeObservacoes).toBe(antes.qualidadeObservacoes);
    expect((o.qualidadeAvaliadaEm as Date).getTime()).toBe((antes.qualidadeAvaliadaEm as Date).getTime());
  });

  // ─── fronteiras: permissão, tenant, modo de leitura ────────────────────────

  it('sem producao:ordens:update (só leitura) → SEM_PERMISSAO, nada muda', async () => {
    const id = await ordemEmProducao();
    sessao(INSPECTOR, ['producao:ordens:read', 'producao:ver']);

    const ap = await action('aprovarQualidadeOrdemAction')({ id, observacoes: 'x' });
    expect(ap.ok).toBe(false);
    expect(ap.error?.code).toBe('SEM_PERMISSAO');

    const rp = await action('reprovarQualidadeOrdemAction')({ id, motivo: 'x' });
    expect(rp.ok).toBe(false);
    expect(rp.error?.code).toBe('SEM_PERMISSAO');

    const o = await ler(id);
    expect(o.qualidadeAprovada).toBe(false);
    expect(o.qualidadeAvaliadaPorId ?? null).toBeNull();
  });

  it('ordem de outro tenant → NAO_ENCONTRADO ao aprovar e reprovar; nada muda', async () => {
    const idOutro = await ordemEmProducao(OUTRO_TENANT);

    const ap = await aprovar(idOutro, 'Cross-tenant');
    expect(ap.ok).toBe(false);
    expect(ap.error?.code).toBe('NAO_ENCONTRADO');

    const rp = await reprovar(idOutro, 'Cross-tenant');
    expect(rp.ok).toBe(false);
    expect(rp.error?.code).toBe('NAO_ENCONTRADO');

    const o = await ler(idOutro);
    expect(o.qualidadeAprovada).toBe(false);
    expect(o.qualidadeAvaliadaPorId ?? null).toBeNull();
    expect(o.qualidadeObservacoes ?? null).toBeNull();
  });

  it('tenant em modo de leitura → ACESSO_LEITURA, nada muda', async () => {
    const id = await ordemEmProducao();
    sessao(INSPECTOR, PERMS, TENANT, 'leitura');

    const ap = await action('aprovarQualidadeOrdemAction')({ id });
    expect(ap.ok).toBe(false);
    expect(ap.error?.code).toBe('ACESSO_LEITURA');

    const rp = await action('reprovarQualidadeOrdemAction')({ id, motivo: 'x' });
    expect(rp.ok).toBe(false);
    expect(rp.error?.code).toBe('ACESSO_LEITURA');

    expect((await ler(id)).qualidadeAprovada).toBe(false);
  });
});
