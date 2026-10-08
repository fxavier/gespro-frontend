/**
 * Oráculo — issue #110: pedidos de compra sem converter requisição, enviar, confirmar ou
 * cancelar («nenhuma função passa um pedido a Confirmado/Em Trânsito, pelo que a recepção é
 * inalcançável»).
 *
 * Hoje existem no serviço/actions: `converterRequisicaoEmPedidoAction`, `enviarPedidoCompraAction`,
 * `cancelarPedidoCompraAction` e `registarRecebimentoAction` (que só aceita EM_TRANSITO ou
 * RECEBIDO_PARCIAL). A máquina `TRANSICOES_PEDIDO_COMPRA` já prevê ENVIADO → CONFIRMADO →
 * EM_TRANSITO, mas nenhuma função as executa. Este oráculo fixa o contrato do lado do servidor
 * que o detalhe `/compras/pedidos/[id]` e a acção «Converter em pedido» da requisição vão
 * consumir (o E2E `e2e/49-compras-pedido-110.spec.ts` prova a porta de entrada).
 *
 * Contrato (decisões conservadoras do verificador, tratadas como contrato):
 *
 *   Ciclo pelas actions: requisição APROVADA + cotação ADJUDICADA →(converter) pedido RASCUNHO
 *   →(enviar) ENVIADO →(confirmar) CONFIRMADO →(em trânsito) EM_TRANSITO →(recepção) RECEBIDO_*.
 *
 *   (OBRIGAÇÃO NOVA) Duas actions novas, SEM permissões novas no catálogo (uma permissão nova
 *   não chega aos tenants existentes sem re-seed) — ambas registam um passo do fornecedor e
 *   ficam sob `compras:pedido:enviar`:
 *     - `confirmarPedidoCompraAction({ id })`         ENVIADO    → CONFIRMADO
 *     - `marcarPedidoCompraEmTransitoAction({ id })`  CONFIRMADO → EM_TRANSITO
 *   Ambas declaram `revalidate` (são mutações) e usam a máquina existente: transição inválida →
 *   regra de negócio (nunca ERRO_INTERNO) e o estado não muda.
 *
 *   Converter requisição em pedido:
 *     - o pedido nasce RASCUNHO, com o fornecedor vencedor da cotação, `requisicaoCompraId` e
 *       `cotacaoId`, um item por item da requisição, número da série PEDIDO_COMPRA (avançada
 *       exactamente uma vez); a requisição fica CONVERTIDA;
 *     - requisição não APROVADA, cotação não ADJUDICADA → recusado, nada criado, série intacta;
 *     - (OBRIGAÇÃO NOVA, conservadora: recusar) cotação ligada a OUTRA requisição → recusado;
 *     - converter duas vezes → a segunda é recusada; (OBRIGAÇÃO NOVA) duas conversões
 *       CONCORRENTES (duplo clique) dão exactamente um pedido e a série avança uma só vez;
 *     - requisição ou cotação de outro tenant → NAO_ENCONTRADO; sem `compras:pedido:criar` →
 *       SEM_PERMISSAO.
 *
 *   Cancelar: a partir de RASCUNHO, ENVIADO e CONFIRMADO → CANCELADO; EM_TRANSITO e CANCELADO
 *   recusam. (OBRIGAÇÃO NOVA, menos dados alterados) o motivo fica registado nas observações
 *   SEM apagar as observações que o pedido já tinha (hoje são sobrescritas).
 *
 *   Recepção: só depois de EM_TRANSITO; num CONFIRMADO continua recusada.
 *
 *   Leitura para o detalhe: `obterPedido` devolve o nome do fornecedor, os itens e as ligações
 *   à requisição e à cotação.
 *
 *   Permissões e isolamento: sem a permissão da acção → SEM_PERMISSAO; pedido de outro tenant
 *   → NAO_ENCONTRADO; em ambos os casos nada muda.
 *
 * Sessão (`@/lib/auth`) é o único duplo (fronteira), mutável por `vi.hoisted`; `next/cache` é
 * dobrado porque o `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero,
 * `bootstrapContabilidade` (séries REQUISICAO_COMPRA, COTACAO_RFQ, PEDIDO_COMPRA),
 * `createSafeAction` e o `comprasService`.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó A:compras-pedido-110; um agente de implementação que o
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

const CRIAR = 'compras:pedido:criar';
const ENVIAR = 'compras:pedido:enviar';
const CANCELAR = 'compras:pedido:cancelar';
const RECEBER = 'compras:recebimento:registar';
const TODAS = ['compras:ver', CRIAR, 'compras:pedido:editar', ENVIAR, CANCELAR, RECEBER];

type NomeAction =
  | 'converterRequisicaoEmPedidoAction'
  | 'enviarPedidoCompraAction'
  | 'confirmarPedidoCompraAction'
  | 'marcarPedidoCompraEmTransitoAction'
  | 'cancelarPedidoCompraAction'
  | 'registarRecebimentoAction';

describe.skipIf(skip)('Pedidos de compra — converter, enviar, confirmar, em trânsito, cancelar (#110) — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  // Acesso dinâmico: o que ainda não se comporta como o contrato falha o caso, não o ficheiro.
  let compras: Record<string, (...args: any[]) => Promise<any>>;
  let actions: Record<string, (input: unknown) => Promise<Resultado>>;

  const sufixo = Date.now();
  const TENANT = `tenant-pc-110-${sufixo}`;
  const OUTRO = `tenant-pc-110-o-${sufixo}`;
  const USER = `user-pc-110-${sufixo}`;
  const USER_OUTRO = `user-pc-110-o-${sufixo}`;
  // Forma de cuid: o schema do recebimento valida `localizacaoDestinoId` com `.cuid()`; os itens
  // do oráculo não têm produto, logo não há entrada de stock e a localização não é lida.
  const LOCALIZACAO = `cloc110${sufixo}`;

  // F1 e F2 do TENANT; FO do OUTRO tenant.
  const forn: Record<'F1' | 'F2' | 'FO', { id: string; nome: string }> = {} as any;

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

  const converter = (requisicaoId: string, cotacaoId: string) =>
    action('converterRequisicaoEmPedidoAction')({ requisicaoId, cotacaoId });
  const enviar = (id: string) => action('enviarPedidoCompraAction')({ id });
  const confirmar = (id: string) => action('confirmarPedidoCompraAction')({ id });
  const emTransito = (id: string) => action('marcarPedidoCompraEmTransitoAction')({ id });
  const cancelar = (id: string, motivo = 'Cancelado pelo oráculo #110') =>
    action('cancelarPedidoCompraAction')({ id, motivo });

  async function receberParcial(pedidoId: string) {
    const [item] = await db.itemPedidoCompra.findMany({ where: { pedidoCompraId: pedidoId }, orderBy: { descricao: 'asc' } });
    return action('registarRecebimentoAction')({
      pedidoCompraId: pedidoId,
      data: new Date(),
      itens: [
        {
          itemPedidoCompraId: item.id,
          localizacaoDestinoId: LOCALIZACAO,
          quantidadeRecebida: 1,
          quantidadeAceita: 1,
          quantidadeRejeitada: 0,
        },
      ],
    });
  }

  /** Σ proximoNumero de todas as séries PEDIDO_COMPRA do tenant — sobe 1 por número atribuído. */
  async function seriePedidos(tenantId = TENANT): Promise<number> {
    const s = await db.serieDocumento.findMany({ where: { tenantId, tipo: 'PEDIDO_COMPRA' } });
    return s.reduce((acc: number, x: any) => acc + Number(x.proximoNumero), 0);
  }

  /** Requisição APROVADA pelo serviço real (sem circuito configurado, submeter aprova). */
  async function requisicaoAprovada(c = ctx, aprovar = true): Promise<string> {
    const req = await runCtx(c, () =>
      compras.criarRequisicao(
        {
          data: new Date(),
          departamento: 'Administração',
          prioridade: 'MEDIA',
          justificativa: `Requisição do oráculo #110 (${sufixo})`,
          itens: [
            { descricao: 'Cadeira de escritório', quantidade: 4, unidadeMedida: 'UN', precoEstimado: 150 },
            { descricao: 'Mesa de reunião', quantidade: 2, unidadeMedida: 'UN', precoEstimado: 1000 },
          ],
        },
        c,
      ),
    );
    if (aprovar) {
      await runCtx(c, () => compras.submeterRequisicao(req.id, c));
      const r = await db.requisicaoCompra.findUnique({ where: { id: req.id } });
      expect(r.status, 'a requisição de teste não ficou APROVADA').toBe('APROVADA');
    }
    return req.id;
  }

  /**
   * Cotação pelo serviço real, ligada (ou não) a uma requisição, até ao estado pedido.
   * O F1 responde e é o vencedor.
   */
  async function cotacao(
    requisicaoCompraId: string | undefined,
    ate: 'RESPONDIDA' | 'ADJUDICADA' = 'ADJUDICADA',
    c = ctx,
    fornecedorId = forn.F1.id,
  ): Promise<string> {
    const cot = await runCtx(c, () =>
      compras.criarCotacao(
        {
          ...(requisicaoCompraId ? { requisicaoCompraId } : {}),
          dataValidade: new Date(Date.now() + 30 * 24 * 3600 * 1000),
          itens: [
            { descricao: 'Cadeira de escritório', quantidade: 4, unidadeMedida: 'UN' },
            { descricao: 'Mesa de reunião', quantidade: 2, unidadeMedida: 'UN' },
          ],
          fornecedoresIds: [fornecedorId],
        },
        c,
      ),
    );
    await runCtx(c, () => compras.enviarCotacao(cot.id, c));
    const itens = await db.itemCotacao.findMany({ where: { cotacaoId: cot.id } });
    await runCtx(c, () =>
      compras.registarResposta(
        {
          cotacaoId: cot.id,
          fornecedorId,
          prazoEntregaDias: 10,
          condicoesPagamento: '30 dias',
          respostas: itens.map((i: any) => ({ itemCotacaoId: i.id, precoUnitario: 100, prazoEntregaDias: 10 })),
        },
        c,
      ),
    );
    if (ate === 'ADJUDICADA') {
      await runCtx(c, () => compras.adjudicarCotacao({ cotacaoId: cot.id, fornecedorVencedorId: fornecedorId }, c));
    }
    const final = await db.cotacao.findUnique({ where: { id: cot.id } });
    expect(final.status, 'a cotação de teste não chegou ao estado pedido').toBe(ate);
    return cot.id;
  }

  /** Pedido em RASCUNHO pelo serviço real (número da série PEDIDO_COMPRA). */
  async function pedidoRascunho(observacoes?: string, c = ctx, fornecedorId = forn.F1.id): Promise<string> {
    const p = await runCtx(c, () =>
      compras.criarPedido(
        {
          fornecedorId,
          data: new Date(),
          condicoesPagamento: '30 dias',
          prazoEntregaDias: 10,
          dataEntregaPrevista: new Date(Date.now() + 10 * 24 * 3600 * 1000),
          enderecoEntrega: 'Av. 25 de Setembro, Maputo',
          ...(observacoes ? { observacoes } : {}),
          itens: [
            { descricao: 'Resma de papel A4', quantidade: 10, unidadeMedida: 'UN', precoUnitario: 300, desconto: 0, taxaIva: 0.16 },
            { descricao: 'Toner para impressora', quantidade: 2, unidadeMedida: 'UN', precoUnitario: 2500, desconto: 0, taxaIva: 0.16 },
          ],
        },
        c,
      ),
    );
    return p.id;
  }

  async function pedidoEm(estado: 'ENVIADO' | 'CONFIRMADO' | 'EM_TRANSITO', observacoes?: string): Promise<string> {
    const id = await pedidoRascunho(observacoes);
    sessao(USER, TENANT, TODAS);
    const passos: Array<() => Promise<Resultado>> = [() => enviar(id)];
    if (estado !== 'ENVIADO') passos.push(() => confirmar(id));
    if (estado === 'EM_TRANSITO') passos.push(() => emTransito(id));
    for (const passo of passos) {
      const r = await passo();
      expect(r.ok, `preparar pedido ${estado} falhou: ${JSON.stringify(r)}`).toBe(true);
    }
    expect((await retrato(id)).status).toBe(estado);
    return id;
  }

  async function retrato(id: string) {
    const p = await db.pedidoCompra.findUnique({ where: { id } });
    const itens = await db.itemPedidoCompra.findMany({ where: { pedidoCompraId: id }, orderBy: { descricao: 'asc' } });
    return {
      status: p.status,
      observacoes: p.observacoes ?? null,
      recebido: itens.map((i: any) => i.quantidadeRecebida.toString()),
      recebimentos: await db.recebimentoCompra.count({ where: { pedidoCompraId: id } }),
    };
  }

  async function retratoConversao(requisicaoId: string) {
    const r = await db.requisicaoCompra.findUnique({ where: { id: requisicaoId } });
    return {
      requisicao: r.status,
      pedidos: await db.pedidoCompra.count({ where: { requisicaoCompraId: requisicaoId } }),
      serie: await seriePedidos(r.tenantId),
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
      [TENANT, `pc-110-${sufixo}`, `${sufixo}`.slice(-9)],
      [OUTRO, `pc-110-o-${sufixo}`, `${sufixo + 1}`.slice(-9)],
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

    const defs: Array<['F1' | 'F2' | 'FO', string, string]> = [
      ['F1', TENANT, 'Papelaria Maputo Lda'],
      ['F2', TENANT, 'Móveis da Matola SA'],
      ['FO', OUTRO, 'Fornecedor de Outro Tenant'],
    ];
    let n = 0;
    for (const [chave, tenantId, nome] of defs) {
      n += 1;
      const f = await db.fornecedor.create({
        data: {
          tenantId,
          codigo: `FOR-110-${chave}-${sufixo}`,
          nome,
          tipo: 'PESSOA_JURIDICA',
          nuit: `4${String(sufixo + n).slice(-8)}`,
          email: `for-110-${chave.toLowerCase()}-${sufixo}@test.mz`,
        },
      });
      forn[chave] = { id: f.id, nome };
    }
  }, 180_000);

  // -------------------------------------------------------------------------
  // Ciclo completo
  // -------------------------------------------------------------------------

  it('ciclo pelas actions: converter → enviar → confirmar → em trânsito → a recepção passa a ser possível', async () => {
    const req = await requisicaoAprovada();
    const cot = await cotacao(req);
    const serieAntes = await seriePedidos();

    sessao(USER, TENANT, TODAS);
    const conv = await converter(req, cot);
    expect(conv.ok, JSON.stringify(conv)).toBe(true);
    const pedidoId: string = conv.data?.id;
    expect(typeof pedidoId, 'a conversão não devolve o id do pedido criado').toBe('string');

    const p = await db.pedidoCompra.findUnique({ where: { id: pedidoId } });
    expect(p.status).toBe('RASCUNHO');
    expect(p.tenantId).toBe(TENANT);
    expect(p.fornecedorId).toBe(forn.F1.id);
    expect(p.requisicaoCompraId).toBe(req);
    expect(p.cotacaoId).toBe(cot);
    expect(await seriePedidos(), 'a série PEDIDO_COMPRA não avançou exactamente uma vez').toBe(serieAntes + 1);
    const itens = await db.itemPedidoCompra.findMany({ where: { pedidoCompraId: pedidoId }, orderBy: { descricao: 'asc' } });
    expect(itens.map((i: any) => `${i.descricao}|${Number(i.quantidade)}`)).toEqual([
      'Cadeira de escritório|4',
      'Mesa de reunião|2',
    ]);
    expect((await db.requisicaoCompra.findUnique({ where: { id: req } })).status).toBe('CONVERTIDA');

    // Recepção ainda inalcançável enquanto não está em trânsito.
    for (const [passo, chamar, alvo] of [
      ['enviar', enviar, 'ENVIADO'],
      ['confirmar', confirmar, 'CONFIRMADO'],
    ] as Array<[string, (id: string) => Promise<Resultado>, string]>) {
      recusadaComoRegra(await receberParcial(pedidoId), `recepção antes de ${passo}`);
      const r = await chamar(pedidoId);
      expect(r.ok, `${passo}: ${JSON.stringify(r)}`).toBe(true);
      expect((await retrato(pedidoId)).status).toBe(alvo);
    }
    recusadaComoRegra(await receberParcial(pedidoId), 'recepção de um pedido CONFIRMADO');
    expect((await retrato(pedidoId)).recebimentos).toBe(0);

    const t = await emTransito(pedidoId);
    expect(t.ok, JSON.stringify(t)).toBe(true);
    expect((await retrato(pedidoId)).status).toBe('EM_TRANSITO');

    const rec = await receberParcial(pedidoId);
    expect(rec.ok, `a recepção de um pedido EM_TRANSITO falhou: ${JSON.stringify(rec)}`).toBe(true);
    const fim = await retrato(pedidoId);
    expect(fim.status).toBe('RECEBIDO_PARCIAL');
    expect(fim.recebimentos).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Leitura para o detalhe
  // -------------------------------------------------------------------------

  it('obterPedido devolve o nome do fornecedor, os itens e as ligações à requisição e à cotação', async () => {
    const req = await requisicaoAprovada();
    const cot = await cotacao(req);
    sessao(USER, TENANT, TODAS);
    const conv = await converter(req, cot);
    expect(conv.ok, JSON.stringify(conv)).toBe(true);

    const d = await runCtx(ctx, () => compras.obterPedido(conv.data.id, ctx));
    expect(d.fornecedorNome).toBe(forn.F1.nome);
    expect(d.requisicaoCompraId).toBe(req);
    expect(d.cotacaoId).toBe(cot);
    expect(d.status).toBe('RASCUNHO');
    expect(d.numero).toBeTruthy();
    expect(d.itens.map((i: any) => i.descricao).sort()).toEqual(['Cadeira de escritório', 'Mesa de reunião']);
  });

  // -------------------------------------------------------------------------
  // Converter: recusas
  // -------------------------------------------------------------------------

  it('converter requisição não aprovada ou cotação não adjudicada é recusado: nada criado, série intacta', async () => {
    sessao(USER, TENANT, TODAS);

    const rascunho = await requisicaoAprovada(ctx, false);
    const cotA = await cotacao(rascunho);
    const antesR = await retratoConversao(rascunho);
    expect(antesR.requisicao).toBe('RASCUNHO');
    recusadaComoRegra(await converter(rascunho, cotA), 'converter uma requisição em RASCUNHO');
    expect(await retratoConversao(rascunho)).toEqual(antesR);

    const aprovada = await requisicaoAprovada();
    const respondida = await cotacao(aprovada, 'RESPONDIDA');
    const antesA = await retratoConversao(aprovada);
    recusadaComoRegra(await converter(aprovada, respondida), 'converter com uma cotação só RESPONDIDA');
    expect(await retratoConversao(aprovada)).toEqual(antesA);
  });

  it('cotação adjudicada de OUTRA requisição é recusada: nada criado, série intacta', async () => {
    const reqA = await requisicaoAprovada();
    const reqB = await requisicaoAprovada();
    const cotDeB = await cotacao(reqB);
    const antes = await retratoConversao(reqA);
    const antesB = await retratoConversao(reqB);

    sessao(USER, TENANT, TODAS);
    recusadaComoRegra(await converter(reqA, cotDeB), 'converter com a cotação de outra requisição');
    expect(await retratoConversao(reqA)).toEqual(antes);
    expect((await retratoConversao(reqB)).requisicao).toBe(antesB.requisicao);
  });

  it('converter duas vezes: a segunda é recusada e continua a haver um só pedido', async () => {
    const req = await requisicaoAprovada();
    const cot = await cotacao(req);
    sessao(USER, TENANT, TODAS);
    const primeira = await converter(req, cot);
    expect(primeira.ok, JSON.stringify(primeira)).toBe(true);
    const antes = await retratoConversao(req);
    expect(antes).toMatchObject({ requisicao: 'CONVERTIDA', pedidos: 1 });

    recusadaComoRegra(await converter(req, cot), 'converter de novo uma requisição CONVERTIDA');
    expect(await retratoConversao(req)).toEqual(antes);
  });

  it('duas conversões concorrentes (duplo clique) dão exactamente um pedido e a série avança uma vez', async () => {
    const req = await requisicaoAprovada();
    const cot = await cotacao(req);
    const serieAntes = await seriePedidos();
    sessao(USER, TENANT, TODAS);

    const resultados = await Promise.all([converter(req, cot), converter(req, cot)]);
    const aceites = resultados.filter((r) => r.ok);
    expect(aceites, `aceites: ${JSON.stringify(resultados)}`).toHaveLength(1);
    const recusada = resultados.find((r) => !r.ok)!;
    expect(recusada.error?.code, `a perdedora rebentou como erro interno: ${JSON.stringify(recusada)}`).not.toBe(
      'ERRO_INTERNO',
    );

    const depois = await retratoConversao(req);
    expect(depois.requisicao).toBe('CONVERTIDA');
    expect(depois.pedidos, 'o duplo clique criou mais de um pedido').toBe(1);
    expect(depois.serie, 'a conversão recusada queimou um número da série').toBe(serieAntes + 1);
  });

  it('requisição ou cotação de outro tenant → NAO_ENCONTRADO; sem compras:pedido:criar → SEM_PERMISSAO', async () => {
    const req = await requisicaoAprovada();
    const cot = await cotacao(req);
    const reqOutro = await requisicaoAprovada(ctxOutro);
    const cotOutro = await cotacao(reqOutro, 'ADJUDICADA', ctxOutro, forn.FO.id);
    const antes = await retratoConversao(req);
    const antesOutro = await retratoConversao(reqOutro);

    sessao(USER, TENANT, TODAS);
    const r1 = await converter(req, cotOutro);
    expect(r1.ok, 'converter com a cotação de outro tenant passou').toBe(false);
    expect(r1.error?.code).toBe('NAO_ENCONTRADO');
    const r2 = await converter(reqOutro, cot);
    expect(r2.ok, 'converter a requisição de outro tenant passou').toBe(false);
    expect(r2.error?.code).toBe('NAO_ENCONTRADO');

    sessao(USER, TENANT, TODAS.filter((p) => p !== CRIAR));
    const r3 = await converter(req, cot);
    expect(r3.ok, 'converter sem compras:pedido:criar passou').toBe(false);
    expect(r3.error?.code).toBe('SEM_PERMISSAO');

    expect(await retratoConversao(req)).toEqual(antes);
    expect(await retratoConversao(reqOutro)).toEqual(antesOutro);
  });

  // -------------------------------------------------------------------------
  // Transições do pedido: recusas
  // -------------------------------------------------------------------------

  it('transições fora de ordem são recusadas como regra de negócio e o estado não muda', async () => {
    sessao(USER, TENANT, TODAS);

    const rascunho = await pedidoRascunho();
    const antesR = await retrato(rascunho);
    recusadaComoRegra(await confirmar(rascunho), 'confirmar um pedido em RASCUNHO');
    recusadaComoRegra(await emTransito(rascunho), 'marcar em trânsito um pedido em RASCUNHO');
    expect(await retrato(rascunho)).toEqual(antesR);

    const enviado = await pedidoEm('ENVIADO');
    const antesE = await retrato(enviado);
    recusadaComoRegra(await enviar(enviado), 'enviar de novo um pedido ENVIADO');
    recusadaComoRegra(await emTransito(enviado), 'marcar em trânsito um pedido só ENVIADO');
    expect(await retrato(enviado)).toEqual(antesE);

    const confirmado = await pedidoEm('CONFIRMADO');
    const antesC = await retrato(confirmado);
    recusadaComoRegra(await confirmar(confirmado), 'confirmar de novo um pedido CONFIRMADO');
    recusadaComoRegra(await enviar(confirmado), 'enviar um pedido CONFIRMADO');
    expect(await retrato(confirmado)).toEqual(antesC);

    const transito = await pedidoEm('EM_TRANSITO');
    const antesT = await retrato(transito);
    recusadaComoRegra(await emTransito(transito), 'marcar de novo em trânsito');
    recusadaComoRegra(await confirmar(transito), 'confirmar um pedido EM_TRANSITO');
    expect(await retrato(transito)).toEqual(antesT);
  });

  // -------------------------------------------------------------------------
  // Cancelar
  // -------------------------------------------------------------------------

  it('cancela a partir de RASCUNHO, ENVIADO e CONFIRMADO; o motivo junta-se às observações sem as apagar', async () => {
    sessao(USER, TENANT, TODAS);
    const casos: Array<[string, string]> = [
      ['RASCUNHO', await pedidoRascunho('Entregar no armazém central')],
      ['ENVIADO', await pedidoEm('ENVIADO', 'Entregar no armazém central')],
      ['CONFIRMADO', await pedidoEm('CONFIRMADO', 'Entregar no armazém central')],
    ];
    for (const [origem, id] of casos) {
      const motivo = `Fornecedor sem stock (${origem})`;
      const r = await cancelar(id, motivo);
      expect(r.ok, `cancelar a partir de ${origem}: ${JSON.stringify(r)}`).toBe(true);
      const depois = await retrato(id);
      expect(depois.status).toBe('CANCELADO');
      expect(depois.observacoes, `o motivo não ficou registado (${origem})`).toContain(motivo);
      expect(depois.observacoes, `as observações do pedido foram apagadas (${origem})`).toContain(
        'Entregar no armazém central',
      );
    }
  });

  it('EM_TRANSITO não se cancela; CANCELADO é terminal: nenhuma acção passa e nada muda', async () => {
    sessao(USER, TENANT, TODAS);
    const transito = await pedidoEm('EM_TRANSITO');
    const antesT = await retrato(transito);
    recusadaComoRegra(await cancelar(transito), 'cancelar um pedido EM_TRANSITO');
    expect(await retrato(transito)).toEqual(antesT);

    const cancelado = await pedidoEm('ENVIADO');
    expect((await cancelar(cancelado)).ok).toBe(true);
    const antesC = await retrato(cancelado);
    recusadaComoRegra(await enviar(cancelado), 'enviar um pedido CANCELADO');
    recusadaComoRegra(await confirmar(cancelado), 'confirmar um pedido CANCELADO');
    recusadaComoRegra(await emTransito(cancelado), 'marcar em trânsito um pedido CANCELADO');
    recusadaComoRegra(await cancelar(cancelado), 'cancelar de novo um pedido CANCELADO');
    recusadaComoRegra(await receberParcial(cancelado), 'receber um pedido CANCELADO');
    expect(await retrato(cancelado)).toEqual(antesC);
  });

  // -------------------------------------------------------------------------
  // Permissões e isolamento
  // -------------------------------------------------------------------------

  it('cada acção exige a sua permissão: sem ela → SEM_PERMISSAO e nada muda', async () => {
    const rascunho = await pedidoRascunho();
    const enviado = await pedidoEm('ENVIADO');
    const confirmado = await pedidoEm('CONFIRMADO');
    const antes = await Promise.all([rascunho, enviado, confirmado].map(retrato));

    const casos: Array<[string, string, () => Promise<Resultado>]> = [
      ['enviar', ENVIAR, () => enviar(rascunho)],
      ['confirmar', ENVIAR, () => confirmar(enviado)],
      ['em trânsito', ENVIAR, () => emTransito(confirmado)],
      ['cancelar', CANCELAR, () => cancelar(confirmado)],
    ];
    for (const [oQue, perm, chamar] of casos) {
      sessao(USER, TENANT, TODAS.filter((p) => p !== perm));
      const r = await chamar();
      expect(r.ok, `${oQue} sem ${perm} passou`).toBe(false);
      expect(r.error?.code, `${oQue} sem ${perm}`).toBe('SEM_PERMISSAO');
    }
    expect(await Promise.all([rascunho, enviado, confirmado].map(retrato))).toEqual(antes);
  });

  it('pedido de outro tenant → NAO_ENCONTRADO e nada muda', async () => {
    const rascunho = await pedidoRascunho();
    const enviado = await pedidoEm('ENVIADO');
    const confirmado = await pedidoEm('CONFIRMADO');
    const antes = await Promise.all([rascunho, enviado, confirmado].map(retrato));

    sessao(USER_OUTRO, OUTRO, TODAS);
    for (const [oQue, r] of [
      ['enviar', await enviar(rascunho)],
      ['confirmar', await confirmar(enviado)],
      ['em trânsito', await emTransito(confirmado)],
      ['cancelar', await cancelar(confirmado)],
    ] as Array<[string, Resultado]>) {
      expect(r.ok, `${oQue} de outro tenant passou`).toBe(false);
      expect(r.error?.code, `${oQue} de outro tenant`).toBe('NAO_ENCONTRADO');
    }
    await expect(runCtx(ctxOutro, () => compras.obterPedido(confirmado, ctxOutro))).rejects.toMatchObject({
      code: 'NAO_ENCONTRADO',
    });
    expect(await Promise.all([rascunho, enviado, confirmado].map(retrato))).toEqual(antes);
  });
});
