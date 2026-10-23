/**
 * Oráculo #617 — desconto maior que a linha e arredondamento de linha com um só dono.
 *
 * Contrato:
 *   1. `emitirFatura` (Server Action real, `createSafeAction` + `EmitirFaturaSchema`) com uma linha
 *      cujo desconto excede quantidade × preço → `ok: false`, erro de validação, e nada é escrito:
 *      nenhuma factura nova e a série FATURA não avança. A mesma factura com desconto dentro da
 *      linha emite (controlo: prova que a recusa vem do desconto, não da fixture).
 *   2. Os arredondamentos de linha que deixaram de ser locais (encomenda, devolução, preço com IVA
 *      do serviço) passam a `arredondarLinha` SEM mudar resultados: estes valores foram fixados
 *      contra o código anterior (verdes antes e depois). O meio cêntimo exacto (5,025 → 5,03 e
 *      0,125 → 0,13) prova o meio-para-cima.
 *
 * `auth()` e `next/cache` são as únicas fronteiras dobradas; Postgres efémero.
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const h = vi.hoisted(() => ({ sessao: null as unknown }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => h.sessao) }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

const fx = (v: unknown) => Number(String(v)).toFixed(2);

describe.skipIf(skip)('Desconto ≤ linha e arredondamento de linha único (#617) — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let emitirFatura: (input: unknown) => Promise<{ ok: boolean; data?: any; error?: { code: string; message: string } }>;
  let comercial: any;
  let servicos: any;
  let vendas: typeof import('@/lib/validations/vendas');
  let CreateServicoSchema: any;

  const sufixo = Date.now();
  const TENANT = `tenant-desc-617-${sufixo}`;
  const USER = `cudesc617${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  let clienteId: string;
  let produtoId: string;

  const factura = (desconto: number) => ({
    clienteId,
    dataEmissao: new Date().toISOString().slice(0, 10),
    dataVencimento: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    linhas: [{ descricao: 'Artigo 617', quantidade: 0.5, precoUnitario: 22.59, desconto, taxaIva: 0.16 }],
  });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ emitirFatura } = (await import('@/server/actions/faturacao.actions')) as any);
    comercial = await import('@/server/services/comercial');
    ({ servicoService: servicos } = (await import('@/server/services/compras/servico.service')) as any);
    vendas = await import('@/lib/validations/vendas');
    ({ CreateServicoSchema } = (await import('@/lib/validations/servicos')) as any);
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant #617', slug: `desc-617-${sufixo}`, nuit: `6${String(sufixo).slice(-8)}` },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `desc-617-${sufixo}@test.mz`, nome: 'Operador 617', keycloakSub: `kc-desc-617-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    clienteId = (
      await db.cliente.create({
        data: { tenantId: TENANT, codigo: `CLI-617-${sufixo}`, nome: 'Cliente 617', tipo: 'JURIDICA', nuit: '400006171', email: 'cli617@test.mz', telefone: '840006171' },
      })
    ).id;
    const cat = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    produtoId = (
      await db.produto.create({
        data: { tenantId: TENANT, sku: `SKU-617-${sufixo}`, nome: 'Artigo 617', categoriaId: cat.id, unidadeMedida: 'UN', precoVenda: 100, precoCompra: 50, margemLucro: 0.3, taxaIva: 0.16 },
      })
    ).id;

    h.sessao = {
      user: { id: USER, tenantId: TENANT, permissions: ['faturacao:fatura:emitir'], acesso: 'aberto', emailVerificado: true },
    };
  });

  it('1. factura com desconto > q×p é recusada pela action e nada é escrito; dentro da linha emite', async () => {
    const serieAntes = await db.serieDocumento.findFirst({ where: { tenantId: TENANT, tipo: 'FATURA', ativo: true } });
    const facturasAntes = await db.fatura.count({ where: { tenantId: TENANT } });

    // 0,5 × 22,59 = 11,295: 17,97 (o caso da issue) e 11,30 (um cêntimo acima do arredondado) excedem.
    for (const desconto of [17.97, 11.3]) {
      const r = await emitirFatura(factura(desconto));
      expect(r.ok, `desconto ${desconto} recusado`).toBe(false);
      expect(r.error?.code).toBe('VALIDACAO');
      expect(JSON.stringify(r.error)).toContain('O desconto não pode exceder o valor da linha');
    }
    expect(await db.fatura.count({ where: { tenantId: TENANT } }), 'nenhuma factura escrita').toBe(facturasAntes);
    const serieDepois = await db.serieDocumento.findFirst({ where: { id: serieAntes.id } });
    expect(serieDepois.proximoNumero, 'a série não avançou').toBe(serieAntes.proximoNumero);

    // Controlo: 11,29 fica dentro da linha → subtotal 0,01 (0,005 meio para cima).
    const ok = await emitirFatura(factura(11.29));
    expect(ok.ok, JSON.stringify(ok.error)).toBe(true);
    const f = await db.fatura.findFirst({ where: { tenantId: TENANT }, include: { linhas: true } });
    expect([fx(f.linhas[0].subtotal), fx(f.subtotal)]).toEqual(['0.01', '0.01']);
  });

  it('2a. encomenda: linhas a 2 casas, meio para cima (valores fixados antes da troca)', async () => {
    const input = vendas.CreateEncomendaSchema.parse({
      clienteId,
      itens: [
        // 3 × 33,35 × 85% = 85,0425 → 85,04; IVA 13,6064 → 13,61
        { produtoId, nomeProduto: 'A', quantidade: 3, precoUnitario: 33.35, desconto: 15, taxaIva: 0.16 },
        // 1 × 10,05 × 50% = 5,025 → 5,03 (meio para cima); IVA 0,8048 → 0,80
        { produtoId, nomeProduto: 'B', quantidade: 1, precoUnitario: 10.05, desconto: 50, taxaIva: 0.16 },
      ],
    });
    const row: any = await runCtx(ctx, () => comercial.encomendaService.criar(input, ctx));
    const enc = await db.encomenda.findFirst({ where: { id: row.id, tenantId: TENANT }, include: { itens: true } });
    const itens = [...enc.itens].sort((a: any, b: any) => a.nomeProduto.localeCompare(b.nomeProduto));
    expect(itens.map((i: any) => [fx(i.subtotal), fx(i.ivaItem), fx(i.total)])).toEqual([
      ['85.04', '13.61', '98.65'],
      ['5.03', '0.80', '5.83'],
    ]);
    expect([fx(enc.subtotal), fx(enc.total)]).toEqual(['90.07', '104.48']);
  });

  it('2b. devolução sem factura: linhas a 2 casas, meio para cima (valores fixados antes da troca)', async () => {
    const parsed = vendas.CreateDevolucaoSchema.parse({
      clienteId,
      motivo: 'DEFEITO',
      itens: [
        // 3 × 33,335 = 100,005 → 100,01; IVA 16,0016 → 16,00
        { produtoId, nomeProduto: 'A', quantidade: 3, valorUnitario: 33.335, taxaIva: 0.16 },
        // 1 × 0,125 → 0,13 (meio para cima); IVA 0,0208 → 0,02
        { produtoId, nomeProduto: 'B', quantidade: 1, valorUnitario: 0.125, taxaIva: 0.16 },
      ],
    });
    const row: any = await runCtx(ctx, () => comercial.devolucaoService.criar(parsed, ctx));
    const dev = await db.devolucao.findFirst({ where: { id: row.id, tenantId: TENANT }, include: { itens: true } });
    const itens = [...dev.itens].sort((a: any, b: any) => a.nomeProduto.localeCompare(b.nomeProduto));
    expect(itens.map((i: any) => [fx(i.subtotal), fx(i.ivaItem), fx(i.total)])).toEqual([
      ['100.01', '16.00', '116.01'],
      ['0.13', '0.02', '0.15'],
    ]);
    expect(fx(dev.valorTotal)).toBe('116.16');
  });

  it('2c. serviço: preço com IVA em Decimal (valores fixados antes da troca)', async () => {
    const casos: Array<[number, number, string]> = [
      [2000, 0.16, '2320.00'],
      [1234.57, 0.16, '1432.10'], // 1432,1012
      [0.7, 0.16, '0.81'], // 0,812
      [1234.57, 0, '1234.57'],
    ];
    for (const [i, [preco, taxaIva, esperado]] of casos.entries()) {
      const s: any = await runCtx(ctx, () =>
        servicos.criarServico(
          CreateServicoSchema.parse({ codigo: `SRV-617-${i}-${sufixo}`, nome: `Serviço 617 ${i}`, preco, duracaoEstimada: 60, taxaIva }),
          ctx,
        ),
      );
      expect(fx(s.precoComIva), `${preco} a ${taxaIva}`).toBe(esperado);
    }
  });
});
