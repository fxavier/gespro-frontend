/**
 * #559 (parte A) — `vendaService.transitar` sem tranca: dois «Cancelar» concorrentes da mesma
 * encomenda libertavam a reserva duas vezes, e o segundo decremento de `saldoReservado` comia a
 * reserva de OUTRA encomenda no mesmo produto/localização.
 *
 * Contrato: a transição lê a venda dentro da tx, trancada (`FOR UPDATE`, como `anular`), e decide
 * pelo estado trancado. Das duas chamadas concorrentes, uma cancela e a outra é recusada com
 * `TRANSICAO_INVALIDA`; `libertarStock` corre uma vez; a reserva da outra encomenda fica intacta.
 *
 * Determinismo (padrão da #612): a tx do teste tranca a reserva da encomenda A; as duas
 * transições arrancam, esperam-se dois bloqueios em `pg_stat_activity` e só então se liberta.
 * Sem a tranca na Venda, ambas já leram a venda PENDENTE/RASCUNHO e a reserva ATIVA e ficam as
 * duas à espera do `update` da reserva; com a tranca, a segunda espera na Venda.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

type Ctx = { tenantId: string; userId: string };

describe.skipIf(skip)('#559 — transitar(CANCELADA) concorrente liberta a reserva uma só vez — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let vendaService: any;
  let CreateVendaSchema: (typeof import('@/lib/validations/vendas'))['CreateVendaSchema'];
  let TransitarVendaSchema: (typeof import('@/lib/validations/vendas'))['TransitarVendaSchema'];

  const sufixo = Date.now();
  const TENANT = `tenant-venda-tranca-559-${sufixo}`;
  const USER = `cvt559${sufixo}u1`;
  const ctx: Ctx = { tenantId: TENANT, userId: USER };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  let produtoId: string;
  let localizacaoId: string;
  let clienteId: string;

  async function encomenda(quantidade: number) {
    const input = CreateVendaSchema.parse({
      origem: 'ENCOMENDA',
      vendedorId: USER,
      localizacaoOrigemId: localizacaoId,
      clienteId,
      itens: [{ produtoId, nomeProduto: 'Artigo 100', quantidade, precoUnitario: 100, desconto: 0, taxaIva: 0 }],
      pagamentos: [{ tipo: 'CREDITO', valor: 100 * quantidade }],
    });
    const row: any = await noCtx(() => vendaService.criar(input, ctx));
    return db.venda.findFirst({ where: { id: row.id, tenantId: TENANT } });
  }

  function cancelar(vendaId: string) {
    const input = TransitarVendaSchema.parse({ vendaId, paraStatus: 'CANCELADA' });
    return noCtx(() => vendaService.transitar(input, ctx));
  }

  async function saldoReservado() {
    const s = await db.saldoStock.findFirst({ where: { tenantId: TENANT, produtoId, localizacaoId } });
    return Number(s.saldoReservado.toString());
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ vendaService } = (await import('@/server/services/comercial')) as any);
    ({ CreateVendaSchema, TransitarVendaSchema } = await import('@/lib/validations/vendas'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant tranca venda #559', slug: `venda-tranca-559-${sufixo}`, nuit: `5${String(sufixo).slice(-8)}` },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `venda-tranca-559-${sufixo}@test.mz`, nome: 'Vendedor', keycloakSub: `kc-venda-tranca-559-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const produto = await db.produto.create({
      data: {
        tenantId: TENANT,
        sku: `SKU-VENDA-TRANCA-559-${sufixo}`,
        nome: 'Artigo 100',
        categoriaId: categoria.id,
        unidadeMedida: 'UN',
        precoVenda: 100,
        precoCompra: 70,
        margemLucro: 0.3,
        taxaIva: 0,
      },
    });
    produtoId = produto.id;
    const loc = await db.localizacao.create({
      data: { tenantId: TENANT, codigo: `ARM-VENDA-TRANCA-559-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    await db.saldoStock.create({
      data: { tenantId: TENANT, produtoId, varianteProdutoId: '', localizacaoId, saldo: 100, saldoReservado: 0 },
    });
    const cliente = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente #559',
        tipo: 'JURIDICA',
        nuit: '400000559',
        email: `cliente-venda-tranca-559-${sufixo}@test.mz`,
        telefone: '840000559',
        codigo: `CLI-VENDA-TRANCA-559-${sufixo}`,
        diasPagamento: 30,
        limiteCreditoMT: 10_000_000,
      },
    });
    clienteId = cliente.id;
  });

  it('dois «Cancelar» concorrentes: um cancela, o outro TRANSICAO_INVALIDA; a reserva da outra encomenda fica intacta', async () => {
    const a = await encomenda(2);
    const b = await encomenda(5);
    expect(await saldoReservado(), 'fixture: as duas encomendas reservam 2 + 5').toBe(7);
    const reservaA = await db.reservaStock.findFirst({ where: { tenantId: TENANT, documentoReferenciaId: a.id } });
    expect(reservaA.status, 'fixture: reserva de A activa').toBe('ATIVA');

    let corrida!: Promise<PromiseSettledResult<unknown>[]>;
    await db.$transaction(
      async (tx: any) => {
        await tx.$queryRaw`SELECT id FROM "ReservaStock" WHERE id = ${reservaA.id} FOR UPDATE`;
        corrida = Promise.allSettled([cancelar(a.id), cancelar(a.id)]);
        for (let i = 0; i < 100; i++) {
          const [{ n }] = await db.$queryRaw`
            SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
          `;
          if (n >= 2) break;
          await new Promise((res) => setTimeout(res, 100));
        }
      },
      { timeout: 30_000 },
    );

    const resultados = await corrida;
    const ok = resultados.filter((r) => r.status === 'fulfilled');
    const recusas = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok.length, 'só uma das chamadas cancela').toBe(1);
    expect(recusas.length).toBe(1);
    expect(recusas[0].reason?.code, `recusa: ${recusas[0].reason?.message}`).toBe('TRANSICAO_INVALIDA');

    expect(await saldoReservado(), 'saldoReservado desce uma vez (fica a reserva de B)').toBe(5);
    const reservas = await db.reservaStock.findMany({ where: { tenantId: TENANT, documentoReferenciaId: { in: [a.id, b.id] } } });
    expect(reservas.find((r: any) => r.documentoReferenciaId === a.id).status).toBe('LIBERADA');
    expect(reservas.find((r: any) => r.documentoReferenciaId === b.id).status).toBe('ATIVA');
    expect((await db.venda.findFirst({ where: { id: a.id, tenantId: TENANT } })).status).toBe('CANCELADA');
    expect(
      await db.historicoEstadoVenda.count({ where: { tenantId: TENANT, vendaId: a.id, estadoDepois: 'CANCELADA' } }),
      'uma só linha de histórico para o cancelamento',
    ).toBe(1);
  });
});
