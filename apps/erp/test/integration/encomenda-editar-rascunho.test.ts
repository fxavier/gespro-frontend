/**
 * Oráculo N0 (encomenda-editar) — editar uma Encomenda de venda em RASCUNHO.
 *
 * Contrato:
 *   1. `UpdateEncomendaSchema` aceita `clienteId` (cuid) e `itens` (≥1, CreateItemEncomendaSchema),
 *      ambos opcionais; os campos que já existiam continuam opcionais.
 *   2. `encomendaService.atualizar(id, input, ctx)`:
 *      a. com `itens`: TODAS as linhas existentes são substituídas pelas novas; subtotal/iva/total
 *         recalculados com a regra do `criar` (base por linha = qty×preço×(1−desc/100) a 2dp,
 *         iva = base×taxa a 2dp, totais = somas). As linhas levam `tenantId`.
 *      b. com `clienteId`: o cliente muda.
 *      c. o `numero` nunca muda e a série ENCOMENDA não avança.
 *      d. fora de RASCUNHO (ex.: CANCELADA) → BusinessRuleError `ENCOMENDA_NAO_EDITAVEL`; nada muda.
 *      e. encomenda de outro tenant → NotFoundError; nada muda.
 *      f. campos omitidos mantêm o valor (editar só `notas` deixa linhas e totais intactos).
 *
 * As encomendas nascem pelo caminho real (`encomendaService.criar`), num tenant montado pelo
 * `bootstrapContabilidade` real (séries incluídas). O input de edição passa pelo
 * `UpdateEncomendaSchema`, como na Server Action: um schema que descarte `itens`/`clienteId`
 * faz o serviço nunca os ver.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

describe.skipIf(skip)('editar encomenda em RASCUNHO — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let encomendaService: (typeof import('@/server/services/comercial'))['encomendaService'];
  let CreateEncomendaSchema: (typeof import('@/lib/validations/vendas'))['CreateEncomendaSchema'];
  let UpdateEncomendaSchema: (typeof import('@/lib/validations/vendas'))['UpdateEncomendaSchema'];

  const sufixo = Date.now();
  const TENANT = `tenant-enc-editar-${sufixo}`;
  const OUTRO_TENANT = `tenant-enc-editar-outro-${sufixo}`;
  const USER = `cuencedit${sufixo}`;
  const OUTRO_USER = `cuenceditb${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const outroCtx = { tenantId: OUTRO_TENANT, userId: OUTRO_USER };

  let produtoA: { id: string; sku: string; nome: string };
  let produtoB: { id: string; sku: string; nome: string };
  let clienteInicialId: string;
  let clienteNovoId: string;
  let outroProdutoId: string;
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
        nome: `Tenant encomenda editar ${marca}`,
        slug: `enc-editar-${marca}-${sufixo}`,
        nuit: `${marca === 'a' ? 1 : 2}${String(sufixo).slice(-8)}`,
      },
    });
    await db.user.create({
      data: {
        id: userId,
        tenantId,
        email: `enc-editar-${marca}-${sufixo}@test.mz`,
        nome: `Vendedor ${marca}`,
        keycloakSub: `kc-enc-editar-${marca}-${sufixo}`,
      },
    });
    await db.$transaction((tx: any) => (bootstrap as any)(tx, tenantId), { timeout: 60_000 });
  }

  let bootstrap: unknown;

  async function criarProduto(tenantId: string, categoriaId: string, sku: string, nome: string, preco: number) {
    return db.produto.create({
      data: {
        tenantId,
        sku,
        nome,
        categoriaId,
        unidadeMedida: 'UN',
        precoVenda: preco,
        precoCompra: preco / 2,
        margemLucro: 0.3,
        taxaIva: 0.16,
      },
    });
  }

  async function criarCliente(tenantId: string, codigo: string, nome: string, nuit: string) {
    return db.cliente.create({
      data: {
        tenantId,
        nome,
        tipo: 'JURIDICA',
        nuit,
        email: `${codigo.toLowerCase()}@test.mz`,
        telefone: `84${nuit.slice(-7)}`,
        codigo,
        diasPagamento: 30,
        limiteCreditoMT: 1_000_000,
      },
    });
  }

  /** Encomenda em RASCUNHO pelo caminho real: 2 × produtoA a 3500, IVA 16%. */
  async function encomendaRascunho(c = ctx, clienteId = clienteInicialId, produtoId = produtoA.id) {
    const input = CreateEncomendaSchema.parse({
      clienteId,
      notas: 'notas iniciais',
      itens: [
        { produtoId, nomeProduto: 'Artigo A', sku: 'SKU-A', quantidade: 2, precoUnitario: 3500, desconto: 0, taxaIva: 0.16 },
      ],
    });
    const row: any = await runCtx(c, () => encomendaService.criar(input, c));
    const enc = await db.encomenda.findFirst({ where: { id: row.id, tenantId: c.tenantId } });
    expect(enc.status, 'fixture: encomenda nasce em RASCUNHO').toBe('RASCUNHO');
    expect(fx(enc.total), 'fixture: 2 × 3500 + 16%').toBe('8120.00');
    return enc;
  }

  async function proximoNumeroEncomenda(tenantId: string) {
    const series = await db.serieDocumento.findMany({ where: { tenantId, tipo: 'ENCOMENDA' } });
    return series.map((s: any) => `${s.ano}:${s.proximoNumero}`).sort().join(',');
  }

  async function retrato(encomendaId: string, tenantId: string) {
    const e = await db.encomenda.findFirst({ where: { id: encomendaId, tenantId } });
    const itens = await db.itemEncomenda.findMany({
      where: { encomendaId },
      orderBy: { id: 'asc' },
    });
    return {
      numero: e.numero,
      status: e.status,
      clienteId: e.clienteId,
      notas: e.notas,
      subtotal: fx(e.subtotal),
      iva: fx(e.iva),
      total: fx(e.total),
      itens: itens.map(
        (i: any) =>
          `${i.id}|${i.tenantId}|${i.produtoId}|${fx(i.quantidade)}|${fx(i.precoUnitario)}|${fx(i.desconto)}|${fx(i.subtotal)}|${fx(i.ivaItem)}|${fx(i.total)}`,
      ),
      serie: await proximoNumeroEncomenda(tenantId),
    };
  }

  /** Duas linhas novas com arredondamento em jogo. */
  const ITENS_NOVOS = () => [
    // 3 × 333,33 × 0,90 = 899,991 → 899,99 ; IVA 899,99 × 0,16 = 143,9984 → 144,00
    { produtoId: produtoB.id, nomeProduto: 'Artigo B', sku: 'SKU-B', quantidade: 3, precoUnitario: 333.33, desconto: 10, taxaIva: 0.16 },
    // 1 × 1000 isento
    { produtoId: produtoA.id, nomeProduto: 'Artigo A', sku: 'SKU-A', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0 },
  ];

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ encomendaService } = await import('@/server/services/comercial'));
    ({ CreateEncomendaSchema, UpdateEncomendaSchema } = await import('@/lib/validations/vendas'));
    ({ bootstrapContabilidade: bootstrap } = await import('@/server/provisioning/tenant-bootstrap'));

    await montarTenant(TENANT, USER, 'a');
    await montarTenant(OUTRO_TENANT, OUTRO_USER, 'b');

    const cat = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const pa = await criarProduto(TENANT, cat.id, `SKU-A-${sufixo}`, 'Artigo A', 3500);
    const pb = await criarProduto(TENANT, cat.id, `SKU-B-${sufixo}`, 'Artigo B', 333.33);
    produtoA = { id: pa.id, sku: pa.sku, nome: pa.nome };
    produtoB = { id: pb.id, sku: pb.sku, nome: pb.nome };
    clienteInicialId = (await criarCliente(TENANT, `CLI-ENC-ED-1-${sufixo}`, 'Cliente Inicial', '400000501')).id;
    clienteNovoId = (await criarCliente(TENANT, `CLI-ENC-ED-2-${sufixo}`, 'Cliente Novo', '400000502')).id;

    const outraCat = await db.categoriaProduto.create({ data: { tenantId: OUTRO_TENANT, nome: 'Mercadorias' } });
    outroProdutoId = (await criarProduto(OUTRO_TENANT, outraCat.id, `SKU-X-${sufixo}`, 'Artigo X', 3500)).id;
    outroClienteId = (await criarCliente(OUTRO_TENANT, `CLI-ENC-ED-X-${sufixo}`, 'Cliente Outro', '400000503')).id;
  });

  // ── 1. Schema ────────────────────────────────────────────────────────────────

  it('1: UpdateEncomendaSchema aceita clienteId e itens (≥1) e mantém os campos antigos opcionais', () => {
    const itens = ITENS_NOVOS();
    const parsed: any = UpdateEncomendaSchema.parse({ clienteId: clienteNovoId, itens });
    expect(parsed.clienteId).toBe(clienteNovoId);
    expect(parsed.itens).toHaveLength(2);
    expect(parsed.itens[0]).toMatchObject({ produtoId: produtoB.id, quantidade: 3, precoUnitario: 333.33, desconto: 10 });

    expect(UpdateEncomendaSchema.safeParse({ itens: [] }).success, 'itens vazio tem de ser recusado').toBe(false);
    expect(UpdateEncomendaSchema.safeParse({ clienteId: 'nao-e-cuid' }).success, 'clienteId tem de ser cuid').toBe(false);
    expect(
      UpdateEncomendaSchema.safeParse({ itens: [{ ...itens[0], quantidade: 0 }] }).success,
      'linha com quantidade 0 tem de ser recusada (CreateItemEncomendaSchema)',
    ).toBe(false);

    expect(UpdateEncomendaSchema.safeParse({}).success, 'todos os campos continuam opcionais').toBe(true);
    expect(UpdateEncomendaSchema.safeParse({ notas: 'só notas' }).success).toBe(true);
  });

  // ── 2a + 2c ──────────────────────────────────────────────────────────────────

  it('2a/2c: itens substituem TODAS as linhas, totais recalculados como no criar; número e série intactos', async () => {
    const enc = await encomendaRascunho();
    const antes = await retrato(enc.id, TENANT);
    expect(antes.itens).toHaveLength(1);
    const idsAntigos = antes.itens.map((s: string) => s.split('|')[0]);

    const input = UpdateEncomendaSchema.parse({ itens: ITENS_NOVOS() });
    await runCtx(ctx, () => encomendaService.atualizar(enc.id, input, ctx));

    const depois = await retrato(enc.id, TENANT);
    expect(depois.itens, 'as linhas antigas foram substituídas pelas duas novas').toHaveLength(2);
    for (const id of idsAntigos) {
      expect(depois.itens.some((s: string) => s.startsWith(`${id}|`)), `linha antiga ${id} sobreviveu`).toBe(false);
    }

    const linhas = await db.itemEncomenda.findMany({ where: { encomendaId: enc.id } });
    expect(linhas.every((l: any) => l.tenantId === TENANT), 'todas as linhas levam tenantId').toBe(true);
    const linhaB = linhas.find((l: any) => l.produtoId === produtoB.id);
    const linhaA = linhas.find((l: any) => l.produtoId === produtoA.id);
    expect(linhaB, 'linha do produto B').toBeDefined();
    expect(linhaA, 'linha do produto A').toBeDefined();
    expect(fx(linhaB.quantidade)).toBe('3.00');
    expect(fx(linhaB.precoUnitario)).toBe('333.33');
    expect(fx(linhaB.desconto)).toBe('10.00');
    expect(fx(linhaB.subtotal)).toBe('899.99');
    expect(fx(linhaB.ivaItem)).toBe('144.00');
    expect(fx(linhaB.total)).toBe('1043.99');
    expect(fx(linhaA.quantidade)).toBe('1.00');
    expect(fx(linhaA.subtotal)).toBe('1000.00');
    expect(fx(linhaA.ivaItem)).toBe('0.00');
    expect(fx(linhaA.total)).toBe('1000.00');

    expect(depois.subtotal).toBe('1899.99');
    expect(depois.iva).toBe('144.00');
    expect(depois.total).toBe('2043.99');

    expect(depois.numero, '2c: o número nunca muda').toBe(antes.numero);
    expect(depois.serie, '2c: a série ENCOMENDA não avança').toBe(antes.serie);
    expect(depois.status).toBe('RASCUNHO');
    expect(depois.clienteId, 'cliente omitido mantém-se').toBe(clienteInicialId);
    expect(depois.notas, 'notas omitidas mantêm-se').toBe('notas iniciais');
  });

  it('2a: totais da encomenda batem com a mesma regra do criar (encomenda criada com as mesmas linhas)', async () => {
    const enc = await encomendaRascunho();
    const input = UpdateEncomendaSchema.parse({ itens: ITENS_NOVOS() });
    await runCtx(ctx, () => encomendaService.atualizar(enc.id, input, ctx));

    const referencia: any = await runCtx(ctx, () =>
      encomendaService.criar(CreateEncomendaSchema.parse({ clienteId: clienteInicialId, itens: ITENS_NOVOS() }), ctx),
    );
    const editada = await db.encomenda.findFirst({ where: { id: enc.id, tenantId: TENANT } });
    expect(fx(editada.subtotal)).toBe(fx(referencia.subtotal));
    expect(fx(editada.iva)).toBe(fx(referencia.iva));
    expect(fx(editada.total)).toBe(fx(referencia.total));
  });

  // ── 2b ───────────────────────────────────────────────────────────────────────

  it('2b: clienteId muda o cliente; linhas, totais, número e série ficam', async () => {
    const enc = await encomendaRascunho();
    const antes = await retrato(enc.id, TENANT);

    const input = UpdateEncomendaSchema.parse({ clienteId: clienteNovoId });
    await runCtx(ctx, () => encomendaService.atualizar(enc.id, input, ctx));

    const depois = await retrato(enc.id, TENANT);
    expect(depois.clienteId).toBe(clienteNovoId);
    expect(depois.itens).toEqual(antes.itens);
    expect(depois.subtotal).toBe(antes.subtotal);
    expect(depois.total).toBe(antes.total);
    expect(depois.numero).toBe(antes.numero);
    expect(depois.serie).toBe(antes.serie);
  });

  // ── 2f ───────────────────────────────────────────────────────────────────────

  it('2f: editar só notas deixa cliente, linhas e totais intactos', async () => {
    const enc = await encomendaRascunho();
    const antes = await retrato(enc.id, TENANT);

    const input = UpdateEncomendaSchema.parse({ notas: 'notas revistas' });
    await runCtx(ctx, () => encomendaService.atualizar(enc.id, input, ctx));

    const depois = await retrato(enc.id, TENANT);
    expect(depois.notas).toBe('notas revistas');
    expect({ ...depois, notas: antes.notas }).toEqual(antes);
  });

  // ── 2d ───────────────────────────────────────────────────────────────────────

  it('2d: encomenda CANCELADA → ENCOMENDA_NAO_EDITAVEL e nada muda (linhas, totais, cliente)', async () => {
    const enc = await encomendaRascunho();
    await db.encomenda.update({ where: { id: enc.id }, data: { status: 'CANCELADA' } });
    const antes = await retrato(enc.id, TENANT);

    const input = UpdateEncomendaSchema.parse({ clienteId: clienteNovoId, itens: ITENS_NOVOS(), notas: 'x' });
    const erro = await capturarErro(() => runCtx(ctx, () => encomendaService.atualizar(enc.id, input, ctx)));

    expect(erro, 'editar uma encomenda CANCELADA tinha de ser recusado').toBeDefined();
    expect(erro.name).toBe('BusinessRuleError');
    expect(erro.code).toBe('ENCOMENDA_NAO_EDITAVEL');
    expect(await retrato(enc.id, TENANT)).toEqual(antes);
  });

  // ── 2e ───────────────────────────────────────────────────────────────────────

  it('2e: encomenda de outro tenant → NotFoundError e nada muda', async () => {
    const alheia = await encomendaRascunho(outroCtx, outroClienteId, outroProdutoId);
    const antes = await retrato(alheia.id, OUTRO_TENANT);

    const input = UpdateEncomendaSchema.parse({ clienteId: clienteNovoId, itens: ITENS_NOVOS(), notas: 'intrusão' });
    const erro = await capturarErro(() => runCtx(ctx, () => encomendaService.atualizar(alheia.id, input, ctx)));

    expect(erro, 'editar encomenda de outro tenant tinha de falhar').toBeDefined();
    expect(erro.name).toBe('NotFoundError');
    expect(await retrato(alheia.id, OUTRO_TENANT)).toEqual(antes);
    expect(
      await db.itemEncomenda.count({ where: { encomendaId: alheia.id, tenantId: TENANT } }),
      'nenhuma linha do tenant intruso foi pendurada na encomenda alheia',
    ).toBe(0);
  });
});
