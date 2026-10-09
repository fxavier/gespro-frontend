/**
 * Oráculo — issue #104: os indicadores dos dashboards contam sobre listas cortadas
 * (`take: 1`/`take: 100`) em vez de `count`.
 *
 * Defeito (lido no código em `2990eb8`): as páginas de inventário, contagens, `/stock/dashboard`,
 * `/rh/colaboradores`, `/core-tenancy` e `/contabilidade` pedem uma página de 1 ou de 100 registos
 * e mostram `items.length` (ou «25+», ou «1+») — um tenant com 30 activos vê «1», um com 3
 * contagens abertas vê «1+», e os lançamentos em rascunho mais antigos que os 100 mais recentes
 * desaparecem do cartão «Lançamentos Pendentes».
 *
 * Contrato (decisão do orquestrador): cada KPI passa a vir de um `count` no serviço, com o tenant
 * EXPLÍCITO no `where` e com o mesmo significado da listagem que substituía (mesmos filtros por
 * omissão: soft-delete excluído onde a listagem o exclui; nada mais). Nomes fixados aqui:
 *
 *   ativosService.contarAtivos({ estado? }, ctx)                   → number
 *   contagemStockService.contar({ status? }, ctx)                  → number
 *   catalogoProdutoService.contarProdutos({}, ctx)                 → number
 *   stockService.contarMovimentos({}, ctx)                         → number
 *   ColaboradorService.contar({ status? }, ctx)                    → number
 *   userAdminService.contarUtilizadores({}, ctx)                   → number
 *   contabilidade.service: contarLancamentos({ status? }, ctx)     → number
 *                          contarContas({}, ctx)                   → number
 *
 * As páginas que os usam provam-se no oráculo estático
 * `src/app/(dashboard)/__tests__/kpis-count-104.test.ts`.
 *
 * Tudo é real: Postgres efémero, `bootstrapContabilidade`, `registarLancamentoContabilistico` e
 * `criarLancamento` (os lançamentos nunca se escrevem pelo Prisma), `abrirContagem` (o número da
 * contagem sai da série). Catálogo, activos, colaboradores, utilizadores e movimentos de stock
 * são escritos pelo client cru — não são documentos numerados.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó A:kpis-count-104; um agente de implementação que o altere é
 * BLOCKER.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

type Contar = (filtro: Record<string, unknown>, ctx: { tenantId: string; userId: string }) => Promise<number>;

describe.skipIf(skip)('KPIs por count (#104) — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  // Acesso dinâmico: as funções ainda não existem — falha o caso, não o ficheiro.
  let ativos: Record<string, unknown>;
  let contagens: Record<string, unknown>;
  let catalogo: Record<string, unknown>;
  let stock: Record<string, unknown>;
  let colaboradores: Record<string, unknown>;
  let utilizadores: Record<string, unknown>;
  let contab: any;
  let val: any;

  const sufixo = Date.now();
  const TENANT = `tenant-kpi-104-${sufixo}`;
  const TENANT_B = `tenant-kpi-104-b-${sufixo}`;
  const USER = `ukpi104${sufixo}a`;
  const USER_B = `ukpi104${sufixo}b`;
  const ctx = { tenantId: TENANT, userId: USER };
  const ctxB = { tenantId: TENANT_B, userId: USER_B };

  /** Corre `fn` no contexto do tenant do `c` (como a página faz). */
  const em = <T>(c: typeof ctx, fn: () => Promise<T>) => runCtx(c, fn);

  function funcao(obj: Record<string, unknown>, nome: string, onde: string): Contar {
    const f = obj[nome];
    expect(typeof f, `${onde}.${nome} não existe — o KPI tem de vir de um count no serviço`).toBe('function');
    return (f as Contar).bind(obj);
  }

  async function contar(obj: Record<string, unknown>, nome: string, onde: string, filtro: Record<string, unknown>, c = ctx) {
    const f = funcao(obj, nome, onde);
    const n = await em(c, () => f(filtro, c));
    expect(typeof n, `${onde}.${nome} devolve um número (não uma página)`).toBe('number');
    return n;
  }

  // ── fixtures ───────────────────────────────────────────────────────────────

  let seq = 0;
  const criarColaborador = (tenantId: string, status: string, deletedAt: Date | null = null) => {
    seq += 1;
    return db.colaborador.create({
      data: {
        tenantId,
        codigo: `COL-104-${seq}-${sufixo}`,
        nome: `Colaborador ${seq}`,
        dataNascimento: new Date('1990-05-05T00:00:00Z'),
        genero: 'FEMININO',
        estadoCivil: 'SOLTEIRO',
        nacionalidade: 'Moçambicana',
        naturalidadeProvincia: 'Maputo',
        naturalidadeDistrito: 'KaMpfumo',
        bi: `104${String(seq).padStart(9, '0')}A`,
        nuit: `7${String(seq).padStart(8, '0')}`,
        email: `colab-104-${seq}-${sufixo}@test.mz`,
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
        status,
        tipoContrato: 'EFECTIVO',
        regimeTrabalho: 'TEMPO_INTEGRAL',
        salarioBase: '30000.00',
        nivelAcesso: 'SUPERVISOR',
        deletedAt,
      },
      select: { id: true },
    });
  };

  async function catalogoDe(tenantId: string, tag: string) {
    const categoriaProduto = await db.categoriaProduto.create({ data: { tenantId, nome: `Mercadorias ${tag}` } });
    const categoriaAtivo = await db.categoriaAtivo.create({
      data: { tenantId, codigo: `CAT-104-${tag}-${sufixo}`, nome: `Equipamento ${tag}`, vidaUtilAnos: 4 },
    });
    const loc = await db.localizacao.create({
      data: { tenantId, codigo: `LOC-104-${tag}-${sufixo}`, nome: `Armazém ${tag}`, tipo: 'ARMAZEM', ativa: true },
    });
    return { categoriaProdutoId: categoriaProduto.id, categoriaAtivoId: categoriaAtivo.id, localizacaoId: loc.id };
  }

  let nProd = 0;
  const criarProduto = (tenantId: string, categoriaId: string, deletedAt: Date | null = null) => {
    nProd += 1;
    return db.produto.create({
      data: {
        tenantId,
        sku: `SKU-104-${nProd}-${sufixo}`,
        nome: `Artigo ${nProd}`,
        categoriaId,
        unidadeMedida: 'UN',
        precoVenda: 1000,
        precoCompra: 700,
        margemLucro: 0.3,
        taxaIva: 0.16,
        deletedAt,
      },
      select: { id: true },
    });
  };

  let nAtivo = 0;
  const criarAtivo = (tenantId: string, userId: string, categoriaId: string, localizacaoId: string, estado: string, deletedAt: Date | null = null) => {
    nAtivo += 1;
    return db.ativo.create({
      data: {
        tenantId,
        codigoInterno: `AT-104-${nAtivo}-${sufixo}`,
        nome: `Activo ${nAtivo}`,
        categoriaId,
        localizacaoId,
        dataAquisicao: new Date('2025-01-10T10:00:00Z'),
        valorCompra: 50000,
        vidaUtilAnos: 4,
        estado,
        criadoPor: userId,
        deletedAt,
      },
    });
  };

  const criarMovimento = (tenantId: string, userId: string, produtoId: string, localizacaoId: string) =>
    db.movimentoStock.create({
      data: { tenantId, produtoId, tipo: 'ENTRADA', quantidade: 1, localizacaoDestinoId: localizacaoId, criadoPor: userId },
    });

  let nUser = 0;
  const criarUtilizador = (tenantId: string, extra: { ativo?: boolean; deletedAt?: Date | null } = {}) => {
    nUser += 1;
    return db.user.create({
      data: {
        tenantId,
        email: `u-104-${nUser}-${sufixo}@test.mz`,
        nome: `Utilizador ${nUser}`,
        keycloakSub: `kc-104-${nUser}-${sufixo}`,
        ...extra,
      },
    });
  };

  let doc = 0;
  const lancar = (c: typeof ctx, data: string) =>
    em(c, () =>
      db.$transaction((tx: any) =>
        contab.registarLancamentoContabilistico(
          tx,
          {
            data: new Date(data),
            diarioTipo: 'OPERACOES',
            origem: 'AJUSTE',
            documentoOrigemId: `doc-kpi-104-${++doc}`,
            documentoOrigemTipo: 'TesteKpi104',
            historico: `KPI #104 ${doc}`,
            partidas: [
              { contaCodigo: '111', tipo: 'DEBITO', valor: '10' },
              { contaCodigo: '711', tipo: 'CREDITO', valor: '10' },
            ],
          },
          c,
        ),
      ),
    );

  // ── números esperados (fixados à mão) ──────────────────────────────────────
  const ATIVOS = { EM_USO: 27, EM_MANUTENCAO: 3, NOVO: 1 }; // + 1 EM_USO apagado
  const PRODUTOS = 28; // + 1 apagado
  const MOVIMENTOS = 30;
  const CONTAGENS = { EM_CONTAGEM: 3, CONCLUIDA: 2 };
  const COLAB = { ACTIVO: 27, INACTIVO: 2, PERIODO_EXPERIMENTAL: 1, FERIAS: 1 }; // + 1 ACTIVO apagado
  const UTILIZADORES = 29; // USER + 26 activos + 2 inactivos; + 1 apagado
  const LANCADOS = 102;
  const RASCUNHOS = 3;

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ativos = (await import('@/server/services/inventario/ativos.service')).ativosService as unknown as Record<string, unknown>;
    contagens = (await import('@/server/services/inventario/contagem-stock.service')).contagemStockService as unknown as Record<string, unknown>;
    catalogo = (await import('@/server/services/inventario/catalogo.service')).catalogoProdutoService as unknown as Record<string, unknown>;
    stock = (await import('@/server/services/inventario/stock.service')).stockService as unknown as Record<string, unknown>;
    colaboradores = (await import('@/server/services/pessoas-projetos/rh.service')).ColaboradorService as unknown as Record<string, unknown>;
    utilizadores = (await import('@/server/services/plataforma/user-admin.service')).userAdminService as unknown as Record<string, unknown>;
    contab = await import('@/server/services/financas/contabilidade.service');
    val = await import('@/lib/validations/contabilidade');
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');
    const svcContagem = await import('@/server/services/inventario/contagem-stock.service');

    for (const [t, u, slug, nuit] of [
      [TENANT, USER, `kpi-104-${sufixo}`, `${sufixo}`.slice(-8) + '1'],
      [TENANT_B, USER_B, `kpi-104-b-${sufixo}`, `${sufixo}`.slice(-8) + '2'],
    ] as const) {
      await db.tenant.create({ data: { id: t, nome: `Tenant ${slug}`, slug, nuit } });
      await db.user.create({ data: { id: u, tenantId: t, email: `${slug}@test.mz`, nome: 'Admin', keycloakSub: `kc-${slug}` } });
      await db.$transaction((tx: any) => bootstrapContabilidade(tx, t), { timeout: 60_000 });
    }

    // Inventário: activos, produtos, movimentos
    const a = await catalogoDe(TENANT, 'A');
    const b = await catalogoDe(TENANT_B, 'B');
    for (const [estado, n] of Object.entries(ATIVOS)) {
      for (let i = 0; i < n; i++) await criarAtivo(TENANT, USER, a.categoriaAtivoId, a.localizacaoId, estado);
    }
    await criarAtivo(TENANT, USER, a.categoriaAtivoId, a.localizacaoId, 'EM_USO', new Date());
    for (let i = 0; i < 5; i++) await criarAtivo(TENANT_B, USER_B, b.categoriaAtivoId, b.localizacaoId, 'EM_USO');

    let produtoA = '';
    for (let i = 0; i < PRODUTOS; i++) produtoA = (await criarProduto(TENANT, a.categoriaProdutoId)).id;
    await criarProduto(TENANT, a.categoriaProdutoId, new Date());
    const produtoB = (await criarProduto(TENANT_B, b.categoriaProdutoId)).id;
    for (let i = 0; i < 4; i++) await criarProduto(TENANT_B, b.categoriaProdutoId);

    for (let i = 0; i < MOVIMENTOS; i++) await criarMovimento(TENANT, USER, produtoA, a.localizacaoId);
    for (let i = 0; i < 6; i++) await criarMovimento(TENANT_B, USER_B, produtoB, b.localizacaoId);

    // Contagens: abertas pelo serviço (o número sai da série); duas passam a CONCLUIDA.
    const abertas: string[] = [];
    for (let i = 0; i < CONTAGENS.EM_CONTAGEM + CONTAGENS.CONCLUIDA; i++) {
      const loc = await db.localizacao.create({
        data: { tenantId: TENANT, codigo: `LOC-104-CTG-${i}-${sufixo}`, nome: `Sala ${i}`, tipo: 'ARMAZEM', ativa: true },
      });
      const { id } = await em(ctx, () =>
        svcContagem.abrirContagem({ localizacaoId: loc.id, cega: false, responsavelId: USER } as never, ctx),
      );
      abertas.push(id);
    }
    await db.contagemStock.updateMany({
      where: { tenantId: TENANT, id: { in: abertas.slice(0, CONTAGENS.CONCLUIDA) } },
      data: { status: 'CONCLUIDA' },
    });
    for (let i = 0; i < 2; i++) {
      const loc = await db.localizacao.create({
        data: { tenantId: TENANT_B, codigo: `LOC-104-CTG-B-${i}-${sufixo}`, nome: `Sala B ${i}`, tipo: 'ARMAZEM', ativa: true },
      });
      await em(ctxB, () =>
        svcContagem.abrirContagem({ localizacaoId: loc.id, cega: false, responsavelId: USER_B } as never, ctxB),
      );
    }

    // RH
    for (const [status, n] of Object.entries(COLAB)) {
      for (let i = 0; i < n; i++) await criarColaborador(TENANT, status);
    }
    await criarColaborador(TENANT, 'ACTIVO', new Date());
    for (let i = 0; i < 4; i++) await criarColaborador(TENANT_B, 'ACTIVO');

    // Utilizadores (o USER já existe e conta)
    for (let i = 0; i < UTILIZADORES - 3; i++) await criarUtilizador(TENANT);
    await criarUtilizador(TENANT, { ativo: false });
    await criarUtilizador(TENANT, { ativo: false });
    await criarUtilizador(TENANT, { deletedAt: new Date() });
    for (let i = 0; i < 3; i++) await criarUtilizador(TENANT_B);

    // Contabilidade: 102 lançados (Junho) e 3 rascunhos MAIS ANTIGOS (Janeiro) — fora dos 100
    // mais recentes que a página antiga lia.
    for (let i = 0; i < LANCADOS; i++) await lancar(ctx, '2025-06-15T10:00:00Z');
    for (let i = 0; i < 4; i++) await lancar(ctxB, '2025-06-15T10:00:00Z');
    const diario = await db.diario.findFirst({ where: { tenantId: TENANT, tipo: 'OPERACOES' } });
    const [c111, c711] = await Promise.all(
      ['111', '711'].map((codigo) => db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo } })),
    );
    for (let i = 0; i < RASCUNHOS; i++) {
      await em(ctx, () =>
        contab.criarLancamento(
          val.CriarLancamentoSchema.parse({
            data: '2025-01-10T10:00:00Z',
            diarioId: diario.id,
            historico: `Rascunho antigo ${i}`,
            partidas: [
              { contaId: c111.id, tipo: 'DEBITO', valor: 5 },
              { contaId: c711.id, tipo: 'CREDITO', valor: 5 },
            ],
          }),
          ctx,
        ),
      );
    }
  }, 300_000);

  // ── pré-condições: os dados mostram o defeito ──────────────────────────────

  it('pré-condição: a página antiga (take 1 / take 100) não consegue mostrar estes números', async () => {
    const recentes: any = await em(ctx, () => contab.listarLancamentos({ take: 100 }, ctx));
    expect(recentes.items.filter((l: any) => l.status === 'RASCUNHO')).toHaveLength(0);
    expect(await db.contaPGC.count({ where: { tenantId: TENANT } })).toBeGreaterThan(100);
  });

  // ── inventário ─────────────────────────────────────────────────────────────

  it('contarAtivos: total sem apagados e por estado, só do tenant', async () => {
    const total = ATIVOS.EM_USO + ATIVOS.EM_MANUTENCAO + ATIVOS.NOVO;
    expect(await contar(ativos, 'contarAtivos', 'ativosService', {})).toBe(total);
    expect(await contar(ativos, 'contarAtivos', 'ativosService', { estado: 'EM_USO' })).toBe(ATIVOS.EM_USO);
    expect(await contar(ativos, 'contarAtivos', 'ativosService', { estado: 'EM_MANUTENCAO' })).toBe(ATIVOS.EM_MANUTENCAO);
    expect(await contar(ativos, 'contarAtivos', 'ativosService', { estado: 'BAIXADO' })).toBe(0);
    expect(await contar(ativos, 'contarAtivos', 'ativosService', {}, ctxB)).toBe(5);
  });

  it('contagemStockService.contar: por estado, sem «1+», só do tenant', async () => {
    expect(await contar(contagens, 'contar', 'contagemStockService', { status: 'EM_CONTAGEM' })).toBe(CONTAGENS.EM_CONTAGEM);
    expect(await contar(contagens, 'contar', 'contagemStockService', { status: 'CONCLUIDA' })).toBe(CONTAGENS.CONCLUIDA);
    expect(await contar(contagens, 'contar', 'contagemStockService', { status: 'RECONCILIADA' })).toBe(0);
    expect(await contar(contagens, 'contar', 'contagemStockService', { status: 'EM_CONTAGEM' }, ctxB)).toBe(2);
  });

  // ── stock ──────────────────────────────────────────────────────────────────

  it('contarProdutos: catálogo sem apagados, só do tenant', async () => {
    expect(await contar(catalogo, 'contarProdutos', 'catalogoProdutoService', {})).toBe(PRODUTOS);
    expect(await contar(catalogo, 'contarProdutos', 'catalogoProdutoService', {}, ctxB)).toBe(5);
  });

  it('contarMovimentos: todos os movimentos do tenant', async () => {
    expect(await contar(stock, 'contarMovimentos', 'stockService', {})).toBe(MOVIMENTOS);
    expect(await contar(stock, 'contarMovimentos', 'stockService', {}, ctxB)).toBe(6);
  });

  // ── RH ─────────────────────────────────────────────────────────────────────

  it('ColaboradorService.contar: por estado e total, sem apagados, só do tenant', async () => {
    for (const [status, n] of Object.entries(COLAB)) {
      expect(await contar(colaboradores, 'contar', 'ColaboradorService', { status }), status).toBe(n);
    }
    expect(await contar(colaboradores, 'contar', 'ColaboradorService', { status: 'AFASTADO' })).toBe(0);
    const total = Object.values(COLAB).reduce((s, n) => s + n, 0);
    expect(await contar(colaboradores, 'contar', 'ColaboradorService', {})).toBe(total);
    expect(await contar(colaboradores, 'contar', 'ColaboradorService', {}, ctxB)).toBe(4);
  });

  // ── plataforma ─────────────────────────────────────────────────────────────

  it('contarUtilizadores: todos os não apagados (activos e inactivos), só do tenant', async () => {
    expect(await contar(utilizadores, 'contarUtilizadores', 'userAdminService', {})).toBe(UTILIZADORES);
    expect(await contar(utilizadores, 'contarUtilizadores', 'userAdminService', {}, ctxB)).toBe(4);
  });

  // ── contabilidade ──────────────────────────────────────────────────────────

  it('contarLancamentos: rascunhos e lançados de todo o tenant, não dos 100 mais recentes', async () => {
    expect(await contar(contab, 'contarLancamentos', 'contabilidade.service', { status: 'RASCUNHO' })).toBe(RASCUNHOS);
    expect(await contar(contab, 'contarLancamentos', 'contabilidade.service', { status: 'LANCADO' })).toBe(LANCADOS);
    expect(await contar(contab, 'contarLancamentos', 'contabilidade.service', { status: 'LANCADO' }, ctxB)).toBe(4);
    expect(await contar(contab, 'contarLancamentos', 'contabilidade.service', { status: 'RASCUNHO' }, ctxB)).toBe(0);
  });

  it('contarContas: o plano inteiro do tenant (> 100), não o dos dois tenants', async () => {
    const esperado = await db.contaPGC.count({ where: { tenantId: TENANT } });
    expect(esperado).toBeGreaterThan(100);
    expect(await contar(contab, 'contarContas', 'contabilidade.service', {})).toBe(esperado);
    const esperadoB = await db.contaPGC.count({ where: { tenantId: TENANT_B } });
    expect(await contar(contab, 'contarContas', 'contabilidade.service', {}, ctxB)).toBe(esperadoB);
  });
});
