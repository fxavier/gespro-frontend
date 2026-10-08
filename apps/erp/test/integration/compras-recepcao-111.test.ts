/**
 * Oráculo — issue #111: recepção de mercadoria e conta a pagar manual sem ecrã.
 *
 * O serviço já existe — `registarRecebimentoAction` (entrada de stock + conta a pagar automática
 * no RECEBIDO_TOTAL) e `criarContaPagarAction` (conta a pagar manual + lançamento de
 * reconhecimento) — mas nenhuma rota os chama. Este oráculo fixa o contrato do lado do servidor
 * que a rota `/compras/pedidos/[id]/receber` e o formulário `/fornecedores/contas-pagar/nova`
 * vão consumir; o E2E `e2e/50-compras-recepcao-111.spec.ts` prova as portas de entrada.
 *
 * Contrato (decisão do orquestrador; as decisões conservadoras do verificador são contrato):
 *
 *   Recepção (pela action, sem permissões novas — `compras:recebimento:registar`):
 *     - só se recebe um pedido EM_TRANSITO ou RECEBIDO_PARCIAL (o «pedido confirmado» da issue é
 *       o pedido que o fornecedor confirmou e expediu; num CONFIRMADO a recepção continua
 *       recusada, como no oráculo #110 — recusar > número errado);
 *     - cada item aceite com produto entra em stock na localização escolhida (saldo + movimento
 *       com referência ao recebimento); o rejeitado não entra; item sem produto não mexe em stock;
 *     - parcial → RECEBIDO_PARCIAL, sem conta a pagar; o que completa o pedido → RECEBIDO_TOTAL e
 *       EXACTAMENTE UMA conta a pagar ABERTA ligada ao pedido, pelo valor total do pedido, com
 *       número da série CONTA_PAGAR (avançada uma vez) e o lançamento de reconhecimento
 *       (documentoOrigemId = conta) com C 421 pelo total;
 *     - quantidade acima do pedido → regra de negócio, nada muda;
 *     - (OBRIGAÇÃO NOVA) o mesmo item repetido no pedido de recepção conta pela SOMA: duas linhas
 *       que juntas excedem o pedido são recusadas e nada muda;
 *     - (OBRIGAÇÃO NOVA) a localização que vai receber stock (item com produto e quantidade aceite
 *       > 0) tem de ser do tenant e estar activa: de outro tenant ou inexistente → NAO_ENCONTRADO;
 *       inactiva → regra de negócio; em todos os casos nada muda (nem no outro tenant). Item sem
 *       produto não lê a localização (o oráculo #110 recebe-os com um id fictício);
 *     - (OBRIGAÇÃO NOVA) duas recepções CONCORRENTES do mesmo resto (duplo clique no formulário)
 *       dão exactamente um recebimento, uma entrada de stock e UMA conta a pagar; a perdedora é
 *       recusada como regra (nunca ERRO_INTERNO) e não queima número da série CONTA_PAGAR;
 *     - sem a permissão → SEM_PERMISSAO; pedido de outro tenant → NAO_ENCONTRADO; nada muda.
 *
 *   Conta a pagar manual (pela action, sem permissões novas — `compras:conta-pagar:criar`):
 *     - nasce ABERTA, sem pedido, valorRestante = valorOriginal, NUIT copiado do fornecedor,
 *       número da série CONTA_PAGAR (avançada uma vez) e lançamento D conta escolhida / C 421;
 *     - sem conta contabilística → CONTA_CONTABIL_OBRIGATORIA; vencimento antes da emissão,
 *       fornecedor ou conta de outro tenant → recusado; sem permissão → SEM_PERMISSAO; em todos
 *       os casos nenhuma conta criada e a série intacta.
 *
 * Sessão (`@/lib/auth`) é o único duplo (fronteira), mutável por `vi.hoisted`; `next/cache` é
 * dobrado porque o `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero,
 * `bootstrapContabilidade` (séries PEDIDO_COMPRA e CONTA_PAGAR, plano PGC), `createSafeAction`,
 * `comprasService`, `contaPagarService` e `entradaStock`.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó A:compras-recepcao-111; um agente de implementação que o
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

type Resultado = { ok: boolean; data?: any; error?: { code: string; message: string } };

const RECEBER = 'compras:recebimento:registar';
const CRIAR_CP = 'compras:conta-pagar:criar';
const TODAS = [
  'compras:ver',
  'compras:pedido:criar',
  'compras:pedido:editar',
  'compras:pedido:enviar',
  'compras:pedido:cancelar',
  RECEBER,
  CRIAR_CP,
];

describe.skipIf(skip)('Recepção de mercadoria e conta a pagar manual (#111) — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  // Acesso dinâmico: o que ainda não se comporta como o contrato falha o caso, não o ficheiro.
  let compras: Record<string, (...args: any[]) => Promise<any>>;
  let comprasActions: Record<string, (input: unknown) => Promise<Resultado>>;
  let fornecedoresActions: Record<string, (input: unknown) => Promise<Resultado>>;

  const sufixo = Date.now();
  const TENANT = `tenant-rc-111-${sufixo}`;
  const OUTRO = `tenant-rc-111-o-${sufixo}`;
  const USER = `user-rc-111-${sufixo}`;
  const USER_OUTRO = `user-rc-111-o-${sufixo}`;
  // Forma de cuid, mas sem linha na tabela Localizacao.
  const LOC_INEXISTENTE = `cloc111nada${sufixo}`;

  const ctx = { tenantId: TENANT, userId: USER };
  const ctxOutro = { tenantId: OUTRO, userId: USER_OUTRO };

  let fornecedorId = '';
  let fornecedorNuit = '';
  let fornecedorOutroId = '';
  let produtoId = '';
  let produtoOutroId = '';
  let loc = '';
  let locInactiva = '';
  let locOutro = '';
  let contaGasto: { id: string; codigo: string } = { id: '', codigo: '' };
  let contaAgregadora = '';
  let contaOutro = '';

  function sessao(userId: string, tenantId: string, permissions: string[]) {
    h.sessao = { user: { id: userId, tenantId, permissions, acesso: 'aberto' } };
  }

  function action(mod: Record<string, (input: unknown) => Promise<Resultado>>, nome: string, onde: string) {
    const fn = mod[nome];
    expect(typeof fn, `${nome} não está exportada de ${onde}`).toBe('function');
    return fn;
  }
  const receber = (input: unknown) => action(comprasActions, 'registarRecebimentoAction', 'compras.actions.ts')(input);
  const criarCP = (input: unknown) =>
    action(fornecedoresActions, 'criarContaPagarAction', 'fornecedores.actions.ts')(input);

  function recusadaComoRegra(r: Resultado, oQue: string) {
    expect(r.ok, `${oQue} foi aceite`).toBe(false);
    expect(r.error?.code, `${oQue} rebentou como erro interno: ${JSON.stringify(r)}`).not.toBe('ERRO_INTERNO');
  }

  async function serie(tipo: 'CONTA_PAGAR' | 'PEDIDO_COMPRA', tenantId = TENANT): Promise<number> {
    const s = await db.serieDocumento.findMany({ where: { tenantId, tipo } });
    return s.reduce((acc: number, x: any) => acc + Number(x.proximoNumero), 0);
  }

  async function saldo(produto: string, localizacaoId: string): Promise<number> {
    const s = await db.saldoStock.findFirst({ where: { produtoId: produto, localizacaoId } });
    return s ? Number(s.saldo) : 0;
  }

  /**
   * Pedido pelo serviço real, levado a EM_TRANSITO pelas actions do #110.
   * Item «A — Resma de papel A4»: com produto, 10 un. Item «B — Serviço de montagem»: sem produto, 2 un.
   */
  async function pedidoEmTransito(): Promise<{ id: string; itemA: string; itemB: string }> {
    const p = await runCtx(ctx, () =>
      compras.criarPedido(
        {
          fornecedorId,
          data: new Date(),
          condicoesPagamento: '30 dias',
          prazoEntregaDias: 10,
          dataEntregaPrevista: new Date(Date.now() + 10 * 24 * 3600 * 1000),
          enderecoEntrega: 'Av. 25 de Setembro, Maputo',
          itens: [
            { produtoId, descricao: 'A — Resma de papel A4', quantidade: 10, unidadeMedida: 'UN', precoUnitario: 300, desconto: 0, taxaIva: 0.16 },
            { descricao: 'B — Serviço de montagem', quantidade: 2, unidadeMedida: 'UN', precoUnitario: 2500, desconto: 0, taxaIva: 0.16 },
          ],
        },
        ctx,
      ),
    );
    sessao(USER, TENANT, TODAS);
    for (const nome of ['enviarPedidoCompraAction', 'confirmarPedidoCompraAction', 'marcarPedidoCompraEmTransitoAction']) {
      const r = await action(comprasActions, nome, 'compras.actions.ts')({ id: p.id });
      expect(r.ok, `preparar pedido EM_TRANSITO (${nome}) falhou: ${JSON.stringify(r)}`).toBe(true);
    }
    const itens = await db.itemPedidoCompra.findMany({ where: { pedidoCompraId: p.id }, orderBy: { descricao: 'asc' } });
    expect(itens.map((i: any) => i.descricao)).toEqual(['A — Resma de papel A4', 'B — Serviço de montagem']);
    return { id: p.id, itemA: itens[0].id, itemB: itens[1].id };
  }

  function linha(
    itemPedidoCompraId: string,
    quantidadeRecebida: number,
    localizacaoDestinoId = loc,
    rejeitada = 0,
  ) {
    return {
      itemPedidoCompraId,
      localizacaoDestinoId,
      quantidadeRecebida,
      quantidadeAceita: quantidadeRecebida - rejeitada,
      quantidadeRejeitada: rejeitada,
      ...(rejeitada > 0 ? { motivoRejeicao: 'Embalagem danificada' } : {}),
    };
  }

  const recepcao = (pedidoCompraId: string, itens: unknown[]) =>
    receber({ pedidoCompraId, data: new Date(), numeroDocumento: `GR-${sufixo}`, itens });

  /** Tudo o que uma recepção pode mudar — inclusive no outro tenant. */
  async function retrato(pedidoId: string) {
    const p = await db.pedidoCompra.findUnique({ where: { id: pedidoId } });
    const itens = await db.itemPedidoCompra.findMany({ where: { pedidoCompraId: pedidoId }, orderBy: { descricao: 'asc' } });
    return {
      status: p.status,
      recebido: itens.map((i: any) => Number(i.quantidadeRecebida)),
      recebimentos: await db.recebimentoCompra.count({ where: { pedidoCompraId: pedidoId } }),
      contasPagar: await db.contaPagar.count({ where: { pedidoCompraId: pedidoId } }),
      saldoLoc: await saldo(produtoId, loc),
      saldoLocInactiva: await saldo(produtoId, locInactiva),
      movimentosTenant: await db.movimentoStock.count({ where: { tenantId: TENANT } }),
      movimentosOutro: await db.movimentoStock.count({ where: { tenantId: OUTRO } }),
      saldosOutro: await db.saldoStock.count({ where: { tenantId: OUTRO } }),
      saldosNoLocOutro: await db.saldoStock.count({ where: { localizacaoId: locOutro } }),
      serieCP: await serie('CONTA_PAGAR'),
    };
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ comprasService: compras } = (await import('@/server/services/compras/compras.service')) as any);
    comprasActions = (await import('@/server/actions/compras.actions')) as unknown as typeof comprasActions;
    fornecedoresActions = (await import('@/server/actions/fornecedores.actions')) as unknown as typeof fornecedoresActions;
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    const tenants = [
      [TENANT, `rc-111-${sufixo}`, `${sufixo}`.slice(-9)],
      [OUTRO, `rc-111-o-${sufixo}`, `${sufixo + 1}`.slice(-9)],
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

    fornecedorNuit = `4${String(sufixo).slice(-8)}`;
    const f = await db.fornecedor.create({
      data: {
        tenantId: TENANT,
        codigo: `FOR-111-${sufixo}`,
        nome: 'Papelaria Maputo Lda',
        tipo: 'PESSOA_JURIDICA',
        nuit: fornecedorNuit,
        email: `for-111-${sufixo}@test.mz`,
      },
    });
    fornecedorId = f.id;
    const fo = await db.fornecedor.create({
      data: {
        tenantId: OUTRO,
        codigo: `FOR-111-O-${sufixo}`,
        nome: 'Fornecedor de Outro Tenant',
        tipo: 'PESSOA_JURIDICA',
        nuit: `4${String(sufixo + 1).slice(-8)}`,
        email: `for-111-o-${sufixo}@test.mz`,
      },
    });
    fornecedorOutroId = fo.id;

    for (const [tenantId, alvo] of [
      [TENANT, 'p'],
      [OUTRO, 'o'],
    ] as const) {
      const cat = await db.categoriaProduto.create({ data: { tenantId, nome: `Cat 111 ${alvo} ${sufixo}` } });
      const prod = await db.produto.create({
        data: {
          tenantId,
          sku: `SKU-111-${alvo}-${sufixo}`,
          nome: 'Resma de papel A4',
          categoriaId: cat.id,
          unidadeMedida: 'UN',
          precoVenda: '450',
          precoCompra: '300',
          margemLucro: '0.5',
        },
      });
      if (alvo === 'p') produtoId = prod.id;
      else produtoOutroId = prod.id;
    }
    loc = (await db.localizacao.create({ data: { tenantId: TENANT, codigo: `ARM-111-${sufixo}`, nome: 'Armazém Central', tipo: 'ARMAZEM' } })).id;
    locInactiva = (
      await db.localizacao.create({
        data: { tenantId: TENANT, codigo: `ARM-111-X-${sufixo}`, nome: 'Armazém Desactivado', tipo: 'ARMAZEM', ativa: false },
      })
    ).id;
    locOutro = (await db.localizacao.create({ data: { tenantId: OUTRO, codigo: `ARM-111-O-${sufixo}`, nome: 'Armazém do Outro', tipo: 'ARMAZEM' } })).id;

    // Conta de gasto que aceita lançamento (folha activa da classe 6) e uma agregadora.
    const folha = await db.contaPGC.findFirst({
      where: { tenantId: TENANT, codigo: { startsWith: '6' }, aceitaLancamento: true, ativo: true },
      orderBy: { codigo: 'asc' },
    });
    expect(folha, 'o bootstrap não criou nenhuma conta de gasto que aceite lançamento').toBeTruthy();
    contaGasto = { id: folha.id, codigo: folha.codigo };
    const agregadora = await db.contaPGC.findFirst({
      where: { tenantId: TENANT, codigo: { startsWith: '6' }, aceitaLancamento: false },
      orderBy: { codigo: 'asc' },
    });
    contaAgregadora = agregadora?.id ?? '';
    contaOutro = (await db.contaPGC.findFirst({ where: { tenantId: OUTRO, codigo: folha.codigo } })).id;
  }, 180_000);

  // ===========================================================================
  // Recepção
  // ===========================================================================

  it('ciclo: parcial entra em stock sem conta a pagar; o que completa dá RECEBIDO_TOTAL e UMA conta a pagar lançada', async () => {
    const p = await pedidoEmTransito();
    const pedido = await db.pedidoCompra.findUnique({ where: { id: p.id } });
    const serieAntes = await serie('CONTA_PAGAR');

    // Parcial: 4 de A.
    const r1 = await recepcao(p.id, [linha(p.itemA, 4)]);
    expect(r1.ok, `recepção parcial: ${JSON.stringify(r1)}`).toBe(true);
    let s = await retrato(p.id);
    expect(s.status).toBe('RECEBIDO_PARCIAL');
    expect(s.recebido).toEqual([4, 0]);
    expect(s.recebimentos).toBe(1);
    expect(s.saldoLoc, 'o recebido não entrou em stock na localização escolhida').toBe(4);
    expect(s.contasPagar, 'uma recepção parcial criou conta a pagar').toBe(0);
    expect(s.serieCP).toBe(serieAntes);
    const rec1 = await db.recebimentoCompra.findFirst({ where: { pedidoCompraId: p.id } });
    const mov = await db.movimentoStock.findMany({ where: { documentoReferenciaId: rec1.id } });
    expect(mov.map((m: any) => [m.tipo, Number(m.quantidade), m.localizacaoDestinoId, m.produtoId])).toEqual([
      ['ENTRADA', 4, loc, produtoId],
    ]);

    // Completa: 6 de A + 2 de B (B sem produto não mexe em stock).
    const r2 = await recepcao(p.id, [linha(p.itemA, 6), linha(p.itemB, 2)]);
    expect(r2.ok, `recepção que completa: ${JSON.stringify(r2)}`).toBe(true);
    s = await retrato(p.id);
    expect(s.status).toBe('RECEBIDO_TOTAL');
    expect(s.recebido).toEqual([10, 2]);
    expect(s.recebimentos).toBe(2);
    expect(s.saldoLoc).toBe(10);
    expect(s.contasPagar, 'RECEBIDO_TOTAL tem de criar exactamente uma conta a pagar').toBe(1);
    expect(s.serieCP, 'a série CONTA_PAGAR não avançou exactamente uma vez').toBe(serieAntes + 1);

    const cp = await db.contaPagar.findFirst({ where: { pedidoCompraId: p.id } });
    expect(cp.tenantId).toBe(TENANT);
    expect(cp.fornecedorId).toBe(fornecedorId);
    expect(cp.status).toBe('ABERTA');
    expect(cp.valorOriginal.toString()).toBe(pedido.valorTotal.toString());
    expect(cp.valorRestante.toString()).toBe(pedido.valorTotal.toString());
    expect(cp.numero).toBeTruthy();

    const lanc = await db.lancamento.findMany({ where: { tenantId: TENANT, documentoOrigemId: cp.id } });
    expect(lanc, 'a conta a pagar da recepção não tem lançamento de reconhecimento').toHaveLength(1);
    const partidas = await db.partidaLancamento.findMany({ where: { lancamentoId: lanc[0].id }, include: { conta: true } });
    const deb = partidas.filter((x: any) => x.tipo === 'DEBITO').reduce((a: number, x: any) => a + Number(x.valor), 0);
    const cred = partidas.filter((x: any) => x.tipo === 'CREDITO').reduce((a: number, x: any) => a + Number(x.valor), 0);
    expect(deb).toBeCloseTo(cred, 2);
    const c421 = partidas.find((x: any) => x.tipo === 'CREDITO' && x.conta.codigo === '421');
    expect(c421, 'o reconhecimento não credita a 421').toBeTruthy();
    expect(Number(c421.valor)).toBeCloseTo(Number(pedido.valorTotal), 2);

    // RECEBIDO_TOTAL é terminal para a recepção.
    const antes = await retrato(p.id);
    recusadaComoRegra(await recepcao(p.id, [linha(p.itemA, 1)]), 'receber um pedido já RECEBIDO_TOTAL');
    expect(await retrato(p.id)).toEqual(antes);
  });

  it('o rejeitado não entra em stock e não conta como recebido', async () => {
    const p = await pedidoEmTransito();
    const antes = await retrato(p.id);
    const r = await recepcao(p.id, [linha(p.itemA, 3, loc, 1)]);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const depois = await retrato(p.id);
    expect(depois.status).toBe('RECEBIDO_PARCIAL');
    expect(depois.recebido).toEqual([2, 0]);
    expect(depois.saldoLoc - antes.saldoLoc, 'o rejeitado entrou em stock').toBe(2);
    expect(depois.contasPagar).toBe(0);
  });

  it('quantidade acima do pedido é recusada como regra e nada muda', async () => {
    const p = await pedidoEmTransito();
    expect((await recepcao(p.id, [linha(p.itemA, 4)])).ok).toBe(true);
    const antes = await retrato(p.id);
    recusadaComoRegra(await recepcao(p.id, [linha(p.itemA, 7)]), 'receber 7 quando faltam 6');
    expect(await retrato(p.id)).toEqual(antes);
  });

  it('o mesmo item em duas linhas conta pela soma: 6 + 6 de um item de 10 é recusado e nada muda', async () => {
    const p = await pedidoEmTransito();
    const antes = await retrato(p.id);
    recusadaComoRegra(
      await recepcao(p.id, [linha(p.itemA, 6), linha(p.itemA, 6), linha(p.itemB, 2)]),
      'duas linhas do mesmo item que juntas excedem o pedido',
    );
    expect(await retrato(p.id)).toEqual(antes);
  });

  it('localização de outro tenant ou inexistente → NAO_ENCONTRADO; nada muda, nem no outro tenant', async () => {
    const p = await pedidoEmTransito();
    const antes = await retrato(p.id);
    for (const [oQue, destino] of [
      ['de outro tenant', () => locOutro],
      ['inexistente', () => LOC_INEXISTENTE],
    ] as Array<[string, () => string]>) {
      const r = await recepcao(p.id, [linha(p.itemA, 4, destino())]);
      expect(r.ok, `receber para uma localização ${oQue} passou`).toBe(false);
      expect(r.error?.code, `localização ${oQue}: ${JSON.stringify(r)}`).toBe('NAO_ENCONTRADO');
      expect(await retrato(p.id), `localização ${oQue}: algo mudou`).toEqual(antes);
    }
    expect(await saldo(produtoOutroId, locOutro)).toBe(0);
  });

  it('localização inactiva é recusada como regra e nada muda', async () => {
    const p = await pedidoEmTransito();
    const antes = await retrato(p.id);
    recusadaComoRegra(await recepcao(p.id, [linha(p.itemA, 4, locInactiva)]), 'receber para uma localização inactiva');
    expect(await retrato(p.id)).toEqual(antes);
  });

  it('item sem produto não lê a localização: recebe-se com qualquer localização', async () => {
    const p = await pedidoEmTransito();
    const r = await recepcao(p.id, [linha(p.itemB, 2, LOC_INEXISTENTE)]);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const s = await retrato(p.id);
    expect(s.status).toBe('RECEBIDO_PARCIAL');
    expect(s.recebido).toEqual([0, 2]);
  });

  it('duas recepções concorrentes do mesmo resto (duplo clique): um recebimento, uma entrada, UMA conta a pagar', async () => {
    const p = await pedidoEmTransito();
    expect((await recepcao(p.id, [linha(p.itemA, 4)])).ok).toBe(true);
    const antes = await retrato(p.id);

    const resto = [linha(p.itemA, 6), linha(p.itemB, 2)];
    const resultados = await Promise.all([recepcao(p.id, resto), recepcao(p.id, resto)]);
    const aceites = resultados.filter((r) => r.ok);
    expect(aceites, `aceites: ${JSON.stringify(resultados)}`).toHaveLength(1);
    recusadaComoRegra(resultados.find((r) => !r.ok)!, 'a recepção concorrente perdedora');

    const depois = await retrato(p.id);
    expect(depois.status).toBe('RECEBIDO_TOTAL');
    expect(depois.recebido, 'o duplo clique recebeu duas vezes').toEqual([10, 2]);
    expect(depois.recebimentos).toBe(antes.recebimentos + 1);
    expect(depois.saldoLoc - antes.saldoLoc, 'o duplo clique deu entrada em stock duas vezes').toBe(6);
    expect(depois.contasPagar, 'o duplo clique criou mais de uma conta a pagar').toBe(1);
    expect(depois.serieCP, 'a recepção perdedora queimou um número CONTA_PAGAR').toBe(antes.serieCP + 1);
  });

  it('sem compras:recebimento:registar → SEM_PERMISSAO; pedido de outro tenant → NAO_ENCONTRADO; nada muda', async () => {
    const p = await pedidoEmTransito();
    const antes = await retrato(p.id);

    sessao(USER, TENANT, TODAS.filter((x) => x !== RECEBER));
    const r1 = await recepcao(p.id, [linha(p.itemA, 4)]);
    expect(r1.ok, 'receber sem a permissão passou').toBe(false);
    expect(r1.error?.code).toBe('SEM_PERMISSAO');

    sessao(USER_OUTRO, OUTRO, TODAS);
    const r2 = await recepcao(p.id, [linha(p.itemA, 4, locOutro)]);
    expect(r2.ok, 'receber o pedido de outro tenant passou').toBe(false);
    expect(r2.error?.code).toBe('NAO_ENCONTRADO');

    expect(await retrato(p.id)).toEqual(antes);
  });

  // ===========================================================================
  // Conta a pagar manual
  // ===========================================================================

  const hoje = () => new Date();
  const emDias = (n: number) => new Date(Date.now() + n * 24 * 3600 * 1000);

  async function retratoCP(descricao: string) {
    return {
      contas: await db.contaPagar.count({ where: { descricao } }),
      serieCP: await serie('CONTA_PAGAR'),
      serieCPOutro: await serie('CONTA_PAGAR', OUTRO),
    };
  }

  it('conta a pagar manual: ABERTA, sem pedido, série avançada uma vez e lançamento D conta / C 421', async () => {
    sessao(USER, TENANT, TODAS);
    const descricao = `Renda do armazém ${sufixo}`;
    const serieAntes = await serie('CONTA_PAGAR');
    const r = await criarCP({
      fornecedorId,
      descricao,
      valorOriginal: 1234.5,
      dataEmissao: hoje(),
      dataVencimento: emDias(30),
      contaContabilId: contaGasto.id,
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const id: string = r.data?.id;
    expect(typeof id, 'a criação não devolve o id da conta (a rota precisa dele para ir ao detalhe)').toBe('string');

    const cp = await db.contaPagar.findUnique({ where: { id } });
    expect(cp.tenantId).toBe(TENANT);
    expect(cp.descricao).toBe(descricao);
    expect(cp.fornecedorId).toBe(fornecedorId);
    expect(cp.pedidoCompraId).toBeNull();
    expect(cp.status).toBe('ABERTA');
    expect(Number(cp.valorOriginal)).toBe(1234.5);
    expect(Number(cp.valorRestante)).toBe(1234.5);
    expect(Number(cp.valorPago)).toBe(0);
    expect(cp.nuitFornecedor).toBe(fornecedorNuit);
    expect(cp.numero).toBeTruthy();
    expect(await serie('CONTA_PAGAR')).toBe(serieAntes + 1);

    const lanc = await db.lancamento.findMany({ where: { tenantId: TENANT, documentoOrigemId: id } });
    expect(lanc, 'a conta a pagar manual não tem lançamento de reconhecimento').toHaveLength(1);
    const partidas = await db.partidaLancamento.findMany({ where: { lancamentoId: lanc[0].id }, include: { conta: true } });
    expect(
      partidas.map((x: any) => `${x.tipo}|${x.conta.codigo}|${Number(x.valor)}`).sort(),
    ).toEqual([`CREDITO|421|1234.5`, `DEBITO|${contaGasto.codigo}|1234.5`].sort());
  });

  it('conta a pagar manual inválida é recusada: nenhuma conta criada e série intacta', async () => {
    sessao(USER, TENANT, TODAS);
    const base = {
      fornecedorId,
      valorOriginal: 500,
      dataEmissao: hoje(),
      dataVencimento: emDias(15),
      contaContabilId: contaGasto.id,
    };
    const casos: Array<[string, Record<string, unknown>, string | null]> = [
      ['sem conta contabilística', { contaContabilId: undefined }, 'CONTA_CONTABIL_OBRIGATORIA'],
      ['vencimento antes da emissão', { dataVencimento: emDias(-5) }, null],
      ['valor zero', { valorOriginal: 0 }, null],
      ['fornecedor de outro tenant', { fornecedorId: fornecedorOutroId }, 'NAO_ENCONTRADO'],
      ['conta contabilística de outro tenant', { contaContabilId: contaOutro }, 'NAO_ENCONTRADO'],
    ];
    if (contaAgregadora) casos.push(['conta agregadora (não aceita lançamento)', { contaContabilId: contaAgregadora }, null]);

    for (const [oQue, delta, codigo] of casos) {
      const descricao = `CP inválida ${oQue} ${sufixo}`;
      const antes = await retratoCP(descricao);
      const r = await criarCP({ ...base, ...delta, descricao });
      recusadaComoRegra(r, `criar conta a pagar ${oQue}`);
      if (codigo) expect(r.error?.code, oQue).toBe(codigo);
      expect(await retratoCP(descricao), `${oQue}: algo mudou`).toEqual(antes);
    }
  });

  it('sem compras:conta-pagar:criar → SEM_PERMISSAO e nada muda', async () => {
    const descricao = `CP sem permissão ${sufixo}`;
    const antes = await retratoCP(descricao);
    sessao(USER, TENANT, TODAS.filter((x) => x !== CRIAR_CP));
    const r = await criarCP({
      fornecedorId,
      descricao,
      valorOriginal: 100,
      dataEmissao: hoje(),
      dataVencimento: emDias(10),
      contaContabilId: contaGasto.id,
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('SEM_PERMISSAO');
    expect(await retratoCP(descricao)).toEqual(antes);
  });
});
