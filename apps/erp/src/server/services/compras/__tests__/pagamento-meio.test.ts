/**
 * Oráculo da issue #78 — o pagamento a fornecedor sai do meio por onde foi pago.
 *
 * T1 NUMERARIO → D 421 / C 111, diário CAIXA, MovimentoCaixa PAGAMENTO na sessão do utilizador.
 * T2 NUMERARIO sem sessão ABERTA própria → SESSAO_CAIXA_NECESSARIA, nada escrito.
 * T3 TRANSFERENCIA_BANCARIA / CHEQUE → C <PGC da ContaBancaria>, diário BANCO, sem movimento de caixa.
 * T4 M-PESA / E-MOLA exigem CARTEIRA_MOVEL; cruzamentos → CONTA_BANCARIA_INCOMPATIVEL.
 * T5 conta de outro tenant → NotFoundError; conta inactiva → CONTA_BANCARIA_INATIVA.
 *
 * Duplo COM ESTADO do Prisma (helpers/duplo-prisma.ts): não dita findFirst vs findUnique.
 * registarLancamentoContabilistico e proximoNumeroSerie são outros contratos → mockados,
 * mas o mock do lançamento grava no duplo pelo `tx` recebido, para o rollback o apanhar.
 * registarMovimentoCaixa corre a sério (financas/caixa.service.ts) sobre o duplo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { NotFoundError } from '@/lib/errors';
import { DuploPrisma, somaPartidas } from './helpers/duplo-prisma';
import { montarCenario, ctx, type Cenario } from './helpers/cenario-pagamento';

const estado = vi.hoisted(() => ({ duplo: null as unknown as { prisma: any; prismaBase: any } }));

vi.mock('@/server/db/client', () => ({
  prisma: new Proxy({}, { get: (_t, p) => estado.duplo.prisma[p as string] }),
  prismaBase: new Proxy({}, { get: (_t, p) => estado.duplo.prismaBase[p as string] }),
}));

const mocks = vi.hoisted(() => ({
  registarLancamento: vi.fn(),
  proximoNumero: vi.fn(),
}));

vi.mock('@/server/services/financas/contabilidade.service', () => ({
  registarLancamentoContabilistico: mocks.registarLancamento,
}));
vi.mock('@/server/services/financas/faturacao.service', () => ({
  proximoNumeroSerie: mocks.proximoNumero,
}));

let seq = 0;
function instalar(c: Cenario) {
  estado.duplo = c.duplo as unknown as DuploPrisma;
  mocks.registarLancamento.mockReset();
  mocks.registarLancamento.mockImplementation(async (tx: any, input: any, cx: any) => {
    const l = await tx.lancamento.create({ data: { tenantId: cx.tenantId, ...input } });
    return { id: l.id };
  });
  mocks.proximoNumero.mockReset();
  mocks.proximoNumero.mockImplementation(async (_tx: any, tipo: string) => `${tipo}-2026-${String(++seq).padStart(5, '0')}`);
}

async function servico() {
  const { contaPagarService } = await import('../conta-pagar.service');
  return contaPagarService;
}

function input(c: Cenario, extra: Record<string, unknown>) {
  return {
    contaPagarId: c.contaPagarId,
    dataPagamento: new Date('2026-09-20T10:00:00Z'),
    valor: 250.5,
    referencia: 'REF-78',
    ...extra,
  } as any;
}

function unicoLancamento(c: Cenario) {
  const ls = c.duplo.linhas('lancamento');
  expect(ls).toHaveLength(1);
  return ls[0];
}

function creditos(l: any) {
  return l.partidas.filter((p: any) => p.tipo === 'CREDITO');
}
function debitos(l: any) {
  return l.partidas.filter((p: any) => p.tipo === 'DEBITO');
}

function afirmarEquilibrado(l: any, valor: string) {
  const v = new Prisma.Decimal(valor);
  expect(somaPartidas(l.partidas, 'DEBITO').toFixed(2)).toBe(v.toFixed(2));
  expect(somaPartidas(l.partidas, 'CREDITO').toFixed(2)).toBe(v.toFixed(2));
  const d = debitos(l);
  expect(d).toHaveLength(1);
  expect(d[0].contaCodigo).toBe('421');
}

/** Nada escrito: nem Pagamento, nem lançamento, nem movimento; ContaPagar intacta. */
function afirmarNadaEscrito(c: Cenario, contaAntes: any) {
  expect(c.duplo.linhas('pagamento')).toHaveLength(0);
  expect(c.duplo.linhas('lancamento')).toHaveLength(0);
  expect(c.duplo.linhas('movimentoCaixa')).toHaveLength(0);
  const conta = c.duplo.linhas('contaPagar').find((r) => r.id === c.contaPagarId)!;
  expect(String(conta.valorPago)).toBe(String(contaAntes.valorPago));
  expect(String(conta.valorRestante)).toBe(String(contaAntes.valorRestante));
  expect(conta.status).toBe(contaAntes.status);
}

beforeEach(() => {
  seq = 0;
});

// =====================================================================
// T1 — NUMERARIO com sessão aberta do utilizador
// =====================================================================

describe('T1 — NUMERARIO sai da caixa (111) com movimento na sessão do utilizador', () => {
  it('D 421 / C 111, diário CAIXA, movimento PAGAMENTO na sessão própria, lancamentoId gravado', async () => {
    const c = montarCenario({ sessaoPropria: true, sessaoAlheia: true });
    instalar(c);
    const svc = await servico();

    await svc.registarPagamento(input(c, { formaPagamento: 'NUMERARIO', valor: 250.5 }), ctx);

    const l = unicoLancamento(c);
    afirmarEquilibrado(l, '250.50');
    const cr = creditos(l);
    expect(cr).toHaveLength(1);
    expect(cr[0].contaCodigo).toBe('111');
    expect(l.diarioTipo).toBe('CAIXA');

    const pags = c.duplo.linhas('pagamento');
    expect(pags).toHaveLength(1);
    expect(pags[0].lancamentoId).toBe(l.id);

    const movs = c.duplo.linhas('movimentoCaixa');
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({
      tipo: 'PAGAMENTO',
      sessaoCaixaId: c.sessaoPropriaId,
      documentoOrigemTipo: 'Pagamento',
      documentoOrigemId: pags[0].id,
      tenantId: ctx.tenantId,
    });
    expect(new Prisma.Decimal(String(movs[0].valor)).toFixed(2)).toBe('250.50');
  });
});

// =====================================================================
// T2 — NUMERARIO sem sessão própria
// =====================================================================

describe('T2 — NUMERARIO sem sessão ABERTA do próprio utilizador', () => {
  it.each([
    ['nenhuma sessão aberta', { sessaoPropria: false, sessaoAlheia: false }],
    ['só a sessão de outro utilizador', { sessaoPropria: false, sessaoAlheia: true }],
  ])('%s → SESSAO_CAIXA_NECESSARIA e nada escrito', async (_nome, opts) => {
    const c = montarCenario(opts);
    instalar(c);
    const contaAntes = { ...c.duplo.linhas('contaPagar')[0] };
    const svc = await servico();

    await expect(
      svc.registarPagamento(input(c, { formaPagamento: 'NUMERARIO' }), ctx),
    ).rejects.toMatchObject({ code: 'SESSAO_CAIXA_NECESSARIA' });

    afirmarNadaEscrito(c, contaAntes);
  });

  it('uma sessão própria FECHADA não conta como aberta', async () => {
    const c = montarCenario({ sessaoPropria: true });
    c.duplo.linhas('sessaoCaixa')[0].status = 'FECHADA';
    instalar(c);
    const contaAntes = { ...c.duplo.linhas('contaPagar')[0] };
    const svc = await servico();

    await expect(
      svc.registarPagamento(input(c, { formaPagamento: 'NUMERARIO' }), ctx),
    ).rejects.toMatchObject({ code: 'SESSAO_CAIXA_NECESSARIA' });
    afirmarNadaEscrito(c, contaAntes);
  });
});

// =====================================================================
// T3 — TRANSFERENCIA_BANCARIA e CHEQUE
// =====================================================================

describe('T3 — meios bancários creditam a conta PGC da ContaBancaria', () => {
  it.each(['TRANSFERENCIA_BANCARIA', 'CHEQUE'])(
    '%s com conta CORRENTE (PGC 123) → C 123, diário BANCO, zero movimentos de caixa',
    async (forma) => {
      // Sessão própria aberta de propósito: um meio bancário não pode tocar na caixa.
      const c = montarCenario({ sessaoPropria: true });
      instalar(c);
      const svc = await servico();

      await svc.registarPagamento(
        input(c, { formaPagamento: forma, contaBancariaId: c.bancos.corrente, valor: 400 }),
        ctx,
      );

      const l = unicoLancamento(c);
      afirmarEquilibrado(l, '400');
      const cr = creditos(l);
      expect(cr).toHaveLength(1);
      expect(cr[0].contaCodigo).toBe('123');
      expect(l.diarioTipo).toBe('BANCO');
      expect(c.duplo.linhas('movimentoCaixa')).toHaveLength(0);
      expect(c.duplo.linhas('pagamento')[0].lancamentoId).toBe(l.id);
    },
  );

  it('TRANSFERENCIA_BANCARIA com conta POUPANCA credita a sua PGC (1231), não um código fixo', async () => {
    const c = montarCenario();
    instalar(c);
    const svc = await servico();

    await svc.registarPagamento(
      input(c, { formaPagamento: 'TRANSFERENCIA_BANCARIA', contaBancariaId: c.bancos.poupanca, valor: 10 }),
      ctx,
    );

    const l = unicoLancamento(c);
    expect(creditos(l).map((p: any) => p.contaCodigo)).toEqual(['1231']);
  });
});

// =====================================================================
// T4 — carteiras móveis
// =====================================================================

describe('T4 — M-PESA / E-MOLA exigem CARTEIRA_MOVEL', () => {
  it.each(['M-PESA', 'E-MOLA'])('%s com CARTEIRA_MOVEL → C na PGC da carteira (1241), diário BANCO', async (forma) => {
    const c = montarCenario({ sessaoPropria: true });
    instalar(c);
    const svc = await servico();

    await svc.registarPagamento(
      input(c, { formaPagamento: forma, contaBancariaId: c.bancos.carteira, valor: 99.99 }),
      ctx,
    );

    const l = unicoLancamento(c);
    afirmarEquilibrado(l, '99.99');
    expect(creditos(l).map((p: any) => p.contaCodigo)).toEqual(['1241']);
    expect(l.diarioTipo).toBe('BANCO');
    expect(c.duplo.linhas('movimentoCaixa')).toHaveLength(0);
  });

  it.each([
    ['M-PESA', 'corrente'],
    ['E-MOLA', 'corrente'],
    ['TRANSFERENCIA_BANCARIA', 'carteira'],
    ['CHEQUE', 'carteira'],
  ] as const)('%s com conta %s → CONTA_BANCARIA_INCOMPATIVEL e nada escrito', async (forma, qual) => {
    const c = montarCenario();
    instalar(c);
    const contaAntes = { ...c.duplo.linhas('contaPagar')[0] };
    const svc = await servico();

    await expect(
      svc.registarPagamento(input(c, { formaPagamento: forma, contaBancariaId: c.bancos[qual] }), ctx),
    ).rejects.toMatchObject({ code: 'CONTA_BANCARIA_INCOMPATIVEL' });
    afirmarNadaEscrito(c, contaAntes);
  });
});

// =====================================================================
// T5 — conta de outro tenant / inactiva
// =====================================================================

describe('T5 — conta bancária de outro tenant ou inactiva', () => {
  it('contaBancariaId de outro tenant → NotFoundError, nada escrito', async () => {
    const c = montarCenario();
    instalar(c);
    const contaAntes = { ...c.duplo.linhas('contaPagar')[0] };
    const svc = await servico();

    await expect(
      svc.registarPagamento(
        input(c, { formaPagamento: 'TRANSFERENCIA_BANCARIA', contaBancariaId: c.bancos.outroTenant }),
        ctx,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    afirmarNadaEscrito(c, contaAntes);
  });

  it('contaBancariaId inexistente → NotFoundError', async () => {
    const c = montarCenario();
    instalar(c);
    const svc = await servico();

    await expect(
      svc.registarPagamento(
        input(c, { formaPagamento: 'CHEQUE', contaBancariaId: '99860c43-83f7-4b41-ae1d-9e895920452a' }),
        ctx,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('conta bancária com ativo=false → CONTA_BANCARIA_INATIVA, nada escrito', async () => {
    const c = montarCenario();
    instalar(c);
    const contaAntes = { ...c.duplo.linhas('contaPagar')[0] };
    const svc = await servico();

    await expect(
      svc.registarPagamento(
        input(c, { formaPagamento: 'TRANSFERENCIA_BANCARIA', contaBancariaId: c.bancos.inactiva }),
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'CONTA_BANCARIA_INATIVA' });
    afirmarNadaEscrito(c, contaAntes);
  });
});
