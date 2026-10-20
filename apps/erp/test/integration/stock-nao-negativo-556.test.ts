/**
 * #556 — o stock nunca fica negativo.
 *
 * O defeito: `_baixarSaldoAtomico` só exigia `saldo >= q` (ignorava o reservado) e
 * `_confirmarConsumoAtomico` só exigia `saldoReservado >= q` (não exigia saldo). Com saldo 10 e
 * reserva 10, uma baixa directa de 10 passava (saldo 0, reservado 10) e o consumo da reserva
 * deixava saldo −10. A base não tinha CHECK nenhum em `SaldoStock`.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

describe.skipIf(skip)('#556 — stock não negativo — DB efémera', () => {
  let db: any;
  let svc: any; // stockService

  const sufixo = Date.now();
  let seq = 0;

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ stockService: svc } = await import('@/server/services/inventario/stock.service'));
  });

  /** Tenant com um produto e um armazém com saldo 10; devolve o ctx e os ids. */
  async function cenario(saldoInicial = '10') {
    seq += 1;
    const tenantId = `tenant-s556-${sufixo}-${seq}`;
    const userId = `user-s556-${sufixo}-${seq}`;
    const slug = `s556-${sufixo}-${seq}`;
    await db.tenant.create({ data: { id: tenantId, nome: `Tenant ${slug}`, slug, nuit: `${sufixo + seq}`.slice(-9) } });
    await db.user.create({
      data: { id: userId, tenantId, email: `${userId}@test.mz`, nome: 'Armazém', keycloakSub: `kc-${userId}` },
    });
    const cat = await db.categoriaProduto.create({ data: { tenantId, nome: `Cat ${slug}` } });
    const p = await db.produto.create({
      data: {
        tenantId, sku: `SKU-${slug}`, nome: 'Cimento', categoriaId: cat.id, unidadeMedida: 'SACO',
        precoVenda: '100.00', precoCompra: '80.00', margemLucro: '0.25', stockMinimo: '0',
      },
    });
    const l = await db.localizacao.create({ data: { tenantId, codigo: `A-${slug}`, nome: `Armazém ${slug}`, tipo: 'ARMAZEM' } });
    const s = await db.saldoStock.create({
      data: { tenantId, produtoId: p.id, localizacaoId: l.id, saldo: saldoInicial, saldoReservado: '0' },
    });
    return { ctx: { tenantId, userId }, produtoId: p.id, localizacaoId: l.id, saldoId: s.id };
  }

  async function lerSaldo(id: string) {
    const r = await db.saldoStock.findUnique({ where: { id }, select: { saldo: true, saldoReservado: true } });
    return { saldo: r.saldo.toString(), reservado: r.saldoReservado.toString() };
  }

  function reservar(c: Awaited<ReturnType<typeof cenario>>, q: number) {
    return db.$transaction((tx: any) =>
      svc.reservarStock(tx, { produtoId: c.produtoId, localizacaoId: c.localizacaoId, quantidade: q }, c.ctx),
    );
  }

  function baixar(c: Awaited<ReturnType<typeof cenario>>, q: number) {
    return db.$transaction((tx: any) =>
      svc.baixarStock(tx, { produtoId: c.produtoId, localizacaoOrigemId: c.localizacaoId, quantidade: q }, c.ctx),
    );
  }

  it('(a) saldo 10 todo reservado: baixarStock(10) → STOCK_INSUFICIENTE e nada muda', async () => {
    const c = await cenario();
    await reservar(c, 10);

    await expect(baixar(c, 10)).rejects.toMatchObject({ code: 'STOCK_INSUFICIENTE' });
    expect(await lerSaldo(c.saldoId)).toEqual({ saldo: '10', reservado: '10' });
  });

  it('(a′) a baixa usa só o disponível: saldo 10, reserva 4 → baixa de 6 passa, de 7 não', async () => {
    const c = await cenario();
    await reservar(c, 4);

    await expect(baixar(c, 7)).rejects.toMatchObject({ code: 'STOCK_INSUFICIENTE' });
    await baixar(c, 6);
    expect(await lerSaldo(c.saldoId)).toEqual({ saldo: '4', reservado: '4' });
  });

  it('(b) cenário da issue: reserva 10, baixa 10, consumo 10 → falha e o saldo nunca fica negativo', async () => {
    const c = await cenario();
    const { reservaId } = await reservar(c, 10);

    await expect(baixar(c, 10)).rejects.toMatchObject({ code: 'STOCK_INSUFICIENTE' });
    await db.$transaction((tx: any) => svc.confirmarConsumoStock(tx, reservaId, c.ctx));

    expect(await lerSaldo(c.saldoId)).toEqual({ saldo: '0', reservado: '0' });
    const negativos = await db.$queryRaw`
      SELECT count(*)::int AS n FROM "SaldoStock"
      WHERE "tenantId" = ${c.ctx.tenantId} AND (saldo < 0 OR "saldoReservado" < 0)`;
    expect(negativos[0].n).toBe(0);
  });

  it('(c) UPDATE directo que deixe saldo negativo falha na base', async () => {
    const c = await cenario();
    await expect(
      db.$executeRaw`UPDATE "SaldoStock" SET saldo = -1 WHERE id = ${c.saldoId}`,
    ).rejects.toThrow(/saldo_stock_nao_negativo/);
    expect(await lerSaldo(c.saldoId)).toEqual({ saldo: '10', reservado: '0' });
  });

  it('(d) saldoReservado acima do saldo falha na base', async () => {
    const c = await cenario();
    await expect(
      db.$executeRaw`UPDATE "SaldoStock" SET "saldoReservado" = 11 WHERE id = ${c.saldoId}`,
    ).rejects.toThrow(/saldo_stock_nao_negativo/);
    await expect(
      db.$executeRaw`UPDATE "SaldoStock" SET "saldoReservado" = -1 WHERE id = ${c.saldoId}`,
    ).rejects.toThrow(/saldo_stock_nao_negativo/);
    expect(await lerSaldo(c.saldoId)).toEqual({ saldo: '10', reservado: '0' });
  });
});
