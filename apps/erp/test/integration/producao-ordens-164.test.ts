/**
 * Oráculo — issue #164: [produção] ordens sem transições, consumo de material nem entrada de
 * produto acabado.
 *
 * Contrato (decisão do orquestrador; as escolhas em aberto foram fechadas pelo verificador do lado
 * conservador e são contrato):
 *
 *   - Transições: a UI do detalhe liga a action EXISTENTE `transitarStatusOrdemProducaoAction`
 *     ({ id, novoStatus }, permissão EXISTENTE `producao:ordens:update`, mapa
 *     `TRANSICOES_ORDEM_PRODUCAO`). Este oráculo tranca o comportamento de servidor de que a UI
 *     depende, tudo numa transacção:
 *       · liberar (PLANEADA → LIBERADA) reserva no armazém `MP` (contrato A `reservarStock`) cada
 *         material da BOM activa × quantidade e grava um `ConsumoProducao` com o `reservaId`;
 *         sem stock disponível → `STOCK_INSUFICIENTE` e NADA fica (nem reserva, nem consumo,
 *         nem mudança de estado);
 *       · iniciar (LIBERADA → EM_PRODUCAO) grava `dataInicioReal`;
 *       · concluir (EM_PRODUCAO → CONCLUIDA) exige `qualidadeAprovada` (#166), confirma cada
 *         reserva (contrato A `confirmarConsumoStock`: reserva CONSUMIDA, saldo e reservado descem,
 *         `ConsumoProducao.movimentoStockId` gravado) e dá ENTRADA do produto acabado no armazém
 *         `PA` (contrato A `entradaStock`) pela quantidade da ordem; sem `PA` configurado →
 *         `LOCALIZACAO_NAO_CONFIGURADA` e NADA fica (reservas continuam ATIVA, saldos intactos);
 *       · cancelar liberta as reservas activas (contrato A `libertarStock`);
 *       · transição fora do mapa → `TRANSICAO_INVALIDA` (nunca `ERRO_INTERNO`) e nada muda.
 *     Entrada de produto acabado: decisão conservadora — só na conclusão, pela quantidade da ordem
 *     (não há entrada parcial nem segunda entrada; uma ordem CONCLUIDA não aceita mais nada).
 *
 *   - Consumo de material ad-hoc [RED]: a action EXISTENTE `registarConsumoOrdemAction`
 *     (schema `RegistarConsumoSchema` actual, permissão `producao:ordens:update`), que a rota
 *     própria de registo de consumo chama, passa a BAIXAR o stock do armazém `MP` pelo contrato A
 *     (`baixarStock`) na MESMA transacção em que grava o `ConsumoProducao`, e grava o
 *     `movimentoStockId` da saída. Hoje grava o consumo e não mexe em stock nenhum.
 *       · sem stock suficiente → `STOCK_INSUFICIENTE` e não fica consumo nenhum;
 *       · sem armazém `MP` → `LOCALIZACAO_NAO_CONFIGURADA` e não fica consumo nenhum;
 *       · só em EM_PRODUCAO (e LIBERADA, como hoje — não é afirmado aqui); PLANEADA, PAUSADA,
 *         CONCLUIDA e CANCELADA recusam como regra de negócio e não mexem em stock;
 *       · um consumo ad-hoc (sem reserva) NÃO volta a ser baixado na conclusão — a conclusão só
 *         confirma os consumos com `reservaId`;
 *       · sem permissão → `SEM_PERMISSAO`; ordem de outro tenant → `NAO_ENCONTRADO`; modo de
 *         leitura → `ACESSO_LEITURA`; nada muda em nenhum dos casos.
 *     Custo unitário: não é afirmado (o servidor pode derivá-lo do produto); a quantidade e o stock
 *     são.
 *
 * Sessão (`@/lib/auth`) é o único duplo (fronteira), mutável por `vi.hoisted`; `next/cache` é
 * dobrado porque o `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero,
 * `bootstrapContabilidade` (série ORDEM_PRODUCAO), `createSafeAction`, `OrdemProducaoService` e o
 * contrato de stock real. O stock inicial entra pelo `entradaStock` real.
 *
 * ESTADO ESPERADO antes da implementação: RED só nos casos marcados «[RED]» (consumo ad-hoc que
 * baixa stock). Os restantes trancam o contrato que a UI passa a ligar e devem já estar verdes —
 * se ficarem vermelhos, a implementação partiu o servidor.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó A:producao-ordens-164; um agente de implementação que o altere é
 * BLOCKER.
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

describe.skipIf(skip)('Produção: ciclo de vida da ordem, consumo e entrada de produto acabado (#164) — DB efémera', () => {
  let db: any;
  let actions: Record<string, (input: unknown) => Promise<Resultado>>;
  let entradaStock: (tx: any, data: any, ctx: any) => Promise<unknown>;

  const sufixo = Date.now();
  const TENANT = `tenant-po-164-${sufixo}`;
  const OUTRO_TENANT = `tenant-po-164-outro-${sufixo}`; // sem armazéns MP nem PA
  const GESTOR = `user-po-164-gestor-${sufixo}`;
  const OUTRO = `user-po-164-outro-${sufixo}`;

  const PERMS = ['producao:ordens:create', 'producao:ordens:update', 'producao:ordens:read'];

  const loc: Record<string, { mp?: string; pa?: string }> = {};
  const categoria: Record<string, string> = {};
  let seq = 0;

  type Produto = { id: string; sku: string; nome: string };

  function sessao(userId = GESTOR, permissions = PERMS, tenantId = TENANT, acesso: 'aberto' | 'leitura' = 'aberto') {
    h.sessao = { user: { id: userId, tenantId, permissions, acesso } };
  }

  function action(nome: string) {
    const fn = actions[nome];
    expect(typeof fn, `${nome} não está exportada de producao.actions.ts`).toBe('function');
    return fn;
  }

  const lerOrdem = (id: string) => db.ordemProducao.findUnique({ where: { id } });

  async function produto(tenantId: string, nome: string): Promise<Produto> {
    seq += 1;
    return db.produto.create({
      data: {
        tenantId,
        sku: `PO164-${seq}-${sufixo}`,
        nome: `${nome} ${seq}`,
        categoriaId: categoria[tenantId],
        unidadeMedida: 'UN',
        precoVenda: '100.00',
        precoCompra: '40.00',
        margemLucro: '0.60',
        stockMinimo: '0',
      },
      select: { id: true, sku: true, nome: true },
    });
  }

  async function darEntrada(tenantId: string, produtoId: string, localizacaoId: string, quantidade: number) {
    await db.$transaction((tx: any) =>
      entradaStock(
        tx,
        { produtoId, localizacaoDestinoId: localizacaoId, quantidade, documentoReferenciaTipo: 'SetupOraculo164' },
        { tenantId, userId: tenantId === TENANT ? GESTOR : OUTRO },
      ),
    );
  }

  async function saldo(produtoId: string, localizacaoId: string, tenantId = TENANT): Promise<{ saldo: number; reservado: number }> {
    const s = await db.saldoStock.findMany({
      where: { tenantId, produtoId, localizacaoId },
      select: { saldo: true, saldoReservado: true },
    });
    return {
      saldo: s.reduce((a: number, x: any) => a + Number(x.saldo), 0),
      reservado: s.reduce((a: number, x: any) => a + Number(x.saldoReservado), 0),
    };
  }

  /** BOM activa de um nível: `qtdPorUnidade` de `material` por unidade de `acabado`. */
  async function bomActiva(tenantId: string, acabado: Produto, material: Produto, qtdPorUnidade: number) {
    seq += 1;
    await db.estruturaProduto.create({
      data: {
        tenantId,
        produtoId: acabado.id,
        codigo: `BOM-PO164-${seq}-${sufixo}`,
        nome: `BOM ${acabado.nome}`,
        versao: '1',
        status: 'ATIVO',
        unidadeProducao: 'UN',
        componentes: {
          create: [
            {
              tenantId,
              componenteProdutoId: material.id,
              codigoComponente: material.sku,
              nomeComponente: material.nome,
              categoria: 'MATERIA_PRIMA',
              quantidade: String(qtdPorUnidade),
              unidadeMedida: 'UN',
              custoUnitario: '40.00',
            },
          ],
        },
      },
    });
  }

  async function criarOrdem(acabado: Produto, quantidade = 5, tenantId = TENANT): Promise<string> {
    sessao(tenantId === TENANT ? GESTOR : OUTRO, PERMS, tenantId);
    const r = await action('criarOrdemProducaoAction')({
      produtoId: acabado.id,
      codigoProduto: acabado.sku,
      nomeProduto: acabado.nome,
      quantidade,
      unidadeMedida: 'UN',
      prioridade: 'MEDIA',
      dataPrevisaoInicio: new Date(Date.UTC(2026, 9, 1, 10)),
      dataPrevisaoFim: new Date(Date.UTC(2026, 9, 10, 10)),
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    return (r.data as { id: string }).id;
  }

  async function transitar(id: string, novoStatus: string, tenantId = TENANT): Promise<Resultado> {
    sessao(tenantId === TENANT ? GESTOR : OUTRO, PERMS, tenantId);
    return action('transitarStatusOrdemProducaoAction')({ id, novoStatus });
  }

  async function levarA(id: string, caminho: string[], tenantId = TENANT): Promise<void> {
    for (const s of caminho) {
      const r = await transitar(id, s, tenantId);
      expect(r.ok, `transição para ${s}: ${JSON.stringify(r)}`).toBe(true);
    }
  }

  async function aprovar(id: string, tenantId = TENANT): Promise<void> {
    sessao(tenantId === TENANT ? GESTOR : OUTRO, PERMS, tenantId);
    const r = await action('aprovarQualidadeOrdemAction')({ id });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  }

  function consumo(ordemId: string, material: Produto, quantidade: number) {
    return action('registarConsumoOrdemAction')({
      ordemProducaoId: ordemId,
      produtoId: material.id,
      codigoProduto: material.sku,
      nomeProduto: material.nome,
      quantidadePrevista: quantidade,
      quantidadeReal: quantidade,
      unidadeMedida: 'UN',
      custoUnitario: 40,
    });
  }

  const consumosDe = (ordemId: string, produtoId?: string) =>
    db.consumoProducao.findMany({
      where: { ordemProducaoId: ordemId, ...(produtoId ? { produtoId } : {}) },
      orderBy: { createdAt: 'asc' },
    });

  const saidasDe = (ordemId: string, produtoId: string) =>
    db.movimentoStock.findMany({
      where: { documentoReferenciaId: ordemId, produtoId, tipo: 'SAIDA' },
    });

  /** Cenário: acabado com BOM (2 × madeira por unidade), madeira com `stockMadeira` em MP. */
  async function cenarioComBom(stockMadeira = 100) {
    const acabado = await produto(TENANT, 'Cadeira');
    const madeira = await produto(TENANT, 'Madeira de pinho');
    await bomActiva(TENANT, acabado, madeira, 2);
    if (stockMadeira > 0) await darEntrada(TENANT, madeira.id, loc[TENANT].mp!, stockMadeira);
    return { acabado, madeira };
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    actions = (await import('@/server/actions/producao.actions')) as unknown as typeof actions;
    ({ entradaStock } = (await import('@/server/services/inventario/stock.service')) as any);
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    for (const [id, slug, nuit] of [
      [TENANT, `po-164-${sufixo}`, `${sufixo}`.slice(-9)],
      [OUTRO_TENANT, `po-164-o-${sufixo}`, `${sufixo + 1}`.slice(-9)],
    ] as const) {
      await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit } });
    }
    for (const [id, tenantId, tag] of [
      [GESTOR, TENANT, 'gestor'],
      [OUTRO, OUTRO_TENANT, 'outro'],
    ] as const) {
      await db.user.create({
        data: { id, tenantId, email: `po-164-${tag}-${sufixo}@test.mz`, nome: `User ${tag}`, keycloakSub: `kc-po-164-${tag}-${sufixo}` },
      });
    }
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, OUTRO_TENANT), { timeout: 60_000 });

    for (const tenantId of [TENANT, OUTRO_TENANT]) {
      const cat = await db.categoriaProduto.create({ data: { tenantId, nome: `Mobiliário ${tenantId}` } });
      categoria[tenantId] = cat.id;
      loc[tenantId] = {};
    }
    for (const codigo of ['MP', 'PA'] as const) {
      const l = await db.localizacao.create({
        data: { tenantId: TENANT, codigo, nome: `Armazém ${codigo}`, tipo: 'ARMAZEM' },
        select: { id: true },
      });
      loc[TENANT][codigo === 'MP' ? 'mp' : 'pa'] = l.id;
    }
  }, 120_000);

  // ─── transições (trancas do que a UI liga) ─────────────────────────────────

  it('ciclo completo: liberar reserva a BOM em MP, iniciar grava o início, concluir consome e dá entrada em PA', async () => {
    const { acabado, madeira } = await cenarioComBom(100);
    const id = await criarOrdem(acabado, 5);
    const MP = loc[TENANT].mp!;
    const PA = loc[TENANT].pa!;

    // liberar
    expect((await transitar(id, 'LIBERADA')).ok).toBe(true);
    expect((await lerOrdem(id)).status).toBe('LIBERADA');
    const cs = await consumosDe(id, madeira.id);
    expect(cs).toHaveLength(1);
    expect(Number(cs[0].quantidadePrevista)).toBe(10);
    expect(cs[0].reservaId).toBeTruthy();
    const reserva = await db.reservaStock.findUnique({ where: { id: cs[0].reservaId } });
    expect(reserva.status).toBe('ATIVA');
    expect(Number(reserva.quantidade)).toBe(10);
    expect(reserva.localizacaoId).toBe(MP);
    expect(reserva.documentoReferenciaId).toBe(id);
    expect(await saldo(madeira.id, MP)).toEqual({ saldo: 100, reservado: 10 });

    // iniciar
    expect((await transitar(id, 'EM_PRODUCAO')).ok).toBe(true);
    const emProd = await lerOrdem(id);
    expect(emProd.status).toBe('EM_PRODUCAO');
    expect(emProd.dataInicioReal).toBeInstanceOf(Date);

    // concluir (exige qualidade aprovada — #166)
    await aprovar(id);
    const r = await transitar(id, 'CONCLUIDA');
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const fim = await lerOrdem(id);
    expect(fim.status).toBe('CONCLUIDA');
    expect(fim.dataFimReal).toBeInstanceOf(Date);
    expect(fim.progresso).toBe(100);

    expect((await db.reservaStock.findUnique({ where: { id: cs[0].reservaId } })).status).toBe('CONSUMIDA');
    expect(await saldo(madeira.id, MP)).toEqual({ saldo: 90, reservado: 0 });
    const [c] = await consumosDe(id, madeira.id);
    expect(c.movimentoStockId, 'consumo confirmado sem movimentoStockId').toBeTruthy();
    const mov = await db.movimentoStock.findUnique({ where: { id: c.movimentoStockId } });
    expect(mov.tipo).toBe('SAIDA');
    expect(Number(mov.quantidade)).toBe(10);
    expect(mov.localizacaoOrigemId).toBe(MP);

    // entrada do produto acabado pela quantidade da ordem
    expect(await saldo(acabado.id, PA)).toEqual({ saldo: 5, reservado: 0 });
    const entradas = await db.movimentoStock.findMany({
      where: { documentoReferenciaId: id, produtoId: acabado.id, tipo: 'ENTRADA' },
    });
    expect(entradas).toHaveLength(1);
    expect(Number(entradas[0].quantidade)).toBe(5);
    expect(entradas[0].localizacaoDestinoId).toBe(PA);
  });

  it('liberar sem stock para a BOM → STOCK_INSUFICIENTE e nada fica (estado, reservas, consumos)', async () => {
    const { acabado, madeira } = await cenarioComBom(3); // precisa de 10
    const id = await criarOrdem(acabado, 5);

    const r = await transitar(id, 'LIBERADA');
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('STOCK_INSUFICIENTE');

    expect((await lerOrdem(id)).status).toBe('PLANEADA');
    expect(await consumosDe(id)).toHaveLength(0);
    expect(await db.reservaStock.count({ where: { documentoReferenciaId: id } })).toBe(0);
    expect(await saldo(madeira.id, loc[TENANT].mp!)).toEqual({ saldo: 3, reservado: 0 });
  });

  it('concluir sem armazém PA → LOCALIZACAO_NAO_CONFIGURADA e nada fica; com PA reposto conclui', async () => {
    const { acabado, madeira } = await cenarioComBom(100);
    const id = await criarOrdem(acabado, 5);
    await levarA(id, ['LIBERADA', 'EM_PRODUCAO']);
    await aprovar(id);
    const MP = loc[TENANT].mp!;
    const PA = loc[TENANT].pa!;

    await db.localizacao.update({ where: { id: PA }, data: { ativa: false } });
    try {
      const r = await transitar(id, 'CONCLUIDA');
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('LOCALIZACAO_NAO_CONFIGURADA');

      expect((await lerOrdem(id)).status).toBe('EM_PRODUCAO');
      const [c] = await consumosDe(id, madeira.id);
      expect(c.movimentoStockId ?? null, 'consumo confirmado numa conclusão que falhou').toBeNull();
      expect((await db.reservaStock.findUnique({ where: { id: c.reservaId } })).status).toBe('ATIVA');
      expect(await saldo(madeira.id, MP)).toEqual({ saldo: 100, reservado: 10 });
      expect(await saldo(acabado.id, PA)).toEqual({ saldo: 0, reservado: 0 });
    } finally {
      await db.localizacao.update({ where: { id: PA }, data: { ativa: true } });
    }

    const r2 = await transitar(id, 'CONCLUIDA');
    expect(r2.ok, JSON.stringify(r2)).toBe(true);
    expect(await saldo(acabado.id, PA)).toEqual({ saldo: 5, reservado: 0 });
  });

  it('concluir sem qualidade aprovada → QUALIDADE_NAO_APROVADA e nada consome nem entra', async () => {
    const { acabado, madeira } = await cenarioComBom(100);
    const id = await criarOrdem(acabado, 5);
    await levarA(id, ['LIBERADA', 'EM_PRODUCAO']);

    const r = await transitar(id, 'CONCLUIDA');
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('QUALIDADE_NAO_APROVADA');
    expect((await lerOrdem(id)).status).toBe('EM_PRODUCAO');
    expect(await saldo(madeira.id, loc[TENANT].mp!)).toEqual({ saldo: 100, reservado: 10 });
    expect(await saldo(acabado.id, loc[TENANT].pa!)).toEqual({ saldo: 0, reservado: 0 });
  });

  it.each([
    ['PLANEADA', [] as string[]],
    ['LIBERADA', ['LIBERADA']],
    ['EM_PRODUCAO', ['LIBERADA', 'EM_PRODUCAO']],
    ['PAUSADA', ['LIBERADA', 'EM_PRODUCAO', 'PAUSADA']],
  ])('cancelar a partir de %s → CANCELADA e as reservas são libertadas', async (_estado, caminho) => {
    const { acabado, madeira } = await cenarioComBom(100);
    const id = await criarOrdem(acabado, 5);
    await levarA(id, caminho);

    const r = await transitar(id, 'CANCELADA');
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect((await lerOrdem(id)).status).toBe('CANCELADA');

    const reservas = await db.reservaStock.findMany({ where: { documentoReferenciaId: id } });
    for (const rs of reservas) expect(rs.status).toBe('LIBERADA');
    expect(await saldo(madeira.id, loc[TENANT].mp!)).toEqual({ saldo: 100, reservado: 0 });
    expect(await saldo(acabado.id, loc[TENANT].pa!)).toEqual({ saldo: 0, reservado: 0 });
  });

  it.each([
    ['PLANEADA', [] as string[], 'CONCLUIDA'],
    ['PLANEADA', [] as string[], 'EM_PRODUCAO'],
    ['CANCELADA', ['CANCELADA'], 'LIBERADA'],
    ['CONCLUIDA', ['LIBERADA', 'EM_PRODUCAO', '#aprovar', 'CONCLUIDA'], 'EM_PRODUCAO'],
    ['CONCLUIDA', ['LIBERADA', 'EM_PRODUCAO', '#aprovar', 'CONCLUIDA'], 'CANCELADA'],
  ])('transição fora do mapa (%s → %s) → TRANSICAO_INVALIDA e nada muda', async (estado, caminho, alvo) => {
    const { acabado } = await cenarioComBom(100);
    const id = await criarOrdem(acabado, 5);
    for (const s of caminho) {
      if (s === '#aprovar') await aprovar(id);
      else await levarA(id, [s]);
    }
    expect((await lerOrdem(id)).status).toBe(estado);
    const paAntes = await saldo(acabado.id, loc[TENANT].pa!);

    const r = await transitar(id, alvo);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('TRANSICAO_INVALIDA');
    expect((await lerOrdem(id)).status).toBe(estado);
    expect(await saldo(acabado.id, loc[TENANT].pa!)).toEqual(paAntes);
  });

  // ─── consumo de material ad-hoc ────────────────────────────────────────────

  it('[RED] registar consumo em EM_PRODUCAO baixa o stock de MP na mesma transacção e grava o movimento', async () => {
    const { acabado } = await cenarioComBom(100);
    const cola = await produto(TENANT, 'Cola de madeira');
    const MP = loc[TENANT].mp!;
    await darEntrada(TENANT, cola.id, MP, 20);
    const id = await criarOrdem(acabado, 5);
    await levarA(id, ['LIBERADA', 'EM_PRODUCAO']);

    sessao();
    const r = await consumo(id, cola, 3);
    expect(r.ok, JSON.stringify(r)).toBe(true);

    expect(await saldo(cola.id, MP), 'o consumo não baixou o stock').toEqual({ saldo: 17, reservado: 0 });
    const cs = await consumosDe(id, cola.id);
    expect(cs).toHaveLength(1);
    expect(Number(cs[0].quantidadeReal)).toBe(3);
    expect(cs[0].reservaId ?? null).toBeNull();
    expect(cs[0].movimentoStockId, 'consumo sem movimentoStockId').toBeTruthy();

    const mov = await db.movimentoStock.findUnique({ where: { id: cs[0].movimentoStockId } });
    expect(mov.tipo).toBe('SAIDA');
    expect(Number(mov.quantidade)).toBe(3);
    expect(mov.produtoId).toBe(cola.id);
    expect(mov.localizacaoOrigemId).toBe(MP);
    expect(mov.documentoReferenciaId).toBe(id);
    expect(await saidasDe(id, cola.id)).toHaveLength(1);
  });

  it('[RED] o consumo ad-hoc não é baixado outra vez na conclusão (só as reservas são confirmadas)', async () => {
    const { acabado, madeira } = await cenarioComBom(100);
    const cola = await produto(TENANT, 'Cola de madeira');
    const MP = loc[TENANT].mp!;
    await darEntrada(TENANT, cola.id, MP, 20);
    const id = await criarOrdem(acabado, 5);
    await levarA(id, ['LIBERADA', 'EM_PRODUCAO']);

    sessao();
    expect((await consumo(id, cola, 3)).ok).toBe(true);
    expect((await consumo(id, cola, 2)).ok).toBe(true);
    await aprovar(id);
    expect((await transitar(id, 'CONCLUIDA')).ok).toBe(true);

    expect(await saldo(cola.id, MP)).toEqual({ saldo: 15, reservado: 0 });
    expect(await saidasDe(id, cola.id)).toHaveLength(2);
    expect(await saldo(madeira.id, MP)).toEqual({ saldo: 90, reservado: 0 });
    expect(await saldo(acabado.id, loc[TENANT].pa!)).toEqual({ saldo: 5, reservado: 0 });
  });

  it('[RED] registar consumo sem stock suficiente → STOCK_INSUFICIENTE e não fica consumo nenhum', async () => {
    const { acabado } = await cenarioComBom(100);
    const cola = await produto(TENANT, 'Cola de madeira');
    const MP = loc[TENANT].mp!;
    await darEntrada(TENANT, cola.id, MP, 2);
    const id = await criarOrdem(acabado, 5);
    await levarA(id, ['LIBERADA', 'EM_PRODUCAO']);

    sessao();
    const r = await consumo(id, cola, 3);
    expect(r.ok, 'aceitou um consumo maior do que o stock').toBe(false);
    expect(r.error?.code).toBe('STOCK_INSUFICIENTE');

    expect(await consumosDe(id, cola.id)).toHaveLength(0);
    expect(await saldo(cola.id, MP)).toEqual({ saldo: 2, reservado: 0 });
    expect(await saidasDe(id, cola.id)).toHaveLength(0);
  });

  it('[RED] registar consumo sem armazém MP → LOCALIZACAO_NAO_CONFIGURADA e não fica consumo nenhum', async () => {
    const acabado = await produto(OUTRO_TENANT, 'Mesa');
    const cola = await produto(OUTRO_TENANT, 'Cola');
    const id = await criarOrdem(acabado, 1, OUTRO_TENANT); // sem BOM: liberar não reserva nada
    await levarA(id, ['LIBERADA', 'EM_PRODUCAO'], OUTRO_TENANT);

    sessao(OUTRO, PERMS, OUTRO_TENANT);
    const r = await consumo(id, cola, 1);
    expect(r.ok, 'gravou consumo sem armazém de matérias-primas').toBe(false);
    expect(r.error?.code).toBe('LOCALIZACAO_NAO_CONFIGURADA');
    expect(await consumosDe(id)).toHaveLength(0);
  });

  it.each([
    ['PLANEADA', [] as string[]],
    ['PAUSADA', ['LIBERADA', 'EM_PRODUCAO', 'PAUSADA']],
    ['CONCLUIDA', ['LIBERADA', 'EM_PRODUCAO', '#aprovar', 'CONCLUIDA']],
    ['CANCELADA', ['CANCELADA']],
  ])('registar consumo em %s é recusado como regra de negócio e não mexe em stock', async (estado, caminho) => {
    const { acabado } = await cenarioComBom(100);
    const cola = await produto(TENANT, 'Cola de madeira');
    const MP = loc[TENANT].mp!;
    await darEntrada(TENANT, cola.id, MP, 20);
    const id = await criarOrdem(acabado, 5);
    for (const s of caminho) {
      if (s === '#aprovar') await aprovar(id);
      else await levarA(id, [s]);
    }
    expect((await lerOrdem(id)).status).toBe(estado);

    sessao();
    const r = await consumo(id, cola, 3);
    expect(r.ok, `aceitou consumo em ${estado}`).toBe(false);
    expect(r.error?.code, 'estado inválido chegou como «Erro interno»').not.toBe('ERRO_INTERNO');
    expect(await consumosDe(id, cola.id)).toHaveLength(0);
    expect(await saldo(cola.id, MP)).toEqual({ saldo: 20, reservado: 0 });
  });

  it('registar consumo: sem permissão → SEM_PERMISSAO, outro tenant → NAO_ENCONTRADO, leitura → ACESSO_LEITURA; nada muda', async () => {
    const { acabado } = await cenarioComBom(100);
    const cola = await produto(TENANT, 'Cola de madeira');
    const MP = loc[TENANT].mp!;
    await darEntrada(TENANT, cola.id, MP, 20);
    const id = await criarOrdem(acabado, 5);
    await levarA(id, ['LIBERADA', 'EM_PRODUCAO']);

    sessao(GESTOR, ['producao:ordens:read', 'producao:ver']);
    const semPerm = await consumo(id, cola, 1);
    expect(semPerm.ok).toBe(false);
    expect(semPerm.error?.code).toBe('SEM_PERMISSAO');

    sessao(OUTRO, PERMS, OUTRO_TENANT);
    const cross = await consumo(id, cola, 1);
    expect(cross.ok).toBe(false);
    expect(cross.error?.code).toBe('NAO_ENCONTRADO');

    sessao(GESTOR, PERMS, TENANT, 'leitura');
    const leitura = await consumo(id, cola, 1);
    expect(leitura.ok).toBe(false);
    expect(leitura.error?.code).toBe('ACESSO_LEITURA');

    expect(await consumosDe(id, cola.id)).toHaveLength(0);
    expect(await saldo(cola.id, MP)).toEqual({ saldo: 20, reservado: 0 });
  });
});
