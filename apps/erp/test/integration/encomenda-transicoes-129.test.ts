/**
 * Oráculo B:encomenda-transicoes-129 — confirmar, converter e cancelar uma Encomenda de venda,
 * agora que a UI os vai ligar (#129; MINOR do #375: `transitar` lê o estado fora da tx).
 *
 * Contrato:
 *   1. `encomendaService.transitar({paraStatus:'CONFIRMADA', localizacaoId})` de um RASCUNHO
 *      reserva cada linha na localização (uma `ReservaStock` ATIVA por linha, `saldoReservado`
 *      sobe a quantidade) e passa a CONFIRMADA. Sem `localizacaoId` → `LOCALIZACAO_OBRIGATORIA`
 *      e nada muda.
 *   2. A transição é COMPARE-AND-SET: o estado de que parte é verificado na mesma tx que escreve
 *      (UPDATE … WHERE status = <lido>, ou leitura trancada). Dois pedidos simultâneos sobre a
 *      mesma encomenda nunca produzem efeitos duplicados nem estado incoerente:
 *        a. confirmar × confirmar → um passa, o outro é recusado com BusinessRuleError
 *           `TRANSICAO_INVALIDA` (o mesmo que um segundo pedido sequencial); reservas = linhas.
 *        b. confirmar × cancelar → qualquer ordem serializável é aceite, mas o fim é coerente:
 *           CANCELADA ⇒ zero reservas ATIVAS e `saldoReservado` de volta ao valor inicial;
 *           CONFIRMADA ⇒ não está apagada e tem exactamente uma reserva ATIVA por linha.
 *           Quem perde recebe um erro de domínio (BusinessRuleError ou NotFoundError), nunca um 500.
 *        c. cancelar × cancelar → um passa; `saldoReservado` volta exactamente ao inicial (nem
 *           abaixo); quem perde recebe BusinessRuleError ou NotFoundError (o cancelamento apaga
 *           logicamente, e um segundo cancelamento sequencial já dá NotFoundError).
 *        d. converter × converter → UMA venda, UM lançamento, UMA baixa de stock; quem perde
 *           recebe BusinessRuleError `ENCOMENDA_NAO_CONFIRMADA` (o mesmo que o pedido sequencial).
 *   3. `converterEmVenda` de uma CONFIRMADA: CONCLUIDA, `vendaId` gravado, reservas CONSUMIDAS,
 *      `saldo` desce a quantidade, lançamento D 411 / C 711 / C 44331 pelo total. Um segundo
 *      pedido → `ENCOMENDA_NAO_CONFIRMADA` e nenhuma venda nova.
 *   4. Cancelar uma CONFIRMADA liberta as reservas (`LIBERADA`, `saldoReservado` volta).
 *   5. Encomenda de outro tenant → NotFoundError; nada muda.
 *
 * A corrida repete-se em RONDAS (uma encomenda nova por ronda) para que o resultado não dependa
 * de um único entrelaçamento — molde de `lancamento-estorno-concorrente.test.ts`.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

const RONDAS = 5;
const QTD = 2;

describe.skipIf(skip)('encomenda: confirmar / converter / cancelar com compare-and-set (#129)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let encomendaService: any;
  let CreateEncomendaSchema: (typeof import('@/lib/validations/vendas'))['CreateEncomendaSchema'];
  let bootstrap: unknown;

  const sufixo = Date.now();
  const TENANT = `tenant-enc-trans-${sufixo}`;
  const OUTRO_TENANT = `tenant-enc-trans-outro-${sufixo}`;
  const USER = `cuenctrans${sufixo}`;
  const OUTRO_USER = `cuenctransb${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const outroCtx = { tenantId: OUTRO_TENANT, userId: OUTRO_USER };

  let produtoId: string;
  let localizacaoId: string;
  let clienteId: string;
  let outroProdutoId: string;
  let outroLocalizacaoId: string;
  let outroClienteId: string;

  const fx = (v: unknown) => Number(String(v)).toFixed(2);

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
      data: {
        id: tenantId,
        nome: `Tenant encomenda transições ${marca}`,
        slug: `enc-trans-${marca}-${sufixo}`,
        nuit: `${marca === 'a' ? 3 : 4}${String(sufixo).slice(-8)}`,
      },
    });
    await db.user.create({
      data: {
        id: userId,
        tenantId,
        email: `enc-trans-${marca}-${sufixo}@test.mz`,
        nome: `Vendedor ${marca}`,
        keycloakSub: `kc-enc-trans-${marca}-${sufixo}`,
      },
    });
    await db.$transaction((tx: any) => (bootstrap as any)(tx, tenantId), { timeout: 60_000 });
  }

  async function montarCatalogo(tenantId: string, marca: string, nuit: string) {
    const cat = await db.categoriaProduto.create({ data: { tenantId, nome: 'Mercadorias' } });
    const produto = await db.produto.create({
      data: {
        tenantId,
        sku: `SKU-ENC-TRANS-${marca}-${sufixo}`,
        nome: `Artigo ${marca}`,
        categoriaId: cat.id,
        unidadeMedida: 'UN',
        precoVenda: 1000,
        precoCompra: 500,
        margemLucro: 0.3,
        taxaIva: 0.16,
      },
    });
    const loc = await db.localizacao.create({
      data: { tenantId, codigo: `ARM-ENC-TRANS-${marca}-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    await db.saldoStock.create({
      data: { tenantId, produtoId: produto.id, varianteProdutoId: '', localizacaoId: loc.id, saldo: 10_000, saldoReservado: 0 },
    });
    const cliente = await db.cliente.create({
      data: {
        tenantId,
        nome: `Cliente ${marca}`,
        tipo: 'JURIDICA',
        nuit,
        email: `cli-enc-trans-${marca}-${sufixo}@test.mz`,
        telefone: `84${nuit.slice(-7)}`,
        codigo: `CLI-ENC-TRANS-${marca}-${sufixo}`,
        diasPagamento: 30,
        limiteCreditoMT: 1_000_000,
      },
    });
    return { produtoId: produto.id, localizacaoId: loc.id, clienteId: cliente.id };
  }

  /** Encomenda em RASCUNHO pelo caminho real: QTD × 1000, IVA 16% → total 2320,00. */
  async function encomendaRascunho(c = ctx, cli = clienteId, prod = produtoId) {
    const input = CreateEncomendaSchema.parse({
      clienteId: cli,
      itens: [{ produtoId: prod, nomeProduto: 'Artigo', quantidade: QTD, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 }],
    });
    const row: any = await runCtx(c, () => encomendaService.criar(input, c));
    const enc = await db.encomenda.findFirst({ where: { id: row.id, tenantId: c.tenantId } });
    expect(enc.status, 'fixture: encomenda nasce em RASCUNHO').toBe('RASCUNHO');
    expect(fx(enc.total), 'fixture: 2 × 1000 + 16%').toBe('2320.00');
    return enc;
  }

  /** `loc = null` envia o pedido sem `localizacaoId` (um `undefined` cairia no valor por omissão). */
  function confirmar(id: string, c = ctx, loc: string | null = localizacaoId) {
    const localizacao = loc === null ? {} : { localizacaoId: loc };
    return runCtx(c, () =>
      encomendaService.transitar({ encomendaId: id, paraStatus: 'CONFIRMADA', ...localizacao }, c),
    );
  }

  function cancelar(id: string, c = ctx) {
    return runCtx(c, () => encomendaService.transitar({ encomendaId: id, paraStatus: 'CANCELADA' }, c));
  }

  function converter(id: string, total = 2320, c = ctx) {
    return runCtx(c, () => encomendaService.converterEmVenda(id, [{ tipo: 'CREDITO', valor: total }], c, {}));
  }

  async function encomendaConfirmada() {
    const enc = await encomendaRascunho();
    await confirmar(enc.id);
    const e = await db.encomenda.findFirst({ where: { id: enc.id, tenantId: TENANT } });
    expect(e.status, 'fixture: encomenda confirmada').toBe('CONFIRMADA');
    return e;
  }

  async function saldo(tenantId = TENANT, prod = produtoId, loc = localizacaoId) {
    const s = await db.saldoStock.findFirst({ where: { tenantId, produtoId: prod, varianteProdutoId: '', localizacaoId: loc } });
    return { saldo: fx(s.saldo), reservado: fx(s.saldoReservado) };
  }

  async function reservas(encomendaId: string, tenantId = TENANT) {
    const rs = await db.reservaStock.findMany({ where: { tenantId, documentoReferenciaId: encomendaId } });
    return {
      ativas: rs.filter((r: any) => r.status === 'ATIVA').length,
      consumidas: rs.filter((r: any) => r.status === 'CONSUMIDA').length,
      liberadas: rs.filter((r: any) => r.status === 'LIBERADA').length,
      total: rs.length,
    };
  }

  async function vendasDaOrigemEncomenda(tenantId = TENANT) {
    return db.venda.count({ where: { tenantId, origem: 'ENCOMENDA' } });
  }

  async function lancamentosDeVendas(tenantId = TENANT) {
    const vendas = await db.venda.findMany({ where: { tenantId, origem: 'ENCOMENDA' }, select: { id: true } });
    if (vendas.length === 0) return 0;
    return db.lancamento.count({
      where: { tenantId, documentoOrigemId: { in: vendas.map((v: any) => v.id) } },
    });
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ encomendaService } = (await import('@/server/services/comercial')) as any);
    ({ CreateEncomendaSchema } = await import('@/lib/validations/vendas'));
    ({ bootstrapContabilidade: bootstrap } = await import('@/server/provisioning/tenant-bootstrap'));

    await montarTenant(TENANT, USER, 'a');
    await montarTenant(OUTRO_TENANT, OUTRO_USER, 'b');
    ({ produtoId, localizacaoId, clienteId } = await montarCatalogo(TENANT, 'a', '400001291'));
    ({
      produtoId: outroProdutoId,
      localizacaoId: outroLocalizacaoId,
      clienteId: outroClienteId,
    } = await montarCatalogo(OUTRO_TENANT, 'b', '400001292'));
  }, 120_000);

  // ── 1. Confirmar (sequencial) ──────────────────────────────────────────────

  it('1: confirmar com localização reserva cada linha e passa a CONFIRMADA', async () => {
    const enc = await encomendaRascunho();
    const antes = await saldo();

    await confirmar(enc.id);

    const depois = await db.encomenda.findFirst({ where: { id: enc.id, tenantId: TENANT } });
    expect(depois.status).toBe('CONFIRMADA');
    expect(depois.deletedAt).toBeNull();
    expect(await reservas(enc.id)).toMatchObject({ ativas: 1, total: 1 });
    const s = await saldo();
    expect(s.saldo, 'confirmar não mexe no saldo físico').toBe(antes.saldo);
    expect(Number(s.reservado) - Number(antes.reservado)).toBe(QTD);
  });

  it('1: confirmar sem localização → LOCALIZACAO_OBRIGATORIA e nada muda', async () => {
    const enc = await encomendaRascunho();
    const antes = await saldo();

    const erro = await capturarErro(() => confirmar(enc.id, ctx, null));
    expect(erro, 'confirmar sem localização tinha de ser recusado').toBeDefined();
    expect(erro).toMatchObject({ name: 'BusinessRuleError', code: 'LOCALIZACAO_OBRIGATORIA' });

    const depois = await db.encomenda.findFirst({ where: { id: enc.id, tenantId: TENANT } });
    expect(depois.status).toBe('RASCUNHO');
    expect(await reservas(enc.id)).toMatchObject({ total: 0 });
    expect(await saldo()).toEqual(antes);
  });

  it('1: confirmar uma segunda vez (sequencial) → TRANSICAO_INVALIDA e nenhuma reserva extra', async () => {
    const enc = await encomendaConfirmada();
    const antes = await saldo();

    const erro = await capturarErro(() => confirmar(enc.id));
    expect(erro).toMatchObject({ name: 'BusinessRuleError', code: 'TRANSICAO_INVALIDA' });
    expect(await reservas(enc.id)).toMatchObject({ ativas: 1, total: 1 });
    expect(await saldo()).toEqual(antes);
  });

  // ── 2a. confirmar × confirmar ──────────────────────────────────────────────

  it(
    '2a: dois «Confirmar» simultâneos → um passa, o outro TRANSICAO_INVALIDA; uma reserva por linha',
    async () => {
      for (let ronda = 1; ronda <= RONDAS; ronda++) {
        const enc = await encomendaRascunho();
        const antes = await saldo();

        const resultados = await Promise.allSettled([confirmar(enc.id), confirmar(enc.id)]);
        const cumpridos = resultados.filter((r) => r.status === 'fulfilled');
        const rejeitados = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

        expect(cumpridos, `ronda ${ronda}: pedidos que passaram`).toHaveLength(1);
        expect(rejeitados, `ronda ${ronda}: pedidos recusados`).toHaveLength(1);
        expect(rejeitados[0].reason, `ronda ${ronda}: erro do perdedor`).toMatchObject({
          name: 'BusinessRuleError',
          code: 'TRANSICAO_INVALIDA',
        });

        const e = await db.encomenda.findFirst({ where: { id: enc.id, tenantId: TENANT } });
        expect(e.status, `ronda ${ronda}: estado final`).toBe('CONFIRMADA');
        expect(await reservas(enc.id), `ronda ${ronda}: reservas`).toMatchObject({ ativas: 1, total: 1 });
        const s = await saldo();
        expect(Number(s.reservado) - Number(antes.reservado), `ronda ${ronda}: saldoReservado subiu UMA vez`).toBe(QTD);
      }
    },
    120_000,
  );

  // ── 2b. confirmar × cancelar ───────────────────────────────────────────────

  it(
    '2b: «Confirmar» e «Cancelar» simultâneos → fim coerente (sem reserva órfã numa cancelada)',
    async () => {
      for (let ronda = 1; ronda <= RONDAS; ronda++) {
        const enc = await encomendaRascunho();
        const antes = await saldo();

        const resultados = await Promise.allSettled([confirmar(enc.id), cancelar(enc.id)]);
        for (const r of resultados) {
          if (r.status === 'rejected') {
            expect(
              ['BusinessRuleError', 'NotFoundError'],
              `ronda ${ronda}: perdedor tem de receber erro de domínio, recebeu ${r.reason?.name}: ${r.reason?.message}`,
            ).toContain(r.reason?.name);
          }
        }
        expect(
          resultados.some((r) => r.status === 'fulfilled'),
          `ronda ${ronda}: pelo menos um pedido passa`,
        ).toBe(true);

        const e = await db.encomenda.findFirst({ where: { id: enc.id, tenantId: TENANT } });
        const rs = await reservas(enc.id);
        const s = await saldo();
        expect(['CONFIRMADA', 'CANCELADA'], `ronda ${ronda}: estado final`).toContain(e.status);
        if (e.status === 'CANCELADA') {
          expect(rs.ativas, `ronda ${ronda}: cancelada sem reservas ATIVAS`).toBe(0);
          expect(s.reservado, `ronda ${ronda}: cancelada devolve o saldoReservado`).toBe(antes.reservado);
        } else {
          expect(e.deletedAt, `ronda ${ronda}: confirmada não está apagada`).toBeNull();
          expect(rs.ativas, `ronda ${ronda}: confirmada com uma reserva por linha`).toBe(1);
          expect(Number(s.reservado) - Number(antes.reservado), `ronda ${ronda}: reservado`).toBe(QTD);
        }
      }
    },
    120_000,
  );

  // ── 2c. cancelar × cancelar ────────────────────────────────────────────────

  it(
    '2c: dois «Cancelar» simultâneos numa CONFIRMADA → um passa; saldoReservado volta exactamente ao inicial',
    async () => {
      for (let ronda = 1; ronda <= RONDAS; ronda++) {
        const base = await saldo();
        const enc = await encomendaConfirmada();

        const resultados = await Promise.allSettled([cancelar(enc.id), cancelar(enc.id)]);
        const cumpridos = resultados.filter((r) => r.status === 'fulfilled');
        const rejeitados = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

        expect(cumpridos, `ronda ${ronda}: pedidos que passaram`).toHaveLength(1);
        expect(rejeitados, `ronda ${ronda}: pedidos recusados`).toHaveLength(1);
        expect(
          ['BusinessRuleError', 'NotFoundError'],
          `ronda ${ronda}: perdedor recebeu ${rejeitados[0].reason?.name}: ${rejeitados[0].reason?.message}`,
        ).toContain(rejeitados[0].reason?.name);
        if (rejeitados[0].reason?.name === 'BusinessRuleError') {
          expect(rejeitados[0].reason.code, `ronda ${ronda}: código do perdedor`).toBe('TRANSICAO_INVALIDA');
        }

        const e = await db.encomenda.findFirst({ where: { id: enc.id, tenantId: TENANT } });
        expect(e.status).toBe('CANCELADA');
        expect(await reservas(enc.id), `ronda ${ronda}: reservas`).toMatchObject({ ativas: 0, liberadas: 1, total: 1 });
        expect(await saldo(), `ronda ${ronda}: saldo/reservado de volta ao inicial`).toEqual(base);
      }
    },
    120_000,
  );

  // ── 3. Converter (sequencial) ──────────────────────────────────────────────

  it('3: converter uma CONFIRMADA → CONCLUIDA, vendaId, reserva consumida, saldo desce, lançamento pelo total', async () => {
    const enc = await encomendaConfirmada();
    const antes = await saldo();
    const vendasAntes = await vendasDaOrigemEncomenda();

    const r: any = await converter(enc.id);
    expect(r.vendaId).toBeTruthy();

    const e = await db.encomenda.findFirst({ where: { id: enc.id, tenantId: TENANT } });
    expect(e.status).toBe('CONCLUIDA');
    expect(e.vendaId).toBe(r.vendaId);
    expect(await vendasDaOrigemEncomenda()).toBe(vendasAntes + 1);

    const venda = await db.venda.findFirst({ where: { id: r.vendaId, tenantId: TENANT } });
    expect(fx(venda.total)).toBe('2320.00');

    expect(await reservas(enc.id)).toMatchObject({ ativas: 0, consumidas: 1, total: 1 });
    const s = await saldo();
    expect(Number(antes.saldo) - Number(s.saldo), 'saldo físico desce a quantidade').toBe(QTD);
    expect(Number(antes.reservado) - Number(s.reservado), 'reservado desce a quantidade').toBe(QTD);

    const lancs = await db.lancamento.findMany({
      where: { tenantId: TENANT, documentoOrigemId: r.vendaId },
      include: { partidas: true },
    });
    expect(lancs, 'um lançamento pela venda').toHaveLength(1);
    const contas = await db.contaPGC.findMany({
      where: { tenantId: TENANT, id: { in: lancs[0].partidas.map((p: any) => p.contaId) } },
      select: { id: true, codigo: true },
    });
    const codigoDe = new Map(contas.map((c: any) => [c.id, c.codigo]));
    const resumo = lancs[0].partidas
      .map((p: any) => `${p.tipo}|${codigoDe.get(p.contaId)}|${fx(p.valor)}`)
      .sort();
    expect(resumo).toEqual(['CREDITO|44331|320.00', 'CREDITO|711|2000.00', 'DEBITO|411|2320.00']);
  });

  it('3: converter duas vezes (sequencial) → ENCOMENDA_NAO_CONFIRMADA e nenhuma venda nova', async () => {
    const enc = await encomendaConfirmada();
    await converter(enc.id);
    const vendasAntes = await vendasDaOrigemEncomenda();
    const antes = await saldo();

    const erro = await capturarErro(() => converter(enc.id));
    expect(erro).toMatchObject({ name: 'BusinessRuleError', code: 'ENCOMENDA_NAO_CONFIRMADA' });
    expect(await vendasDaOrigemEncomenda()).toBe(vendasAntes);
    expect(await saldo()).toEqual(antes);
  });

  it('3: converter um RASCUNHO → ENCOMENDA_NAO_CONFIRMADA e nada muda', async () => {
    const enc = await encomendaRascunho();
    const vendasAntes = await vendasDaOrigemEncomenda();

    const erro = await capturarErro(() => converter(enc.id));
    expect(erro).toMatchObject({ name: 'BusinessRuleError', code: 'ENCOMENDA_NAO_CONFIRMADA' });
    const e = await db.encomenda.findFirst({ where: { id: enc.id, tenantId: TENANT } });
    expect(e.status).toBe('RASCUNHO');
    expect(await vendasDaOrigemEncomenda()).toBe(vendasAntes);
  });

  // ── 2d. converter × converter ──────────────────────────────────────────────

  it(
    '2d: dois «Converter em Venda» simultâneos → UMA venda, UM lançamento, UMA baixa; o outro ENCOMENDA_NAO_CONFIRMADA',
    async () => {
      for (let ronda = 1; ronda <= RONDAS; ronda++) {
        const enc = await encomendaConfirmada();
        const antes = await saldo();
        const vendasAntes = await vendasDaOrigemEncomenda();
        const lancsAntes = await lancamentosDeVendas();

        const resultados = await Promise.allSettled([converter(enc.id), converter(enc.id)]);
        const cumpridos = resultados.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled');
        const rejeitados = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

        expect(await vendasDaOrigemEncomenda(), `ronda ${ronda}: vendas criadas`).toBe(vendasAntes + 1);
        expect(await lancamentosDeVendas(), `ronda ${ronda}: lançamentos criados`).toBe(lancsAntes + 1);
        expect(cumpridos, `ronda ${ronda}: pedidos que passaram`).toHaveLength(1);
        expect(rejeitados, `ronda ${ronda}: pedidos recusados`).toHaveLength(1);
        expect(rejeitados[0].reason, `ronda ${ronda}: erro do perdedor`).toMatchObject({
          name: 'BusinessRuleError',
          code: 'ENCOMENDA_NAO_CONFIRMADA',
        });

        const e = await db.encomenda.findFirst({ where: { id: enc.id, tenantId: TENANT } });
        expect(e.status).toBe('CONCLUIDA');
        expect(e.vendaId, `ronda ${ronda}: vendaId é o da venda que passou`).toBe(cumpridos[0].value.vendaId);
        const s = await saldo();
        expect(Number(antes.saldo) - Number(s.saldo), `ronda ${ronda}: saldo desce UMA vez`).toBe(QTD);
        expect(Number(antes.reservado) - Number(s.reservado), `ronda ${ronda}: reservado desce UMA vez`).toBe(QTD);
      }
    },
    180_000,
  );

  // ── 4. Cancelar uma CONFIRMADA (sequencial) ────────────────────────────────

  it('4: cancelar uma CONFIRMADA liberta as reservas e devolve o saldoReservado', async () => {
    const base = await saldo();
    const enc = await encomendaConfirmada();

    await cancelar(enc.id);

    const e = await db.encomenda.findFirst({ where: { id: enc.id, tenantId: TENANT } });
    expect(e.status).toBe('CANCELADA');
    expect(await reservas(enc.id)).toMatchObject({ ativas: 0, liberadas: 1, total: 1 });
    expect(await saldo()).toEqual(base);
  });

  it('4: cancelar uma CONCLUIDA → recusado com erro de domínio; venda e estado intactos', async () => {
    const enc = await encomendaConfirmada();
    await converter(enc.id);
    const antes = await db.encomenda.findFirst({ where: { id: enc.id, tenantId: TENANT } });

    const erro = await capturarErro(() => cancelar(enc.id));
    expect(erro).toMatchObject({ name: 'BusinessRuleError', code: 'TRANSICAO_INVALIDA' });
    const depois = await db.encomenda.findFirst({ where: { id: enc.id, tenantId: TENANT } });
    expect(depois.status).toBe('CONCLUIDA');
    expect(depois.deletedAt).toBeNull();
    expect(depois.vendaId).toBe(antes.vendaId);
  });

  // ── 5. Isolamento ──────────────────────────────────────────────────────────

  it('5: confirmar / converter / cancelar encomenda de outro tenant → NotFoundError e nada muda', async () => {
    const alheia = await encomendaRascunho(outroCtx, outroClienteId, outroProdutoId);
    const saldoAlheioAntes = await saldo(OUTRO_TENANT, outroProdutoId, outroLocalizacaoId);

    const e1 = await capturarErro(() => confirmar(alheia.id, ctx, localizacaoId));
    expect(e1?.name).toBe('NotFoundError');
    const e2 = await capturarErro(() => cancelar(alheia.id, ctx));
    expect(e2?.name).toBe('NotFoundError');
    const e3 = await capturarErro(() => converter(alheia.id, 2320, ctx));
    expect(e3?.name).toBe('NotFoundError');

    const depois = await db.encomenda.findFirst({ where: { id: alheia.id, tenantId: OUTRO_TENANT } });
    expect(depois.status).toBe('RASCUNHO');
    expect(depois.deletedAt).toBeNull();
    expect(await reservas(alheia.id, OUTRO_TENANT)).toMatchObject({ total: 0 });
    expect(await reservas(alheia.id, TENANT)).toMatchObject({ total: 0 });
    expect(await saldo(OUTRO_TENANT, outroProdutoId, outroLocalizacaoId)).toEqual(saldoAlheioAntes);
  });
});
