/**
 * Oráculo P2/G5 (fatura-pdf-pagamento) — o seed contabilístico do demo não duplica recebimentos.
 *
 * Escrito pelo verificador; quem implementa não o altera.
 *
 * Desde o P2, `registarPagamento` lança o recebimento da factura (origem PAGAMENTO,
 * `documentoOrigemTipo` 'Fatura', D meio / C 411). O `seedDemoContabilidade`
 * (`prisma/seed/demo-contabilidade.ts`) reconhecia «já lançado» pela chave
 * `<documentoOrigemTipo>:<id>` — `Fatura:<id>` para a emissão, `Recebimento:<id>` para o
 * recebimento. Com o lançamento do pagamento, as duas leituras erram:
 *   R1 factura emitida pelo serviço e paga pela aplicação → o seed lançava um SEGUNDO
 *      recebimento (D 121 / C 411): a 411 ficava creditada duas vezes;
 *   R2 factura sem lançamento de emissão (as do funil do seed nascem assim) e paga pela
 *      aplicação → o lançamento do pagamento (tipo 'Fatura') passava por emissão e a
 *      factura ficava sem o seu lançamento de venda (DOCUMENTO_SEM_LANCAMENTO para sempre).
 * Contrato: depois do seed, cada factura tem exactamente UM lançamento de emissão
 * (origem VENDA, tipo 'Fatura') e, se tem recebimento lançado pela aplicação, nenhum
 * outro (origem RECEBIMENTO ou PAGAMENTO). Correr o seed outra vez não muda nada.
 *
 * O tenant é montado pelos serviços reais (`bootstrapContabilidade`, `emitirFatura`,
 * `registarPagamento`). A factura de R2 é a ÚNICA escrita directa: replica o que o
 * `demo-vendas` faz (Fatura sem lançamento de emissão, `createManyAndReturn` no seed) —
 * nenhum caminho da aplicação produz esse estado, e é dele que o seed existe para tratar.
 * O número sai da série (`numerarDocumento`), nunca à mão.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

describe.skipIf(skip)('seedDemoContabilidade × registarPagamento — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let fat: any;
  let val: typeof import('@/lib/validations/faturacao');
  let seedDemoContabilidade: (prisma: any, tenantId: string, adminUserId: string) => Promise<void>;

  const sufixo = Date.now();
  const TENANT = `tenant-seed-rec-${sufixo}`;
  const USER = `user-seed-rec-${sufixo}`;
  const ctx = {
    tenantId: TENANT,
    userId: USER,
    permissions: new Set(['faturacao:fatura:pagar', 'financas:banca:escrita']),
  };
  let clienteId: string;
  let contaBancariaId: string;

  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  const pagar = (faturaId: string, valor: number) =>
    noCtx(() =>
      fat.registarPagamento(
        {
          faturaId,
          valor,
          dataPagamento: new Date(),
          formaPagamento: 'TRANSFERENCIA_BANCARIA',
          contaBancariaId,
        },
        ctx,
      ),
    );

  async function lancamentosDe(faturaId: string) {
    const ls = await db.lancamento.findMany({
      where: { tenantId: TENANT, documentoOrigemId: faturaId },
      select: { id: true, origem: true, documentoOrigemTipo: true, valorTotal: true },
    });
    return {
      emissao: ls.filter((l: any) => l.origem === 'VENDA' && l.documentoOrigemTipo === 'Fatura'),
      recebimento: ls.filter((l: any) => l.origem === 'RECEBIMENTO' || l.origem === 'PAGAMENTO'),
      todos: ls,
    };
  }

  /** Soma dos créditos na 411 com origem num recebimento da factura. */
  async function creditos411DeRecebimento(faturaId: string): Promise<Prisma.Decimal> {
    const ps = await db.partidaLancamento.findMany({
      where: {
        tenantId: TENANT,
        tipo: 'CREDITO',
        conta: { codigo: '411' },
        lancamento: { documentoOrigemId: faturaId, origem: { in: ['RECEBIMENTO', 'PAGAMENTO'] } },
      },
      select: { valor: true },
    });
    return ps.reduce((a: Prisma.Decimal, p: any) => a.plus(new Prisma.Decimal(String(p.valor))), new Prisma.Decimal(0));
  }

  const correrSeed = () => seedDemoContabilidade(db, TENANT, USER);

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    fat = await import('@/server/services/financas/faturacao.service');
    val = await import('@/lib/validations/faturacao');
    ({ seedDemoContabilidade } = (await import('../../prisma/seed/demo-contabilidade')) as any);
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant Seed Recebimento', slug: `seed-rec-${sufixo}`, nuit: `${sufixo + 3}`.slice(-9) },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `${USER}@test.mz`, nome: 'Admin Seed', keycloakSub: `kc-${USER}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const cliente = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente Seed',
        tipo: 'JURIDICA',
        nuit: '400000004',
        email: `cliente-seed-${sufixo}@test.mz`,
        telefone: '840000003',
        codigo: `CLI-SEED-${sufixo}`,
      },
    });
    clienteId = cliente.id;

    const pgc123 = await db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo: '123' } });
    const conta = await db.contaBancaria.create({
      data: {
        tenantId: TENANT,
        banco: 'Banco Seed',
        agencia: '0001',
        numeroConta: `SEED-${sufixo}`,
        tipoConta: 'CORRENTE',
        contaContabilId: pgc123.id,
        ativo: true,
      },
    });
    contaBancariaId = conta.id;
  });

  it('R1: factura emitida pelo serviço e paga pela aplicação — o seed não lança um segundo recebimento', async () => {
    const hoje = new Date();
    const f: any = await noCtx(() =>
      fat.emitirFatura(
        val.EmitirFaturaSchema.parse({
          clienteId,
          dataEmissao: hoje,
          dataVencimento: new Date(hoje.getTime() + 30 * 86_400_000),
          linhas: [{ descricao: 'Mercadoria', quantidade: 10, precoUnitario: 100, taxaIva: 0.16 }],
        }),
        ctx,
      ),
    );
    await pagar(f.id, 1160);

    const antes = await lancamentosDe(f.id);
    expect(antes.emissao, 'pré-condição: emissão lançada pelo serviço').toHaveLength(1);
    expect(antes.recebimento, 'pré-condição: recebimento lançado pelo registarPagamento').toHaveLength(1);

    await correrSeed();
    await correrSeed(); // idempotente

    const depois = await lancamentosDe(f.id);
    expect(depois.emissao).toHaveLength(1);
    expect(depois.recebimento, 'o seed lançou outro recebimento por cima do pagamento').toHaveLength(1);
    expect(depois.todos).toHaveLength(2);
    expect((await creditos411DeRecebimento(f.id)).equals(new Prisma.Decimal('1160'))).toBe(true);
  });

  it('R2: factura sem lançamento de emissão (como as do funil do seed) e paga pela aplicação — o seed lança a emissão e mais nenhum recebimento', async () => {
    // Escrita directa justificada no cabeçalho: o estado «Fatura sem lançamento de emissão» só
    // existe porque o `demo-vendas` o cria assim; o número vem da série.
    const dataEmissao = new Date();
    const f: any = await noCtx(() =>
      db.$transaction(async (tx: any) => {
        const { numero, serieDocumentoId } = await fat.numerarDocumento(tx, 'FATURA', ctx, dataEmissao);
        return tx.fatura.create({
          data: {
            tenantId: TENANT,
            serieDocumentoId,
            numero,
            clienteId,
            subtotal: new Prisma.Decimal('1000'),
            baseIva: new Prisma.Decimal('1000'),
            ivaTotal: new Prisma.Decimal('160'),
            total: new Prisma.Decimal('1160'),
            status: 'EMITIDA',
            dataEmissao,
            dataVencimento: new Date(dataEmissao.getTime() + 30 * 86_400_000),
            emitidoPorId: USER,
          },
        });
      }),
    );
    await pagar(f.id, 1160);

    const antes = await lancamentosDe(f.id);
    expect(antes.emissao, 'pré-condição: sem lançamento de emissão').toHaveLength(0);
    expect(antes.recebimento, 'pré-condição: pagamento lançado').toHaveLength(1);

    await correrSeed();
    await correrSeed(); // idempotente

    const depois = await lancamentosDe(f.id);
    expect(depois.emissao, 'o lançamento do pagamento foi tomado pelo da emissão').toHaveLength(1);
    expect(new Prisma.Decimal(String(depois.emissao[0].valorTotal)).equals(new Prisma.Decimal('1160'))).toBe(true);
    expect(depois.recebimento).toHaveLength(1);
    expect(depois.todos).toHaveLength(2);
    expect((await creditos411DeRecebimento(f.id)).equals(new Prisma.Decimal('1160'))).toBe(true);
  });
});
