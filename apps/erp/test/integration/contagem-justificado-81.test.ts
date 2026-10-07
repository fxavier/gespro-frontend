/**
 * Oráculo — issue #81: reconciliação de contagem de stock.
 *
 * Dois defeitos em `contagem-stock.service.ts#reconciliar`:
 *   1. um item JUSTIFICADO (contado, com diferença, e depois justificado) continuava a gerar
 *      ajuste de stock — o diálogo da página promete o contrário;
 *   2. a aprovação de discrepância era parâmetro do CLIENTE (`aprovadoPorId` e
 *      `limiarDiscrepanciaPct` no `ReconciliarSchema`): qualquer um se auto-aprovava, ou mandava
 *      `limiarDiscrepanciaPct: 100` e saltava a verificação.
 *
 * Contrato (decisão do orquestrador):
 *   - os itens JUSTIFICADO não são ajustados (sem movimento, saldo intacto, item não AJUSTADO);
 *   - `ReconciliarSchema` perde `aprovadoPorId` e `limiarDiscrepanciaPct`; o limiar é constante
 *     do servidor (5 %), e o que o cliente mandar nesses campos não tem efeito nenhum;
 *   - discrepância acima do limiar só passa com a permissão nova
 *     `inventario:contagens:aprovar-discrepancia`, e aí `aprovadoPorId` = utilizador da sessão;
 *     sem ela → `DISCREPANCIA_SEM_APROVACAO`, com mensagem que fala em aprovação, e nada muda;
 *   - `saldoSistema` 0 com contado ≠ 0 conta como discrepância acima do limiar.
 *
 * Sessão (`@/lib/auth`) é o único duplo (fronteira), mutável por `vi.hoisted`; `next/cache` é
 * dobrado porque o `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero,
 * `bootstrapContabilidade` (série CONTAGEM_STOCK), `createSafeAction`, `abrirContagem`,
 * `registarContagemItem`, `justificar`, `entradaStock`/`baixarStock`. Catálogo, localizações e
 * saldos de partida são escritos pelo client cru (não são documentos numerados).
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó D:contagem-justificado-81; um agente de implementação que o
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

type Resultado = {
  ok: boolean;
  data?: { ajustesGerados: number; itensIgnorados: number; totalEntradas: string; totalSaidas: string };
  error?: { code: string; message: string };
};

const RECONCILIAR = 'inventario:contagens:reconciliar';
const APROVAR = 'inventario:contagens:aprovar-discrepancia';

describe.skipIf(skip)('Reconciliação de contagem (#81) — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let svc: typeof import('@/server/services/inventario/contagem-stock.service');
  // Acesso dinâmico: o contrato da action muda — falha o caso, não o ficheiro.
  let actions: Record<string, (input: unknown) => Promise<Resultado>>;

  const sufixo = Date.now();
  const TENANT = `tenant-ctg-81-${sufixo}`;
  // Ids com forma de cuid: o `ReconciliarSchema` actual valida `aprovadoPorId` com `.cuid()`, e um
  // id mal formado faria o caso falhar por validação em vez de pela auto-aprovação.
  const USER = `cuser81${sufixo}a`;
  const OUTRO_USER = `cuser81${sufixo}b`;
  const ctx = { tenantId: TENANT, userId: USER };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  let categoriaId: string;
  let produtoA: string;
  let produtoB: string;
  let seqLoc = 0;

  function sessao(permissions: string[]) {
    h.sessao = { user: { id: USER, tenantId: TENANT, permissions, acesso: 'aberto' } };
  }

  function reconciliarAction() {
    const fn = actions.reconciliarContagemAction;
    expect(typeof fn, 'reconciliarContagemAction não está exportada de inventario.actions.ts').toBe('function');
    return fn;
  }

  /**
   * Prepara uma contagem numa localização nova com os saldos dados, regista as quantidades
   * contadas e justifica os itens indicados. Devolve ids para as asserções.
   */
  async function prepararContagem(
    linhas: Array<{ produtoId: string; saldo: number; contado: number; justificar?: boolean }>,
  ): Promise<{ contagemId: string; localizacaoId: string; itens: Record<string, string> }> {
    seqLoc++;
    const loc = await db.localizacao.create({
      data: { tenantId: TENANT, codigo: `ARM-CTG-81-${sufixo}-${seqLoc}`, nome: `Armazém ${seqLoc}`, tipo: 'ARMAZEM', ativa: true },
    });
    for (const l of linhas) {
      await db.saldoStock.create({
        data: { tenantId: TENANT, produtoId: l.produtoId, varianteProdutoId: '', localizacaoId: loc.id, saldo: l.saldo, saldoReservado: 0 },
      });
    }

    const { id: contagemId } = await noCtx(() =>
      svc.abrirContagem({ localizacaoId: loc.id, cega: false, responsavelId: USER } as never, ctx),
    );

    const itensDb: any[] = await db.itemContagemStock.findMany({ where: { tenantId: TENANT, contagemId } });
    expect(itensDb).toHaveLength(linhas.length);
    const itens: Record<string, string> = {};
    for (const it of itensDb) itens[it.produtoId] = it.id;

    for (const l of linhas) {
      await noCtx(() =>
        svc.registarContagemItem(
          { contagemId, itemId: itens[l.produtoId], quantidadeContada: String(l.contado) } as never,
          ctx,
        ),
      );
      if (l.justificar) {
        await noCtx(() =>
          svc.justificar(
            { contagemId, itemId: itens[l.produtoId], justificativa: 'Quebra registada em auto de ocorrência' } as never,
            ctx,
          ),
        );
      }
    }
    return { contagemId, localizacaoId: loc.id, itens };
  }

  const saldo = async (produtoId: string, localizacaoId: string) => {
    const s = await db.saldoStock.findFirst({
      where: { tenantId: TENANT, produtoId, localizacaoId, varianteProdutoId: '' },
    });
    return Number(s.saldo);
  };

  const movimentos = (contagemId: string, produtoId?: string) =>
    db.movimentoStock.findMany({
      where: {
        tenantId: TENANT,
        documentoReferenciaId: contagemId,
        documentoReferenciaTipo: 'AjusteInventario',
        ...(produtoId ? { produtoId } : {}),
      },
    });

  const lerContagem = (id: string) => db.contagemStock.findUnique({ where: { id } });
  const lerItem = (id: string) => db.itemContagemStock.findUnique({ where: { id } });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    svc = await import('@/server/services/inventario/contagem-stock.service');
    actions = (await import('@/server/actions/inventario.actions')) as unknown as typeof actions;
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant contagem #81', slug: `ctg-81-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    for (const [id, tag] of [[USER, 'a'], [OUTRO_USER, 'b']] as const) {
      await db.user.create({
        data: { id, tenantId: TENANT, email: `ctg-81-${tag}-${sufixo}@test.mz`, nome: `Utilizador ${tag}`, keycloakSub: `kc-ctg-81-${tag}-${sufixo}` },
      });
    }
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    categoriaId = categoria.id;
    const criarProduto = async (tag: string) =>
      (
        await db.produto.create({
          data: {
            tenantId: TENANT,
            sku: `SKU-CTG-81-${tag}-${sufixo}`,
            nome: `Artigo ${tag}`,
            categoriaId,
            unidadeMedida: 'UN',
            precoVenda: 1000,
            precoCompra: 700,
            margemLucro: 0.3,
            taxaIva: 0.16,
          },
        })
      ).id;
    produtoA = await criarProduto('A');
    produtoB = await criarProduto('B');
  }, 120_000);

  beforeEach(() => {
    sessao([RECONCILIAR]);
  });

  // ─── 1. JUSTIFICADO não é ajustado ──────────────────────────────────────────

  it('item JUSTIFICADO não gera ajuste; o CONTADO ao lado continua a ser ajustado', async () => {
    // A: 100 → 97 (3 %), justificado. B: 100 → 98 (2 %), só contado. Nada acima do limiar.
    const { contagemId, localizacaoId, itens } = await prepararContagem([
      { produtoId: produtoA, saldo: 100, contado: 97, justificar: true },
      { produtoId: produtoB, saldo: 100, contado: 98 },
    ]);
    expect((await lerItem(itens[produtoA])).status).toBe('JUSTIFICADO');

    const r = await reconciliarAction()({ contagemId });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.data!.ajustesGerados).toBe(1);
    expect(Number(r.data!.totalSaidas)).toBe(2);
    expect(Number(r.data!.totalEntradas)).toBe(0);

    // O justificado: saldo intacto, sem movimento, item não AJUSTADO e sem movimento ligado.
    expect(await saldo(produtoA, localizacaoId)).toBe(100);
    expect(await movimentos(contagemId, produtoA)).toHaveLength(0);
    const itemA = await lerItem(itens[produtoA]);
    expect(itemA.status).not.toBe('AJUSTADO');
    expect(itemA.movimentoStockId).toBeNull();

    // O contado: ajustado.
    expect(await saldo(produtoB, localizacaoId)).toBe(98);
    expect(await movimentos(contagemId, produtoB)).toHaveLength(1);
    expect((await lerItem(itens[produtoB])).status).toBe('AJUSTADO');

    expect((await lerContagem(contagemId)).status).toBe('RECONCILIADA');
  });

  it('item JUSTIFICADO com diferença grande também não é ajustado (aprovador presente)', async () => {
    sessao([RECONCILIAR, APROVAR]);
    const { contagemId, localizacaoId, itens } = await prepararContagem([
      { produtoId: produtoA, saldo: 100, contado: 50, justificar: true },
    ]);

    const r = await reconciliarAction()({ contagemId });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.data!.ajustesGerados).toBe(0);
    expect(await saldo(produtoA, localizacaoId)).toBe(100);
    expect(await movimentos(contagemId)).toHaveLength(0);
    expect((await lerItem(itens[produtoA])).movimentoStockId).toBeNull();
  });

  // ─── 2. Discrepância acima do limiar sem a permissão ───────────────────────

  it('sem aprovar-discrepancia: discrepância de 10 % → DISCREPANCIA_SEM_APROVACAO, mensagem clara, nada muda', async () => {
    const { contagemId, localizacaoId, itens } = await prepararContagem([
      { produtoId: produtoA, saldo: 100, contado: 90 },
    ]);

    const r = await reconciliarAction()({ contagemId });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('DISCREPANCIA_SEM_APROVACAO');
    expect(r.error?.message).toMatch(/aprova/i);
    expect(r.error?.message).toMatch(/5\s*%/);

    const c = await lerContagem(contagemId);
    expect(c.status).toBe('EM_CONTAGEM');
    expect(c.aprovadoPorId).toBeNull();
    expect(await saldo(produtoA, localizacaoId)).toBe(100);
    expect(await movimentos(contagemId)).toHaveLength(0);
    expect((await lerItem(itens[produtoA])).status).toBe('CONTADO');
  });

  it('o cliente não se auto-aprova: aprovadoPorId e limiarDiscrepanciaPct no input não têm efeito', async () => {
    const { contagemId, localizacaoId } = await prepararContagem([
      { produtoId: produtoA, saldo: 100, contado: 60 },
    ]);
    const fn = reconciliarAction();

    // Subir o limiar para 100 % (hoje salta a verificação inteira).
    const r1 = await fn({ contagemId, limiarDiscrepanciaPct: 100 });
    expect(r1.ok, JSON.stringify(r1)).toBe(false);
    expect(r1.error?.code).toBe('DISCREPANCIA_SEM_APROVACAO');

    // Declarar-se aprovador (hoje chega para passar).
    const r2 = await fn({ contagemId, aprovadoPorId: USER });
    expect(r2.ok, JSON.stringify(r2)).toBe(false);
    expect(r2.error?.code).toBe('DISCREPANCIA_SEM_APROVACAO');

    // Nomear outro aprovador.
    const r3 = await fn({ contagemId, aprovadoPorId: OUTRO_USER, limiarDiscrepanciaPct: 100 });
    expect(r3.ok, JSON.stringify(r3)).toBe(false);
    expect(r3.error?.code).toBe('DISCREPANCIA_SEM_APROVACAO');

    const c = await lerContagem(contagemId);
    expect(c.status).toBe('EM_CONTAGEM');
    expect(c.aprovadoPorId).toBeNull();
    expect(await saldo(produtoA, localizacaoId)).toBe(100);
    expect(await movimentos(contagemId)).toHaveLength(0);
  });

  it('o limiar não baixa por pedido do cliente: 3 % com limiarDiscrepanciaPct 0 continua a passar', async () => {
    const { contagemId, localizacaoId } = await prepararContagem([
      { produtoId: produtoA, saldo: 100, contado: 103 },
    ]);
    const r = await reconciliarAction()({ contagemId, limiarDiscrepanciaPct: 0 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await saldo(produtoA, localizacaoId)).toBe(103);
  });

  it('exactamente 5 % não está acima do limiar: passa sem a permissão de aprovação', async () => {
    const { contagemId, localizacaoId } = await prepararContagem([
      { produtoId: produtoA, saldo: 100, contado: 95 },
    ]);
    const r = await reconciliarAction()({ contagemId });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.data!.ajustesGerados).toBe(1);
    expect(await saldo(produtoA, localizacaoId)).toBe(95);
  });

  // ─── 3. Com a permissão: aprova, e o aprovador é a sessão ──────────────────

  it('com aprovar-discrepancia: 10 % reconcilia, ajusta e grava aprovadoPorId = utilizador da sessão', async () => {
    sessao([RECONCILIAR, APROVAR]);
    const { contagemId, localizacaoId, itens } = await prepararContagem([
      { produtoId: produtoA, saldo: 100, contado: 90 },
    ]);

    const r = await reconciliarAction()({ contagemId });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.data!.ajustesGerados).toBe(1);

    const c = await lerContagem(contagemId);
    expect(c.status).toBe('RECONCILIADA');
    expect(c.aprovadoPorId).toBe(USER);
    expect(await saldo(produtoA, localizacaoId)).toBe(90);
    expect((await lerItem(itens[produtoA])).status).toBe('AJUSTADO');
  });

  it('com aprovar-discrepancia: um aprovadoPorId vindo do cliente é ignorado — fica o da sessão', async () => {
    sessao([RECONCILIAR, APROVAR]);
    const { contagemId } = await prepararContagem([
      { produtoId: produtoA, saldo: 100, contado: 130 },
    ]);

    const r = await reconciliarAction()({ contagemId, aprovadoPorId: OUTRO_USER });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect((await lerContagem(contagemId)).aprovadoPorId).toBe(USER);
  });

  // ─── 4. saldoSistema 0 ──────────────────────────────────────────────────────

  it('saldoSistema 0 e contado 3, sem a permissão → DISCREPANCIA_SEM_APROVACAO, nada muda', async () => {
    const { contagemId, localizacaoId } = await prepararContagem([
      { produtoId: produtoA, saldo: 0, contado: 3 },
    ]);

    const r = await reconciliarAction()({ contagemId });
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(r.error?.code).toBe('DISCREPANCIA_SEM_APROVACAO');
    expect(r.error?.message).toMatch(/aprova/i);

    expect((await lerContagem(contagemId)).status).toBe('EM_CONTAGEM');
    expect(await saldo(produtoA, localizacaoId)).toBe(0);
    expect(await movimentos(contagemId)).toHaveLength(0);
  });

  it('saldoSistema 0 e contado 3, com a permissão → entrada de 3 e aprovadoPorId = sessão', async () => {
    sessao([RECONCILIAR, APROVAR]);
    const { contagemId, localizacaoId } = await prepararContagem([
      { produtoId: produtoA, saldo: 0, contado: 3 },
    ]);

    const r = await reconciliarAction()({ contagemId });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(Number(r.data!.totalEntradas)).toBe(3);
    expect(await saldo(produtoA, localizacaoId)).toBe(3);
    expect((await lerContagem(contagemId)).aprovadoPorId).toBe(USER);
  });

  // ─── 5. A permissão de reconciliar continua a ser exigida ──────────────────

  it('só aprovar-discrepancia, sem reconciliar → SEM_PERMISSAO', async () => {
    sessao([APROVAR]);
    const { contagemId } = await prepararContagem([
      { produtoId: produtoA, saldo: 100, contado: 100 },
    ]);
    const r = await reconciliarAction()({ contagemId });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('SEM_PERMISSAO');
    expect((await lerContagem(contagemId)).status).toBe('EM_CONTAGEM');
  });
});
