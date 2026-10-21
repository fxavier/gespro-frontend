/**
 * Oráculo #612 — regularização das vendas convertidas de encomenda antes do #608 (#563).
 *
 * Estado antigo (montado pelos contratos): venda `origem ENCOMENDA`, `FATURADA`, sem `faturaId`, e
 * um lançamento D 411 / C 711 / C 44331 com `documentoOrigemTipo 'Venda'` e origem na venda.
 *
 * Contrato da regularização (D1–D3 da corrida 612):
 *   a. A crédito → Factura (série FATURA) ligada nos dois sentidos, lançamento antigo ESTORNADO,
 *      estorno e factura com a data do lançamento antigo; o efeito em 411/711/44331 é o de uma
 *      conversão nova pelo `converterEmVenda`. O dry-run (omissão) não escreve nada.
 *   b. Paga a pronto → Factura-Recibo PAGA; a 411 fica com efeito líquido zero.
 *   c. Idempotente: a segunda corrida não escreve nada.
 *   d. Período com IVA apurado → nada escrito para essa venda, motivo `PERIODO_IVA_APURADO`.
 *   e. Período fechado → nada escrito para essa venda, motivo `PERIODO_FECHADO`.
 *   g. Venda regularizada por outra corrida enquanto esta esperava pela tranca → SALTADA, nada escrito.
 *   h. Factura viva já apontada à venda → `VENDA_JA_COM_DOCUMENTO`, nada escrito.
 *   i. Venda com devolução → `VENDA_COM_DEVOLUCAO`, nada escrito.
 *   f. Depois de correr, a consulta da issue só devolve as vendas bloqueadas.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

// `converterEmVenda` (termo de comparação do caso a) verifica o e-mail pela sessão.
vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { emailVerificado: true } }) }));

const CONTAS = ['411', '711', '44331'] as const;

describe.skipIf(skip)('regularizar vendas de encomenda sem documento fiscal (#612)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let encomendaService: any;
  let regularizar: (typeof import('@/server/services/comercial/regularizacao-encomenda.service'))['regularizarVendasEncomenda'];
  let porRegularizar: (typeof import('@/server/services/comercial/regularizacao-encomenda.service'))['vendasEncomendaPorRegularizar'];
  let registarLancamento: (typeof import('@/server/services/financas/contabilidade.service'))['registarLancamentoContabilistico'];
  let proximoNumeroSerie: (typeof import('@/server/services/financas/faturacao.service'))['proximoNumeroSerie'];
  let CreateEncomendaSchema: (typeof import('@/lib/validations/vendas'))['CreateEncomendaSchema'];

  const sufixo = Date.now();
  const TENANT = `tenant-reg-enc-612-${sufixo}`;
  const USER = `curegenc612${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const ANO = Number(new Intl.DateTimeFormat('en', { timeZone: 'Africa/Maputo', year: 'numeric' }).format(new Date()));
  /** 10:00 de Maputo do dia indicado (mês 1-12) do ano corrente. */
  const dia = (mes: number, d: number) => new Date(Date.UTC(ANO, mes - 1, d, 8, 0, 0));

  let produtoId: string;
  let localizacaoId: string;
  let clienteId: string;

  const fx = (v: unknown) => Number(String(v)).toFixed(2);

  /** Saldo devedor (D − C) das contas, contando lançamentos com efeito (LANCADO + ESTORNADO). */
  async function saldos(): Promise<Record<string, string>> {
    const contas = await db.contaPGC.findMany({
      where: { tenantId: TENANT, codigo: { in: [...CONTAS] } },
      select: { id: true, codigo: true },
    });
    const out: Record<string, string> = {};
    for (const c of contas) {
      const partidas = await db.partidaLancamento.findMany({
        where: { contaId: c.id, lancamento: { tenantId: TENANT, status: { in: ['LANCADO', 'ESTORNADO'] } } },
        select: { tipo: true, valor: true },
      });
      const s = partidas.reduce(
        (a: number, p: any) => a + (p.tipo === 'DEBITO' ? 1 : -1) * Number(String(p.valor)),
        0,
      );
      out[c.codigo] = s.toFixed(2);
    }
    return out;
  }

  const delta = (antes: Record<string, string>, depois: Record<string, string>) =>
    Object.fromEntries(CONTAS.map((c) => [c, (Number(depois[c]) - Number(antes[c])).toFixed(2)]));

  /**
   * O estado que o `converterEmVenda` anterior ao #608 deixava: venda FATURADA sem factura e
   * um lançamento D 411 / C 711 / C 44331 com origem na venda — QTD 2 × 1000 + 16% = 2320,00.
   */
  async function vendaAntiga(data: Date, pagamentos: Array<{ tipo: string; valor: number }>) {
    return runCtx(ctx, () =>
      db.$transaction(async (tx: any) => {
        const numero = await proximoNumeroSerie(tx, 'VENDA', ctx, data);
        const venda = await tx.venda.create({
          data: {
            tenantId: TENANT,
            numero,
            origem: 'ENCOMENDA',
            status: 'FATURADA',
            clienteId,
            vendedorId: USER,
            subtotal: 2000,
            descontoTotal: 0,
            ivaTotal: 320,
            total: 2320,
            createdAt: data,
            itens: {
              create: [
                {
                  tenantId: TENANT,
                  produtoId,
                  nomeProduto: 'Artigo 612',
                  quantidade: 2,
                  precoUnitario: 1000,
                  desconto: 0,
                  taxaIva: 0.16,
                  subtotal: 2000,
                  ivaItem: 320,
                  total: 2320,
                },
              ],
            },
            pagamentos: { create: pagamentos.map((p) => ({ tenantId: TENANT, tipo: p.tipo, valor: p.valor })) },
          },
        });
        const lancamento = await registarLancamento(
          tx,
          {
            data,
            diarioTipo: 'VENDAS',
            origem: 'VENDA',
            documentoOrigemId: venda.id,
            documentoOrigemTipo: 'Venda',
            historico: `Conversão de encomenda — Venda ${numero}`,
            partidas: [
              { contaCodigo: '411', tipo: 'DEBITO', valor: '2320.00', historico: 'Encomenda → Venda' },
              { contaCodigo: '711', tipo: 'CREDITO', valor: '2000.00', historico: 'receita' },
              { contaCodigo: '44331', tipo: 'CREDITO', valor: '320.00', historico: 'IVA liquidado' },
            ],
          },
          ctx,
        );
        return { vendaId: venda.id as string, lancamentoId: lancamento.id as string };
      }),
    );
  }

  async function contagens() {
    const series = await db.serieDocumento.findMany({
      where: { tenantId: TENANT, tipo: { in: ['FATURA', 'FATURA_RECIBO'] } },
      select: { id: true, proximoNumero: true },
      orderBy: { id: 'asc' },
    });
    return {
      faturas: await db.fatura.count({ where: { tenantId: TENANT } }),
      lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
      partidas: await db.partidaLancamento.count({ where: { tenantId: TENANT } }),
      historico: await db.historicoTransacao.count({ where: { tenantId: TENANT } }),
      vendasSemFatura: await db.venda.count({ where: { tenantId: TENANT, faturaId: null } }),
      series: series.map((x: any) => `${x.id}:${x.proximoNumero}`),
    };
  }

  /** Partidas de um lançamento como `TIPO|conta|valor`, ordenadas. */
  async function resumoPartidas(lancamentoId: string) {
    const partidas = await db.partidaLancamento.findMany({ where: { lancamentoId } });
    const contas = await db.contaPGC.findMany({
      where: { tenantId: TENANT, id: { in: partidas.map((p: any) => p.contaId) } },
      select: { id: true, codigo: true },
    });
    const codigoDe = new Map(contas.map((c: any) => [c.id, c.codigo]));
    return partidas.map((p: any) => `${p.tipo}|${codigoDe.get(p.contaId)}|${fx(p.valor)}`).sort();
  }

  let emitirDocumentoEmTx: (typeof import('@/server/services/financas/faturacao.service'))['emitirDocumentoEmTx'];

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ encomendaService } = (await import('@/server/services/comercial')) as any);
    ({ regularizarVendasEncomenda: regularizar, vendasEncomendaPorRegularizar: porRegularizar } = await import(
      '@/server/services/comercial/regularizacao-encomenda.service'
    ));
    ({ registarLancamentoContabilistico: registarLancamento } = await import(
      '@/server/services/financas/contabilidade.service'
    ));
    ({ proximoNumeroSerie, emitirDocumentoEmTx } = await import('@/server/services/financas/faturacao.service'));
    ({ CreateEncomendaSchema } = await import('@/lib/validations/vendas'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant regularizar #612', slug: `reg-enc-612-${sufixo}`, nuit: `6${String(sufixo).slice(-8)}` },
    });
    await db.user.create({
      data: {
        id: USER,
        tenantId: TENANT,
        email: `reg-enc-612-${sufixo}@test.mz`,
        nome: 'Vendedor 612',
        keycloakSub: `kc-reg-enc-612-${sufixo}`,
      },
    });
    await db.$transaction((tx: any) => (bootstrapContabilidade as any)(tx, TENANT), { timeout: 60_000 });

    const cat = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const produto = await db.produto.create({
      data: {
        tenantId: TENANT,
        sku: `SKU-REG-612-${sufixo}`,
        nome: 'Artigo 612',
        categoriaId: cat.id,
        unidadeMedida: 'UN',
        precoVenda: 1000,
        precoCompra: 500,
        margemLucro: 0.3,
        taxaIva: 0.16,
      },
    });
    const loc = await db.localizacao.create({
      data: { tenantId: TENANT, codigo: `ARM-REG-612-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    await db.saldoStock.create({
      data: { tenantId: TENANT, produtoId: produto.id, varianteProdutoId: '', localizacaoId: loc.id, saldo: 10_000, saldoReservado: 0 },
    });
    const cliente = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente 612',
        tipo: 'JURIDICA',
        nuit: '400006121',
        email: `cli-reg-612-${sufixo}@test.mz`,
        telefone: '840006121',
        codigo: `CLI-REG-612-${sufixo}`,
        diasPagamento: 30,
        limiteCreditoMT: 1_000_000,
      },
    });
    produtoId = produto.id;
    localizacaoId = loc.id;
    clienteId = cliente.id;
  }, 120_000);

  it('a: a crédito → dry-run não escreve; aplicar emite FAT ligada com a data original, estorna o antigo, e o efeito iguala o converterEmVenda', async () => {
    const data = dia(3, 10);
    const s0 = await saldos();
    const { vendaId, lancamentoId } = await vendaAntiga(data, [{ tipo: 'CREDITO', valor: 2320 }]);

    // Dry-run (omissão): relata, não escreve.
    const antes = await contagens();
    const simulado = await regularizar(TENANT, { aplicar: false });
    expect(simulado).toHaveLength(1);
    expect(simulado[0]).toMatchObject({ vendaId, estado: 'SIMULADA', documento: 'FATURA', total: '2320.00' });
    expect(await contagens(), 'dry-run não escreve').toEqual(antes);

    const r = await regularizar(TENANT, { aplicar: true });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ vendaId, estado: 'REGULARIZADA', documento: 'FATURA' });
    expect(r[0].faturaNumero, 'o dry-run previu o número emitido').toBe(simulado[0].faturaNumero);

    const venda = await db.venda.findFirst({ where: { id: vendaId, tenantId: TENANT } });
    const fatura = await db.fatura.findFirst({
      where: { tenantId: TENANT, vendaId },
      include: { serieDocumento: { select: { tipo: true } } },
    });
    expect(fatura, 'factura emitida pela venda').toBeTruthy();
    expect(venda.faturaId, 'Venda.faturaId ↔ Fatura.vendaId').toBe(fatura.id);
    expect(fatura.serieDocumento.tipo).toBe('FATURA');
    expect(fatura.status).toBe('EMITIDA');
    expect(fx(fatura.total)).toBe('2320.00');
    expect(fatura.lancamentoId).toBeTruthy();
    expect(fatura.dataEmissao.toISOString(), 'factura com a data original').toBe(data.toISOString());
    expect(fatura.numero).toContain(String(ANO));

    const antigo = await db.lancamento.findFirst({ where: { id: lancamentoId, tenantId: TENANT } });
    expect(antigo.status).toBe('ESTORNADO');
    const estorno = await db.lancamento.findFirst({ where: { tenantId: TENANT, lancamentoEstornoId: lancamentoId } });
    expect(estorno, 'lançamento de estorno').toBeTruthy();
    expect(estorno.data.toISOString(), 'estorno com a data original').toBe(data.toISOString());

    const s1 = await saldos();
    const efeitoRegularizacao = delta(s0, s1);

    // Termo de comparação: uma conversão nova pela via actual.
    const input = CreateEncomendaSchema.parse({
      clienteId,
      itens: [{ produtoId, nomeProduto: 'Artigo 612', quantidade: 2, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 }],
    });
    const enc: any = await runCtx(ctx, () => encomendaService.criar(input, ctx));
    await runCtx(ctx, () =>
      encomendaService.transitar({ encomendaId: enc.id, paraStatus: 'CONFIRMADA', localizacaoId }, ctx),
    );
    const s2 = await saldos();
    await runCtx(ctx, () => encomendaService.converterEmVenda(enc.id, [{ tipo: 'CREDITO', valor: 2320 }], ctx, {}));
    const efeitoConversaoNova = delta(s2, await saldos());

    expect(efeitoConversaoNova).toEqual({ '411': '2320.00', '711': '-2000.00', '44331': '-320.00' });
    expect(efeitoRegularizacao).toEqual(efeitoConversaoNova);
  });

  it('b: paga a pronto → Factura-Recibo PAGA e a 411 fica com efeito líquido zero', async () => {
    const s0 = await saldos();
    const { vendaId } = await vendaAntiga(dia(4, 10), [{ tipo: 'TRANSFERENCIA', valor: 2320 }]);

    const r = await regularizar(TENANT, { aplicar: true });
    expect(r.find((x: any) => x.vendaId === vendaId)).toMatchObject({ estado: 'REGULARIZADA', documento: 'FATURA_RECIBO' });

    const fatura = await db.fatura.findFirst({
      where: { tenantId: TENANT, vendaId },
      include: { serieDocumento: { select: { tipo: true } } },
    });
    expect(fatura.serieDocumento.tipo).toBe('FATURA_RECIBO');
    expect(fatura.status).toBe('PAGA');
    const venda = await db.venda.findFirst({ where: { id: vendaId, tenantId: TENANT } });
    expect(venda.faturaId).toBe(fatura.id);
    expect(await resumoPartidas(fatura.lancamentoId), 'débito na conta do meio (TRANSFERENCIA → 121)').toEqual([
      'CREDITO|44331|320.00',
      'CREDITO|711|2000.00',
      'DEBITO|121|2320.00',
    ]);

    expect(delta(s0, await saldos())).toEqual({ '411': '0.00', '711': '-2000.00', '44331': '-320.00' });
  });

  it('c: idempotente — a segunda corrida não encontra nada e não escreve', async () => {
    const antes = await contagens();
    const r = await regularizar(TENANT, { aplicar: true });
    expect(r).toEqual([]);
    expect(await contagens()).toEqual(antes);
  });

  it('d: período com IVA apurado → nada escrito para essa venda, motivo PERIODO_IVA_APURADO', async () => {
    const data = dia(1, 15);
    const { vendaId, lancamentoId } = await vendaAntiga(data, [{ tipo: 'CREDITO', valor: 2320 }]);
    const periodo = await db.periodoContabil.findFirst({ where: { tenantId: TENANT, codigo: `${ANO}-01` } });
    expect(periodo, 'fixture: período de Janeiro').toBeTruthy();
    await db.apuramentoIva.create({
      data: {
        tenantId: TENANT,
        periodoId: periodo.id,
        versao: 1,
        estado: 'APURADO',
        totalIvaLiquidado: 320,
        totalIvaDedutivel: 0,
        totalRegularizacoes: 0,
        saldoApuramento: 320,
        apuradoPorId: USER,
        keycloakSub: `kc-reg-enc-612-${sufixo}`,
      },
    });

    const simulado = await regularizar(TENANT, { aplicar: false });
    expect(simulado.find((x: any) => x.vendaId === vendaId)).toMatchObject({
      estado: 'BLOQUEADA',
      motivo: { codigo: 'PERIODO_IVA_APURADO' },
    });

    const antes = await contagens();
    const r = await regularizar(TENANT, { aplicar: true });
    expect(r.find((x: any) => x.vendaId === vendaId)).toMatchObject({
      estado: 'BLOQUEADA',
      motivo: { codigo: 'PERIODO_IVA_APURADO' },
    });
    expect(await contagens(), 'nada escrito').toEqual(antes);
    const antigo = await db.lancamento.findFirst({ where: { id: lancamentoId, tenantId: TENANT } });
    expect(antigo.status).toBe('LANCADO');
  });

  it('e: período fechado → nada escrito para essa venda (as outras seguem), motivo PERIODO_FECHADO', async () => {
    const fechada = await vendaAntiga(dia(2, 15), [{ tipo: 'CREDITO', valor: 2320 }]);
    await db.periodoContabil.updateMany({ where: { tenantId: TENANT, codigo: `${ANO}-02` }, data: { estado: 'FECHADO' } });
    const aberta = await vendaAntiga(dia(5, 15), [{ tipo: 'CREDITO', valor: 2320 }]);

    const r = await regularizar(TENANT, { aplicar: true });
    expect(r.find((x: any) => x.vendaId === fechada.vendaId)).toMatchObject({
      estado: 'BLOQUEADA',
      motivo: { codigo: 'PERIODO_FECHADO' },
    });
    expect(r.find((x: any) => x.vendaId === aberta.vendaId), 'a venda seguinte regulariza na mesma').toMatchObject({
      estado: 'REGULARIZADA',
    });

    const venda = await db.venda.findFirst({ where: { id: fechada.vendaId, tenantId: TENANT } });
    expect(venda.faturaId).toBeNull();
    expect(await db.fatura.count({ where: { tenantId: TENANT, vendaId: fechada.vendaId } })).toBe(0);
    const antigo = await db.lancamento.findFirst({ where: { id: fechada.lancamentoId, tenantId: TENANT } });
    expect(antigo.status).toBe('LANCADO');
  });

  it('g: regularizada por outra corrida enquanto esperava pela tranca → SALTADA e nada escrito', async () => {
    const { vendaId } = await vendaAntiga(dia(6, 10), [{ tipo: 'CREDITO', valor: 2320 }]);
    let corrida!: Promise<any[]>;
    let antes!: Awaited<ReturnType<typeof contagens>>;

    // «Outra corrida»: tranca a venda, espera que a regularização fique à espera da tranca, e liga-a.
    await db.$transaction(
      async (tx: any) => {
        await tx.$queryRaw`SELECT id FROM "Venda" WHERE id = ${vendaId} FOR UPDATE`;
        antes = await contagens();
        corrida = regularizar(TENANT, { aplicar: true });
        for (let i = 0; i < 100; i++) {
          const [{ n }] = await db.$queryRaw`
            SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE%' AND query LIKE '%"Venda"%'
          `;
          if (n > 0) break;
          await new Promise((res) => setTimeout(res, 100));
        }
        await tx.venda.update({ where: { id: vendaId }, data: { faturaId: 'fatura-de-outra-corrida' } });
      },
      { timeout: 30_000 },
    );

    const r = await corrida;
    expect(r.find((x: any) => x.vendaId === vendaId)).toMatchObject({ estado: 'SALTADA' });
    // Só a ligação escrita pela «outra corrida»; a regularização não escreveu nada.
    expect(await contagens()).toEqual({ ...antes, vendasSemFatura: antes.vendasSemFatura - 1 });
  });

  it('h: factura viva já apontada à venda → VENDA_JA_COM_DOCUMENTO e nada escrito', async () => {
    const data = dia(6, 12);
    const { vendaId, lancamentoId } = await vendaAntiga(data, [{ tipo: 'CREDITO', valor: 2320 }]);
    await runCtx(ctx, () =>
      db.$transaction((tx: any) =>
        emitirDocumentoEmTx(
          tx,
          {
            clienteId,
            vendaId,
            moeda: 'MZN',
            dataEmissao: data,
            dataVencimento: data,
            linhas: [
              {
                produtoId,
                descricao: 'Artigo 612',
                quantidade: 2,
                precoUnitario: 1000,
                desconto: 0,
                taxaIva: 0.16,
                subtotal: 2000,
                ivaItem: 320,
                total: 2320,
                ordemLinha: 0,
              },
            ],
          } as any,
          ctx,
        ),
      ),
    );

    const antes = await contagens();
    const r = await regularizar(TENANT, { aplicar: true });
    expect(r.find((x: any) => x.vendaId === vendaId)).toMatchObject({
      estado: 'BLOQUEADA',
      motivo: { codigo: 'VENDA_JA_COM_DOCUMENTO' },
    });
    expect(await contagens()).toEqual(antes);
    expect((await db.lancamento.findFirst({ where: { id: lancamentoId } })).status).toBe('LANCADO');
  });

  it('i: venda com devolução → VENDA_COM_DEVOLUCAO e nada escrito', async () => {
    const { vendaId, lancamentoId } = await vendaAntiga(dia(6, 14), [{ tipo: 'CREDITO', valor: 2320 }]);
    await db.devolucao.create({
      data: {
        tenantId: TENANT,
        numero: `NDV-612-${sufixo}`,
        clienteId,
        vendaId,
        motivo: 'DEFEITO',
        status: 'PROCESSADA',
        valorTotal: 1160,
      },
    });

    const antes = await contagens();
    const r = await regularizar(TENANT, { aplicar: true });
    expect(r.find((x: any) => x.vendaId === vendaId)).toMatchObject({
      estado: 'BLOQUEADA',
      motivo: { codigo: 'VENDA_COM_DEVOLUCAO' },
    });
    expect(await contagens()).toEqual(antes);
    expect((await db.lancamento.findFirst({ where: { id: lancamentoId } })).status).toBe('LANCADO');
  });

  it('f: depois de correr, a consulta da issue só devolve as vendas bloqueadas', async () => {
    const r = await regularizar(TENANT, { aplicar: true });
    const bloqueadas = r.filter((x: any) => x.estado === 'BLOQUEADA').map((x: any) => x.vendaId).sort();
    // d (IVA apurado), e (fechado), h (com documento), i (com devolução); a g saiu da consulta.
    expect(bloqueadas).toHaveLength(4);
    expect(r.every((x: any) => x.estado === 'BLOQUEADA')).toBe(true);

    // A consulta da issue, à letra: origem ENCOMENDA, sem factura, com lançamento de origem Venda.
    const linhas = await db.$queryRaw`
      SELECT v.id FROM "Venda" v
      WHERE v."tenantId" = ${TENANT} AND v.origem = 'ENCOMENDA' AND v."faturaId" IS NULL
        AND EXISTS (SELECT 1 FROM "Lancamento" l
                    WHERE l."tenantId" = v."tenantId" AND l."documentoOrigemTipo" = 'Venda'
                      AND l."documentoOrigemId" = v.id)
    `;
    expect((linhas as Array<{ id: string }>).map((l) => l.id).sort()).toEqual(bloqueadas);
    expect((await porRegularizar(TENANT)).map((v: any) => v.vendaId).sort()).toEqual(bloqueadas);
  });
});
