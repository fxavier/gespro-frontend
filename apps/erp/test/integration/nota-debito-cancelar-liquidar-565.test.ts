/**
 * #565 — cancelar a nota de débito estorna o lançamento (ADR-0039 §3) e liquidá-la regista o
 * recebimento (D conta do meio / C 411), como o `registarPagamento` das facturas.
 *
 *   (a) ND de 116 (100 + 16 de IVA) emitida e cancelada: no razão, 411, 711 e 44331 somam zero
 *       (lançamento da ND + o seu estorno).
 *   (b) liquidar: UM lançamento D <conta do meio> / C 411 pelo total, origem PAGAMENTO, ligado à
 *       ND (`documentoOrigemTipo 'NotaDebito'`); em numerário também RECEBIMENTO na caixa.
 *   (c) cancelar com o período da ND já apurado (APURADO/DECLARADO) ⇒ ND_PERIODO_IVA_APURADO e
 *       nada escrito.
 *   (d) cancelar uma ND liquidada ⇒ TRANSICAO_INVALIDA.
 *
 * O tenant é montado pelos serviços reais (`bootstrapContabilidade`, `emitirNotaDebito`,
 * `caixa.abrirSessao`). O apuramento de (c) é uma linha inserida à mão (fixture): o que se prova
 * é a guarda do cancelamento, não o apuramento. Os serviços são chamados por acesso dinâmico.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

const dec = (v: unknown) => new Prisma.Decimal(String(v));

describe.skipIf(skip)('#565 — cancelar e liquidar nota de débito — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let fat: any;
  let val: typeof import('@/lib/validations/faturacao');

  const sufixo = Date.now();
  const TENANT = `tenant-nd-565-${sufixo}`;
  const USER = `user-nd-565-${sufixo}`;
  const PERMISSOES = ['faturacao:nd:liquidar', 'caixa:operar', 'financas:banca:escrita'];
  const ctx = { tenantId: TENANT, userId: USER, permissions: new Set(PERMISSOES) };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  let clienteId: string;
  let contaCorrenteId: string;
  let sessaoCaixaId: string;

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  /** ND de 1 × 100 a 16% → total 116 (D 411 116 / C 711 100 / C 44331 16). */
  async function emitirND(): Promise<{ id: string; numero: string; lancamentoId: string }> {
    const input = val.EmitirNotaDebitoSchema.parse({
      clienteId,
      motivo: 'Acerto de preço',
      dataEmissao: new Date(),
      linhas: [{ descricao: 'Acerto', quantidade: 1, precoUnitario: 100, taxaIva: 0.16 }],
    });
    const r: any = await noCtx(() => fat.emitirNotaDebito(input, ctx));
    const nd = await db.notaDebito.findFirst({ where: { id: r.id, tenantId: TENANT } });
    expect(nd.lancamentoId, 'a ND guarda o lançamento da emissão').toBeTruthy();
    return { id: nd.id, numero: nd.numero, lancamentoId: nd.lancamentoId };
  }

  const cancelar = (id: string, motivo = 'Emitida por engano') => noCtx(() => fat.cancelarNotaDebito(id, motivo, ctx));
  const liquidar = (input: Record<string, unknown>) => noCtx(() => fat.liquidarNotaDebito(input, ctx));

  /** Saldo D − C por conta, sobre os lançamentos indicados. */
  async function saldos(lancamentoIds: string[]): Promise<Record<string, string>> {
    const ps = await db.partidaLancamento.findMany({
      where: { tenantId: TENANT, lancamentoId: { in: lancamentoIds } },
      include: { conta: { select: { codigo: true } } },
    });
    const s: Record<string, Prisma.Decimal> = {};
    for (const p of ps) {
      const v = dec(p.valor);
      s[p.conta.codigo] = (s[p.conta.codigo] ?? dec(0))[p.tipo === 'DEBITO' ? 'plus' : 'minus'](v);
    }
    return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.toFixed(2)]));
  }

  async function fotografia(ndId: string) {
    const nd = await db.notaDebito.findFirst({ where: { id: ndId } });
    return {
      status: nd.status,
      motivoCancelamento: nd.motivoCancelamento,
      lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
      movimentosCaixa: await db.movimentoCaixa.count({ where: { tenantId: TENANT } }),
    };
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    fat = await import('@/server/services/financas/faturacao.service');
    val = await import('@/lib/validations/faturacao');
    const caixa = await import('@/server/services/financas/caixa.service');
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({ data: { id: TENANT, nome: 'Tenant ND 565', slug: `nd-565-${sufixo}`, nuit: `${sufixo}`.slice(-9) } });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `nd-565-${sufixo}@test.mz`, nome: 'Operador ND', keycloakSub: `kc-nd-565-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const cliente = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente ND 565',
        tipo: 'JURIDICA',
        nuit: '400000565',
        email: `cliente-nd-565-${sufixo}@test.mz`,
        telefone: '840000565',
        codigo: `CLI-ND-565-${sufixo}`,
      },
    });
    clienteId = cliente.id;

    const pgc123 = await db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo: '123' } });
    const corrente = await db.contaBancaria.create({
      data: {
        tenantId: TENANT,
        banco: 'Banco ND',
        agencia: '0001',
        numeroConta: `CORRENTE-${sufixo}`,
        tipoConta: 'CORRENTE',
        contaContabilId: pgc123.id,
        ativo: true,
      },
    });
    contaCorrenteId = corrente.id;

    const sc: any = await noCtx(() => caixa.abrirSessao({ fundoInicial: 1000 }, ctx));
    sessaoCaixaId = sc.id;
  });

  it('(a) emitir e cancelar: 411, 711 e 44331 somam zero no razão; o estorno fica ligado ao lançamento da ND', async () => {
    const nd = await emitirND();
    expect(await saldos([nd.lancamentoId])).toEqual({ '411': '116.00', '711': '-100.00', '44331': '-16.00' });

    await cancelar(nd.id);

    const gravada = await db.notaDebito.findFirst({ where: { id: nd.id } });
    expect(gravada.status).toBe('CANCELADA');
    expect(gravada.motivoCancelamento).toBe('Emitida por engano');

    const original = await db.lancamento.findFirst({ where: { id: nd.lancamentoId } });
    expect(original.status).toBe('ESTORNADO');
    const estorno = await db.lancamento.findFirst({ where: { tenantId: TENANT, lancamentoEstornoId: nd.lancamentoId } });
    expect(estorno, 'lançamento de estorno').not.toBeNull();

    expect(await saldos([nd.lancamentoId, estorno.id])).toEqual({ '411': '0.00', '711': '0.00', '44331': '0.00' });
  });

  it('(b) liquidar por transferência: D 123 / C 411 pelo total, origem PAGAMENTO, ligado à ND', async () => {
    const nd = await emitirND();
    await liquidar({ id: nd.id, dataPagamento: new Date(), formaPagamento: 'TRANSFERENCIA_BANCARIA', contaBancariaId: contaCorrenteId });

    expect((await db.notaDebito.findFirst({ where: { id: nd.id } })).status).toBe('LIQUIDADA');
    const recebimentos = await db.lancamento.findMany({
      where: { tenantId: TENANT, documentoOrigemId: nd.id, origem: 'PAGAMENTO' },
    });
    expect(recebimentos).toHaveLength(1);
    expect(recebimentos[0].documentoOrigemTipo).toBe('NotaDebito');
    expect(await saldos([recebimentos[0].id])).toEqual({ '123': '116.00', '411': '-116.00' });
  });

  it('(b) liquidar em numerário: D 111 / C 411 e RECEBIMENTO na sessão de caixa aberta', async () => {
    const nd = await emitirND();
    await liquidar({ id: nd.id, dataPagamento: new Date(), formaPagamento: 'NUMERARIO' });

    const recebimentos = await db.lancamento.findMany({
      where: { tenantId: TENANT, documentoOrigemId: nd.id, origem: 'PAGAMENTO' },
    });
    expect(recebimentos).toHaveLength(1);
    expect(await saldos([recebimentos[0].id])).toEqual({ '111': '116.00', '411': '-116.00' });

    const movs = await db.movimentoCaixa.findMany({ where: { tenantId: TENANT, documentoOrigemId: nd.id } });
    expect(movs).toHaveLength(1);
    expect(movs[0].tipo).toBe('RECEBIMENTO');
    expect(movs[0].sessaoCaixaId).toBe(sessaoCaixaId);
    expect(dec(movs[0].valor).toFixed(2)).toBe('116.00');
    expect(movs[0].documentoOrigemTipo).toBe('NotaDebito');
  });

  it.each(['APURADO', 'DECLARADO'])(
    '(c) período da ND com apuramento %s ⇒ ND_PERIODO_IVA_APURADO e nada escrito',
    async (estadoApuramento) => {
      const nd = await emitirND();
      const lanc = await db.lancamento.findFirst({ where: { id: nd.lancamentoId } });
      const apuramento = await db.apuramentoIva.create({
        data: {
          tenantId: TENANT,
          periodoId: lanc.periodoId,
          versao: 1,
          estado: estadoApuramento,
          totalIvaLiquidado: 0,
          totalIvaDedutivel: 0,
          totalRegularizacoes: 0,
          saldoApuramento: 0,
          apuradoPorId: USER,
          keycloakSub: `kc-nd-565-${sufixo}`,
        },
      });
      try {
        const antes = await fotografia(nd.id);
        const erro = await capturarErro(() => cancelar(nd.id));
        expect(erro?.code).toBe('ND_PERIODO_IVA_APURADO');
        expect(await fotografia(nd.id)).toEqual(antes);
        expect((await db.lancamento.findFirst({ where: { id: nd.lancamentoId } })).status).not.toBe('ESTORNADO');
      } finally {
        await db.apuramentoIva.delete({ where: { id: apuramento.id } });
      }
    },
  );

  it('(d) cancelar uma ND liquidada é recusado', async () => {
    const nd = await emitirND();
    await liquidar({ id: nd.id, dataPagamento: new Date(), formaPagamento: 'TRANSFERENCIA_BANCARIA', contaBancariaId: contaCorrenteId });
    const antes = await fotografia(nd.id);
    const erro = await capturarErro(() => cancelar(nd.id));
    expect(erro?.code).toBe('TRANSICAO_INVALIDA');
    expect(await fotografia(nd.id)).toEqual(antes);
  });
});
