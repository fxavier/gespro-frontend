/**
 * Oráculo B:devolucoes-ecras-130 — devoluções aprovam/rejeitam/processam e trocas criam-se pela UI
 * (#130). As actions já existiam sem ecrã; agora a UI liga-as, e por isso o caminho que ela usa
 * tem de estar provado de ponta a ponta, e as duas transições que ficam lado a lado no detalhe
 * («Aprovar» e «Rejeitar») não podem pisar-se.
 *
 * Contrato:
 *   A. Pelas Server Actions que a UI chama (sessão dobrada; tudo o resto real):
 *      1. criarDevolucao (com factura) → aprovarDevolucao → processarDevolucao({ id, localizacaoId })
 *         (sem série de NC — #241) → PROCESSADA, `notaCreditoId` = NC EMITIDA da factura pelo total
 *         devolvido, entrada de stock (MovimentoStock com `documentoReferenciaId` = devolução) e
 *         saldo +quantidade. A devolução criada pela UI deixa de ficar PENDENTE para sempre.
 *      2. rejeitarDevolucao numa PENDENTE → REJEITADA; depois disso aprovar e processar recusam
 *         com TRANSICAO_INVALIDA e nada muda (sem NC, sem stock).
 *      3. criarTroca de uma devolução APROVADA com factura (substituto de igual valor, sem
 *         pagamentos) → Troca criada, devolução PROCESSADA com NC, venda de substituição com
 *         Factura-Recibo.
 *      4. Sem a permissão de cada action → SEM_PERMISSAO e nada muda.
 *      5. Devolução de outro tenant → NAO_ENCONTRADO em aprovar/rejeitar/processar; nada muda.
 *   B. aprovar/rejeitar são COMPARE-AND-SET: o estado de que partem é decidido na mesma
 *      transacção que escreve (leitura trancada ou UPDATE … WHERE status = …). Hoje leem fora
 *      da transacção e fazem `update` por id — um «Rejeitar» atrasado pode carimbar REJEITADA
 *      por cima de uma devolução já PROCESSADA (com NC emitida e stock reentrado).
 *      1. Outra tx tem a devolução trancada e passa-a a REJEITADA → aprovar espera e recusa
 *         TRANSICAO_INVALIDA; fica REJEITADA.
 *      2. Outra tx tem a devolução trancada e passa-a a PROCESSADA → rejeitar espera e recusa
 *         TRANSICAO_INVALIDA; fica PROCESSADA.
 *      3. Corridas (RONDAS): aprovar × rejeitar, aprovar × aprovar, rejeitar × rejeitar → um
 *         passa, o outro recebe BusinessRuleError TRANSICAO_INVALIDA; o estado final é o do
 *         vencedor.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó B:devolucoes-ecras-130; um agente de implementação que o
 * altere é BLOCKER.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const h = vi.hoisted(() => ({
  sessao: null as null | {
    user: {
      id: string;
      tenantId: string;
      permissions: string[];
      acesso: 'aberto' | 'leitura' | 'fechado';
      emailVerificado: boolean;
    };
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

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const RONDAS = 5;

const PERMISSOES = [
  'vendas:devolucoes:criar',
  'vendas:devolucoes:aprovar',
  'vendas:devolucoes:processar',
  'vendas:devolucoes:rejeitar',
  'vendas:trocas:criar',
];

describe.skipIf(skip)('Devoluções e trocas pela UI (#130) — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let comercial: any;
  let validacoes: typeof import('@/lib/validations/vendas');
  let caixa: typeof import('@/server/services/financas/caixa.service');
  let bootstrap: (typeof import('@/server/provisioning/tenant-bootstrap'))['bootstrapContabilidade'];
  // Acesso dinâmico: um caso que falhe por comportamento falha o caso, não o ficheiro.
  let actions: Record<string, (input: unknown) => Promise<Resultado>>;

  const sufixo = Date.now();
  const TENANT = `tenant-dev130-${sufixo}`;
  const OUTRO_TENANT = `tenant-dev130-outro-${sufixo}`;
  const USER = `cdev130u${sufixo}`;
  const OUTRO_USER = `cdev130b${sufixo}`;
  const ctx: Ctx = { tenantId: TENANT, userId: USER };
  const outroCtx: Ctx = { tenantId: OUTRO_TENANT, userId: OUTRO_USER };

  let produtoA: string;
  let localizacaoId: string;
  let sessaoCaixaId: string;
  let sessaoPOSId: string;

  let outroProduto: string;
  let outroClienteId: string;

  function sessao(permissions: string[] = PERMISSOES) {
    h.sessao = { user: { id: USER, tenantId: TENANT, permissions, acesso: 'aberto', emailVerificado: true } };
  }

  function action(nome: string) {
    const fn = actions[nome];
    expect(typeof fn, `${nome} não está exportada de vendas.actions.ts`).toBe('function');
    return fn;
  }

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  async function montarTenant(tenantId: string, userId: string, marca: string) {
    await db.tenant.create({
      data: { id: tenantId, nome: `Tenant devoluções ${marca}`, slug: `dev130-${marca}-${sufixo}`, nuit: `${marca === 'a' ? 6 : 7}${String(sufixo).slice(-8)}` },
    });
    await db.user.create({
      data: { id: userId, tenantId, email: `dev130-${marca}-${sufixo}@test.mz`, nome: `Operador ${marca}`, keycloakSub: `kc-dev130-${marca}-${sufixo}` },
    });
    await db.$transaction((tx: any) => (bootstrap as any)(tx, tenantId), { timeout: 60_000 });
  }

  /** Venda POS de 1 × A a 1000 + 16%, paga em DINHEIRO (Factura-Recibo 1160). */
  async function venderA() {
    const input = validacoes.CreateVendaSchema.parse({
      origem: 'POS',
      vendedorId: USER,
      sessaoPOSId,
      sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      itens: [{ produtoId: produtoA, nomeProduto: 'Artigo A', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 }],
      pagamentos: [{ tipo: 'DINHEIRO', valor: 1160 }],
    });
    const row: any = await runCtx(ctx, () => comercial.vendaService.criar(input, ctx));
    const venda = await db.venda.findFirst({ where: { id: row.id, tenantId: TENANT } });
    expect(venda?.faturaId, 'fixture: venda POS com Factura-Recibo').toBeTruthy();
    const fatura = await db.fatura.findFirst({ where: { id: venda.faturaId, tenantId: TENANT } });
    return { venda, fatura };
  }

  function inputDevolucao(venda: any, fatura: any) {
    return {
      clienteId: fatura.clienteId,
      vendaId: venda.id,
      faturaId: fatura.id,
      motivo: 'DEFEITO',
      reembolso: false,
      itens: [{ produtoId: produtoA, nomeProduto: 'Artigo A', quantidade: 1, valorUnitario: 1000, taxaIva: 0.16 }],
    };
  }

  /** Devolução PENDENTE (pelo serviço: fixture, não é o que se prova). */
  async function devolucaoPendente(): Promise<any> {
    const { venda, fatura } = await venderA();
    const input = validacoes.CreateDevolucaoSchema.parse(inputDevolucao(venda, fatura));
    const row: any = await runCtx(ctx, () => comercial.devolucaoService.criar(input, ctx));
    const d = await db.devolucao.findFirst({ where: { id: row.id, tenantId: TENANT } });
    expect(d.status, 'fixture: devolução nasce PENDENTE').toBe('PENDENTE');
    return d;
  }

  const lerDev = (id: string, tenantId = TENANT) => db.devolucao.findFirst({ where: { id, tenantId } });

  async function saldoA(): Promise<number> {
    const s = await db.saldoStock.findFirst({ where: { tenantId: TENANT, produtoId: produtoA, varianteProdutoId: '', localizacaoId } });
    return Number(String(s.saldo));
  }

  async function contagens(tenantId = TENANT) {
    return {
      notasCredito: await db.notaCredito.count({ where: { tenantId } }),
      movimentosStock: await db.movimentoStock.count({ where: { tenantId } }),
      trocas: await db.troca.count({ where: { tenantId } }),
      lancamentos: await db.lancamento.count({ where: { tenantId } }),
    };
  }

  const aprovarSvc = (id: string) => runCtx(ctx, () => comercial.devolucaoService.aprovar(id, ctx));
  const rejeitarSvc = (id: string) => runCtx(ctx, () => comercial.devolucaoService.rejeitar(id, ctx));

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    comercial = await import('@/server/services/comercial');
    validacoes = await import('@/lib/validations/vendas');
    caixa = await import('@/server/services/financas/caixa.service');
    ({ bootstrapContabilidade: bootstrap } = await import('@/server/provisioning/tenant-bootstrap'));
    actions = (await import('@/server/actions/vendas.actions')) as unknown as typeof actions;

    await montarTenant(TENANT, USER, 'a');
    await montarTenant(OUTRO_TENANT, OUTRO_USER, 'b');

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const loc = await db.localizacao.create({
      data: { tenantId: TENANT, codigo: `ARM-130-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    const p = await db.produto.create({
      data: { tenantId: TENANT, sku: `SKU-130-A-${sufixo}`, nome: 'Artigo A', categoriaId: categoria.id, unidadeMedida: 'UN', precoVenda: 1000, precoCompra: 700, margemLucro: 0.3, taxaIva: 0.16 },
    });
    produtoA = p.id;
    await db.saldoStock.create({ data: { tenantId: TENANT, produtoId: produtoA, varianteProdutoId: '', localizacaoId, saldo: 1000, saldoReservado: 0 } });

    const serieNC = await db.serieDocumento.findFirst({ where: { tenantId: TENANT, tipo: 'NOTA_CREDITO', ativo: true } });
    expect(serieNC, 'fixture: série NOTA_CREDITO activa no bootstrap').not.toBeNull();

    const sc: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial: 5000 } as any, ctx));
    sessaoCaixaId = sc.id;
    const sp = await db.sessaoPOS.create({ data: { tenantId: TENANT, vendedorId: USER, sessaoCaixaId, status: 'ABERTA' } });
    sessaoPOSId = sp.id;

    // Outro tenant: uma devolução PENDENTE escrita pelo serviço (sem factura).
    const catB = await db.categoriaProduto.create({ data: { tenantId: OUTRO_TENANT, nome: 'Mercadorias' } });
    const pB = await db.produto.create({
      data: { tenantId: OUTRO_TENANT, sku: `SKU-130-B-${sufixo}`, nome: 'Artigo B', categoriaId: catB.id, unidadeMedida: 'UN', precoVenda: 500, precoCompra: 300, margemLucro: 0.3, taxaIva: 0.16 },
    });
    outroProduto = pB.id;
    const cliB = await db.cliente.create({
      data: {
        tenantId: OUTRO_TENANT,
        nome: 'Cliente B',
        tipo: 'JURIDICA',
        nuit: '400001302',
        email: `cli-dev130-b-${sufixo}@test.mz`,
        telefone: '840001302',
        codigo: `CLI-DEV130-B-${sufixo}`,
        diasPagamento: 30,
        limiteCreditoMT: 100_000,
      },
    });
    outroClienteId = cliB.id;
  }, 180_000);

  beforeEach(() => {
    sessao();
  });

  // ── A. Caminho da UI, pelas Server Actions ─────────────────────────────────

  it('A1: criar → aprovar → processar pelas actions: PROCESSADA, NC EMITIDA da factura, stock reentra', async () => {
    const { venda, fatura } = await venderA();

    const criada = await action('criarDevolucao')(inputDevolucao(venda, fatura));
    expect(criada.ok, JSON.stringify(criada)).toBe(true);
    const id = criada.data.id as string;
    expect((await lerDev(id)).status).toBe('PENDENTE');

    const aprovada = await action('aprovarDevolucao')({ id });
    expect(aprovada.ok, JSON.stringify(aprovada)).toBe(true);
    const depoisAprovar = await lerDev(id);
    expect(depoisAprovar.status).toBe('APROVADA');
    expect(depoisAprovar.aprovadoPorId).toBe(USER);

    const saldoAntes = await saldoA();
    const processada = await action('processarDevolucao')({ id, localizacaoId });
    expect(processada.ok, JSON.stringify(processada)).toBe(true);

    const d = await lerDev(id);
    expect(d.status).toBe('PROCESSADA');
    expect(d.processadoPorId).toBe(USER);
    expect(d.notaCreditoId, 'a devolução processada aponta para a NC').toBeTruthy();
    const nc = await db.notaCredito.findFirst({ where: { id: d.notaCreditoId, tenantId: TENANT } });
    expect(nc.status).toBe('EMITIDA');
    expect(nc.faturaOriginalId).toBe(fatura.id);
    expect(Number(String(nc.total)).toFixed(2)).toBe('1160.00');

    const mov = await db.movimentoStock.findMany({ where: { tenantId: TENANT, documentoReferenciaId: id } });
    expect(mov, 'uma entrada de stock pela linha devolvida').toHaveLength(1);
    expect(Number(String(mov[0].quantidade))).toBe(1);
    expect(mov[0].localizacaoDestinoId).toBe(localizacaoId);
    expect(await saldoA()).toBe(saldoAntes + 1);
  });

  it('A2: rejeitar uma PENDENTE → REJEITADA; aprovar e processar depois recusam TRANSICAO_INVALIDA e nada muda', async () => {
    const dev = await devolucaoPendente();

    const r = await action('rejeitarDevolucao')({ id: dev.id });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect((await lerDev(dev.id)).status).toBe('REJEITADA');

    const antes = await contagens();
    const a = await action('aprovarDevolucao')({ id: dev.id });
    expect(a.ok).toBe(false);
    expect(a.error?.code).toBe('TRANSICAO_INVALIDA');
    const p = await action('processarDevolucao')({ id: dev.id, localizacaoId });
    expect(p.ok).toBe(false);
    expect(p.error?.code).toBe('TRANSICAO_INVALIDA');

    const d = await lerDev(dev.id);
    expect(d.status).toBe('REJEITADA');
    expect(d.notaCreditoId).toBeNull();
    expect(await contagens()).toEqual(antes);
  });

  it('A3: criarTroca pela action de uma APROVADA (substituto de igual valor, sem pagamentos) → Troca, devolução PROCESSADA com NC, venda com Factura-Recibo', async () => {
    const dev = await devolucaoPendente();
    const ap = await action('aprovarDevolucao')({ id: dev.id });
    expect(ap.ok, JSON.stringify(ap)).toBe(true);
    const trocasAntes = await db.troca.count({ where: { tenantId: TENANT } });

    const r = await action('criarTroca')({
      devolucaoId: dev.id,
      novoItem: { produtoId: produtoA, nomeProduto: 'Artigo A', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 },
      pagamentos: [],
      localizacaoId,
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);

    expect(await db.troca.count({ where: { tenantId: TENANT } })).toBe(trocasAntes + 1);
    const troca = await db.troca.findFirst({ where: { tenantId: TENANT, devolucaoId: dev.id } });
    expect(troca, 'a troca fica ligada à devolução').not.toBeNull();
    expect(troca.numero).toMatch(/^TRC\/\d{4}\/\d{6}$/);
    expect(Number(String(troca.diferenca))).toBe(0);

    const d = await lerDev(dev.id);
    expect(d.status).toBe('PROCESSADA');
    expect(d.notaCreditoId).toBeTruthy();

    const venda = await db.venda.findFirst({ where: { id: troca.vendaSubstituicaoId, tenantId: TENANT } });
    expect(venda.faturaId, 'a venda de substituição tem Factura-Recibo').toBeTruthy();
    const fr = await db.fatura.findFirst({ where: { id: venda.faturaId, tenantId: TENANT } });
    expect(fr.status).toBe('PAGA');
  });

  it('A4: sem a permissão de cada action → SEM_PERMISSAO e nada muda', async () => {
    const dev = await devolucaoPendente();
    const antes = await contagens();

    sessao(PERMISSOES.filter((p) => p !== 'vendas:devolucoes:aprovar'));
    const a = await action('aprovarDevolucao')({ id: dev.id });
    expect(a.ok).toBe(false);
    expect(a.error?.code).toBe('SEM_PERMISSAO');

    sessao(PERMISSOES.filter((p) => p !== 'vendas:devolucoes:rejeitar'));
    const r = await action('rejeitarDevolucao')({ id: dev.id });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('SEM_PERMISSAO');

    expect((await lerDev(dev.id)).status).toBe('PENDENTE');

    sessao();
    expect((await action('aprovarDevolucao')({ id: dev.id })).ok).toBe(true);

    sessao(PERMISSOES.filter((p) => p !== 'vendas:devolucoes:processar'));
    const p = await action('processarDevolucao')({ id: dev.id, localizacaoId });
    expect(p.ok).toBe(false);
    expect(p.error?.code).toBe('SEM_PERMISSAO');

    sessao(PERMISSOES.filter((x) => x !== 'vendas:trocas:criar'));
    const t = await action('criarTroca')({
      devolucaoId: dev.id,
      novoItem: { produtoId: produtoA, nomeProduto: 'Artigo A', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 },
      pagamentos: [],
      localizacaoId,
    });
    expect(t.ok).toBe(false);
    expect(t.error?.code).toBe('SEM_PERMISSAO');

    expect((await lerDev(dev.id)).status).toBe('APROVADA');
    expect(await contagens()).toEqual(antes);
  });

  it('A5: devolução de outro tenant → NAO_ENCONTRADO em aprovar, rejeitar e processar; nada muda', async () => {
    const input = validacoes.CreateDevolucaoSchema.parse({
      clienteId: outroClienteId,
      motivo: 'DEFEITO',
      reembolso: false,
      itens: [{ produtoId: outroProduto, nomeProduto: 'Artigo B', quantidade: 1, valorUnitario: 500, taxaIva: 0.16 }],
    });
    const alheia: any = await runCtx(outroCtx, () => comercial.devolucaoService.criar(input, outroCtx));

    for (const [nome, extra] of [
      ['aprovarDevolucao', {}],
      ['rejeitarDevolucao', {}],
      ['processarDevolucao', { localizacaoId }],
    ] as const) {
      const r = await action(nome)({ id: alheia.id, ...extra });
      expect(r.ok, `${nome} sobre devolução alheia`).toBe(false);
      expect(r.error?.code, `${nome} sobre devolução alheia`).toBe('NAO_ENCONTRADO');
    }
    const d = await lerDev(alheia.id, OUTRO_TENANT);
    expect(d.status).toBe('PENDENTE');
    expect(d.aprovadoPorId).toBeNull();
    expect(d.aprovadoEm).toBeNull();
  });

  // ── B. aprovar/rejeitar compare-and-set ────────────────────────────────────

  /**
   * Outra transacção tranca a devolução (`FOR UPDATE`), espera, passa-a a `para` e faz commit.
   * Devolve o resultado da operação lançada enquanto a tranca estava em vigor.
   */
  async function correrContraTranca(devId: string, para: string, operacao: () => Promise<unknown>) {
    let libertar!: () => void;
    const gate = new Promise<void>((r) => (libertar = r));
    let sinalizarTranca!: () => void;
    const trancou = new Promise<void>((r) => (sinalizarTranca = r));

    const dono = db.$transaction(
      async (tx: any) => {
        await tx.$queryRaw`SELECT id FROM "Devolucao" WHERE id = ${devId} AND "tenantId" = ${TENANT} FOR UPDATE`;
        sinalizarTranca();
        await gate;
        await tx.$executeRaw`UPDATE "Devolucao" SET status = ${para}::"StatusDevolucao", "updatedAt" = now() WHERE id = ${devId} AND "tenantId" = ${TENANT}`;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    await trancou;
    let terminou = false;
    const pOperacao = capturarErro(operacao).then((e) => {
      terminou = true;
      return e;
    });
    await esperar(1_000);
    const terminouAntesDoCommit = terminou;
    libertar();
    await dono;
    const erro = await pOperacao;
    return { erro, terminouAntesDoCommit };
  }

  it('B1: «Aprovar» enquanto outra tx tem a devolução trancada e a REJEITA → espera e recusa TRANSICAO_INVALIDA; fica REJEITADA', async () => {
    const dev = await devolucaoPendente();

    const { erro, terminouAntesDoCommit } = await correrContraTranca(dev.id, 'REJEITADA', () => aprovarSvc(dev.id));

    expect(terminouAntesDoCommit, 'o aprovar não pode decidir antes de a outra tx libertar a devolução').toBe(false);
    expect(erro, 'o aprovar tinha de ser recusado: o estado que decide é o de depois da tranca').toBeDefined();
    expect(erro).toMatchObject({ name: 'BusinessRuleError', code: 'TRANSICAO_INVALIDA' });
    expect((await lerDev(dev.id)).status).toBe('REJEITADA');
  });

  it('B2: «Rejeitar» enquanto outra tx tem a devolução trancada e a PROCESSA → espera e recusa TRANSICAO_INVALIDA; fica PROCESSADA', async () => {
    // O «Rejeitar» parte de uma PENDENTE; enquanto espera, outra tx (o aprovar+processar de outro
    // operador, aqui reduzido à escrita do estado) deixa-a PROCESSADA e faz commit.
    const dev = await devolucaoPendente();

    const { erro, terminouAntesDoCommit } = await correrContraTranca(dev.id, 'PROCESSADA', () => rejeitarSvc(dev.id));

    expect(terminouAntesDoCommit, 'o rejeitar não pode decidir antes de a outra tx libertar a devolução').toBe(false);
    expect(erro, 'o rejeitar tinha de ser recusado: não pode carimbar REJEITADA por cima de uma PROCESSADA').toBeDefined();
    expect(erro).toMatchObject({ name: 'BusinessRuleError', code: 'TRANSICAO_INVALIDA' });
    expect((await lerDev(dev.id)).status).toBe('PROCESSADA');
  });

  for (const [titulo, opA, opB] of [
    ['aprovar × rejeitar', 'aprovar', 'rejeitar'],
    ['aprovar × aprovar', 'aprovar', 'aprovar'],
    ['rejeitar × rejeitar', 'rejeitar', 'rejeitar'],
  ] as const) {
    it(
      `B3: ${titulo} simultâneos → um passa, o outro TRANSICAO_INVALIDA; o estado final é o do vencedor`,
      async () => {
        const op = (nome: 'aprovar' | 'rejeitar', id: string) => (nome === 'aprovar' ? aprovarSvc(id) : rejeitarSvc(id));
        const destino = { aprovar: 'APROVADA', rejeitar: 'REJEITADA' } as const;

        for (let ronda = 1; ronda <= RONDAS; ronda++) {
          const dev = await devolucaoPendente();
          const resultados = await Promise.allSettled([op(opA, dev.id), op(opB, dev.id)]);
          const cumpridos = resultados
            .map((r, i) => ({ r, nome: i === 0 ? opA : opB }))
            .filter((x) => x.r.status === 'fulfilled');
          const rejeitados = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

          expect(cumpridos, `ronda ${ronda}: pedidos que passaram`).toHaveLength(1);
          expect(rejeitados, `ronda ${ronda}: pedidos recusados`).toHaveLength(1);
          expect(rejeitados[0].reason, `ronda ${ronda}: erro do perdedor`).toMatchObject({
            name: 'BusinessRuleError',
            code: 'TRANSICAO_INVALIDA',
          });
          const d = await lerDev(dev.id);
          expect(d.status, `ronda ${ronda}: estado final é o do vencedor`).toBe(destino[cumpridos[0].nome]);
        }
      },
      120_000,
    );
  }
});
