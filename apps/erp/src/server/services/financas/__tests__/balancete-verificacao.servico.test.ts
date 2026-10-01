// ---------------------------------------------------------------------------
// Balancete de verificação PHC — SERVIÇO sem base (`gerarBalanceteVerificacao`):
// detecção do diário AB, abertura implícita e guarda do exercício cross-tenant.
// Run balancete-phc, S1 iter 2, issue #280, ADR-0040 §4 («com AB não há abertura
// implícita» — é o teste que impede a duplicação quando o ADR-0035 existir).
//
// Escrito pelo AUTOR DO ORÁCULO; NUNCA `vitest -u`; um agente de implementação
// que altere este ficheiro é BLOCKER.
//
// Duplo: `vi.mock('@/server/db/client')`, no estilo de defeitos-adr0033.test.ts.
// O acoplamento à forma das consultas é mínimo e deliberado:
//  - `partidaLancamento.groupBy` é discriminado por UMA coisa estável: a consulta
//    dos saldos ANTERIORES ao exercício é a única com um filtro de data `lt`
//    (procurado em profundidade no `where`); todas as outras (movimento e
//    acumulado, por período) recebem os agregados do ano. Os cenários usam
//    periodoInicial = 1, por isso movimento = acumulado e não é preciso
//    distingui-los.
//  - A detecção do AB pode ser um `lancamento.count` ou um `lancamento.findFirst`:
//    os dois respondem segundo o cenário (há / não há lançamento AB).
//  - `exercicioContabil.findFirst` só devolve o exercício a quem o pede com o
//    tenantId DONO (modela a base: o exercício de outro tenant não se vê).
// O que se afirma é COMPORTAMENTO (abertura sim/não, sintética, NotFoundError),
// mais (3): a consulta do AB menciona o tenant, o exercício e ABERTURA — sem
// fixar o aninhamento.
// ---------------------------------------------------------------------------
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  groupBy: vi.fn(),
  contaFindMany: vi.fn(),
  lancCount: vi.fn(),
  lancFindFirst: vi.fn(),
  exFindFirst: vi.fn(),
}));

vi.mock('@/server/db/client', () => ({
  prisma: {
    partidaLancamento: { groupBy: mocks.groupBy },
    contaPGC: { findMany: mocks.contaFindMany },
    lancamento: { count: mocks.lancCount, findFirst: mocks.lancFindFirst },
    exercicioContabil: { findFirst: mocks.exFindFirst },
  },
  prismaBase: {},
}));

import { NotFoundError } from '@/lib/errors';
import { gerarBalanceteVerificacao } from '../contabilidade.service';

const D = (v: string) => new Prisma.Decimal(v);
const CTX = { tenantId: 'tenant-bv', userId: 'user-bv' };
const OUTRO_TENANT = 'tenant-alheio';
const EX = { id: 'ex-2026', codigo: '2026', dataInicio: new Date('2025-12-31T22:00:00.000Z'), dataFim: new Date('2026-12-31T21:59:59.999Z') };
const EX_ALHEIO = { id: 'ex-alheio-2026', codigo: '2026', dataInicio: EX.dataInicio, dataFim: EX.dataFim };
const EXERCICIOS = [
  { ...EX, tenantId: CTX.tenantId },
  { ...EX_ALHEIO, tenantId: OUTRO_TENANT },
];

const conta = (codigo: string, classe: string, natureza: 'DEVEDORA' | 'CREDORA') => ({
  id: `id-${codigo}`, codigo, nome: `Conta ${codigo}`, classe, natureza, nivel: 3, contaMaeId: null, aceitaLancamento: true,
});
const CONTAS = [
  conta('121', 'CLASSE_1', 'DEVEDORA'),
  conta('51', 'CLASSE_5', 'CREDORA'),
  conta('6112', 'CLASSE_6', 'DEVEDORA'),
  conta('711', 'CLASSE_7', 'CREDORA'),
];
const ag = (codigo: string, tipo: 'DEBITO' | 'CREDITO', v: string) => ({ contaId: `id-${codigo}`, tipo, _sum: { valor: D(v) } });

// Ano: venda de 100. Anterior (equilibrado): 121 D 1000 C 300 (+700), 51 C 1000, 6112 D 300 (R = +300).
const ANO = [ag('121', 'DEBITO', '100'), ag('711', 'CREDITO', '100')];
const ANTERIORES = [ag('121', 'DEBITO', '1000'), ag('121', 'CREDITO', '300'), ag('51', 'CREDITO', '1000'), ag('6112', 'DEBITO', '300')];

/** Procura em profundidade um objecto com chave `lt` debaixo de uma chave `data`. */
function temFiltroDataLt(v: unknown, dentroDeData = false): boolean {
  if (v === null || typeof v !== 'object' || v instanceof Date) return false;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (dentroDeData && k === 'lt') return true;
    if (temFiltroDataLt(x, k === 'data')) return true;
  }
  return false;
}

/** Todos os valores escalares (e Datas) de uma árvore. */
function valores(v: unknown, out: unknown[] = []): unknown[] {
  if (v === null || typeof v !== 'object' || v instanceof Date) out.push(v);
  else for (const x of Object.values(v as Record<string, unknown>)) valores(x, out);
  return out;
}

let haLancamentoAB = false;

beforeEach(() => {
  vi.clearAllMocks();
  haLancamentoAB = false;
  mocks.groupBy.mockImplementation(async (args: { where?: unknown }) => {
    if (args.where && (args.where as { tenantId?: string }).tenantId !== CTX.tenantId) return [];
    return temFiltroDataLt(args.where) ? ANTERIORES : ANO;
  });
  mocks.contaFindMany.mockImplementation(async () => CONTAS);
  mocks.lancCount.mockImplementation(async () => (haLancamentoAB ? 1 : 0));
  mocks.lancFindFirst.mockImplementation(async () => (haLancamentoAB ? { id: 'lanc-ab-1' } : null));
  mocks.exFindFirst.mockImplementation(async (args: { where?: { tenantId?: string; id?: string } }) => {
    const w = args.where ?? {};
    const e = EXERCICIOS.find((x) => x.tenantId === w.tenantId && (w.id === undefined || x.id === w.id));
    if (!e) return null;
    const { tenantId: _t, ...sem } = e;
    return sem;
  });
});

const FILTRO = { exercicioId: EX.id, periodoInicial: 1, periodoFinal: 3, incluir13: false };
const linha = (r: Awaited<ReturnType<typeof gerarBalanceteVerificacao>>, codigo: string) =>
  r.linhas.find((l) => l.conta?.codigo === codigo);

describe('gerarBalanceteVerificacao — detecção do diário AB (ADR-0040 §4)', () => {
  it('(1) o exercício TEM lançamento no diário AB: sem abertura implícita nem sintética, apesar de haver saldos anteriores', async () => {
    haLancamentoAB = true;
    const r = await gerarBalanceteVerificacao(FILTRO, CTX);
    expect(r.temAberturaImplicita).toBe(false);
    expect(r.temResultadosAnterioresPorEncerrar).toBe(false);
    expect(r.linhas.every((l) => l.conta !== null && !l.implicita)).toBe(true);
    // 121 só com o ano (100), sem os +700 anteriores; 51 (só anterior) não aparece.
    expect(linha(r, '121')!.acumD.equals(D('100'))).toBe(true);
    expect(linha(r, '121')!.acumC.equals(D('0'))).toBe(true);
    expect(linha(r, '51')).toBeUndefined();
    expect(r.totais.acumD.equals(D('100'))).toBe(true);
    expect(r.equilibrio).toEqual({ movimento: true, acumulado: true, saldo: true });
  });

  it('(2) sem lançamento AB: os saldos anteriores entram (121 +700, 51 credor 1000, sintética +300) e temAberturaImplicita é true', async () => {
    haLancamentoAB = false;
    const r = await gerarBalanceteVerificacao(FILTRO, CTX);
    expect(r.temAberturaImplicita).toBe(true);
    expect(r.temResultadosAnterioresPorEncerrar).toBe(true);
    expect(linha(r, '121')!.acumD.equals(D('800'))).toBe(true);
    expect(linha(r, '121')!.movD.equals(D('100'))).toBe(true);
    expect(linha(r, '51')!.acumC.equals(D('1000'))).toBe(true);
    expect(linha(r, '6112')).toBeUndefined();
    const s = r.linhas.filter((l) => l.conta === null);
    expect(s).toHaveLength(1);
    expect(s[0]!.acumD.equals(D('300'))).toBe(true);
    // acumD 800 + 300 = 1100 = acumC 1000 + 100
    expect(r.totais.acumD.equals(D('1100'))).toBe(true);
    expect(r.totais.acumC.equals(D('1100'))).toBe(true);
    expect(r.equilibrio).toEqual({ movimento: true, acumulado: true, saldo: true });
  });

  it('(3) a consulta do AB é do tenant, do exercício e do diário de tipo ABERTURA', async () => {
    await gerarBalanceteVerificacao(FILTRO, CTX);
    const chamadas = [...mocks.lancCount.mock.calls, ...mocks.lancFindFirst.mock.calls].map((c) => c[0]);
    const doAB = chamadas.filter((a) => valores(a).includes('ABERTURA'));
    expect(doAB.length, 'nenhuma consulta de lançamento menciona o diário ABERTURA').toBeGreaterThan(0);
    for (const a of doAB) {
      const vs = valores(a);
      expect(vs, 'consulta do AB sem tenantId do contexto').toContain(CTX.tenantId);
      expect(vs, 'consulta do AB não restringe ao exercício').toContain(EX.id);
      expect(vs).not.toContain(OUTRO_TENANT);
    }
  });

  it('(4) exercicioId de outro tenant → NotFoundError, e nenhuma soma é lida', async () => {
    await expect(
      gerarBalanceteVerificacao({ ...FILTRO, exercicioId: EX_ALHEIO.id }, CTX),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mocks.groupBy).not.toHaveBeenCalled();
  });
});
