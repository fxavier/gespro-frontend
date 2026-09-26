/**
 * ORÁCULO do nó `export-v` (grafo `dfc`, gate do ticket 9.1) — escrito pelo
 * `verificador-fluxo-caixa` ANTES de a rota existir. Ficheiro protegido: o
 * autor (`feat-dfc`) não o altera; um oráculo mudado para a solução passar é
 * BLOCKER (doutrina §2).
 *
 * GET /api/contabilidade/dfc/export?dataInicio=aaaa-mm-dd&dataFim=aaaa-mm-dd
 *
 * Contrato (ADR-0037 §7 com a Emenda 2026-09-25, E4; ticket 9.1):
 *  - Route Handler por `withApi`, método `GET`, permissão `financas:exportar`,
 *    `runtime = 'nodejs'` (o motor de PDF do ADR-0005 só corre em Node).
 *  - O pedido tem a MESMA forma que a página `/contabilidade/dfc`: datas
 *    `dataInicio`/`dataFim` (`aaaa-mm-dd`), resolvidas para períodos
 *    contabilísticos com `resolverIntervaloDFC` (`src/lib/dfc-intervalo.ts`)
 *    sobre `listarPeriodos` — exactamente como a página. Assim o botão do 9.2
 *    reaproveita a query string da página, e o PDF é do intervalo que o
 *    utilizador está a ver (incluindo o alargamento a períodos completos).
 *  - Só PDF (E4). Leva as colunas N e N-1, o número da versão do mapeamento,
 *    e as marcas «Provisório» e «Mapeamento por validar» quando se aplicam.
 *  - Impedimentos ⇒ 422 com a lista em JSON, sem PDF.
 *  - Exportar nunca se trava em Leitura (ADR-0032): o GET passa.
 *
 * O serviço (`gerarDFC`) é um duplo: o seu comportamento é verificado pelos
 * oráculos dele (`dfc.golden`, `dfc.property`, `dfc.impedimentos-isolamento`).
 * Aqui verifica-se a ROTA: o que faz com cada forma do resultado do serviço.
 * O PDF é o real, renderizado pelo motor — a extracção de texto está em
 * `pdf-texto.ts`, calibrada antes de cada asserção sobre texto.
 *
 * A rota é importada dinamicamente em cada teste para que, sem implementação,
 * cada caso falhe sozinho e pela razão certa (módulo em falta).
 */
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { ERROS_DFC } from '@/server/services/financas/dfc.interface';
import type {
  ColunaDFC,
  DFC,
  ImpedimentosDFC,
  LinhaRubricaDFC,
  PeriodoRef,
  RubricaResumo,
  SeccaoDFC,
} from '@/server/services/financas/dfc.interface';
import type { PeriodoContabil } from '@/server/services/financas/contabilidade.interface';
import { algarismos, contem, garantirExtractor, textoCompacto } from './pdf-texto';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  gerarDFC: vi.fn(),
  contasNaoMapeadas: vi.fn(),
  listarPeriodos: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));

vi.mock('@/server/services/financas/dfc.service', () => ({
  gerarDFC: mocks.gerarDFC,
  contasNaoMapeadas: mocks.contasNaoMapeadas,
  dfcService: { gerarDFC: mocks.gerarDFC, contasNaoMapeadas: mocks.contasNaoMapeadas },
}));

vi.mock('@/server/services/financas/contabilidade.service', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const contabilidadeService = (original.contabilidadeService ?? {}) as Record<string, unknown>;
  return {
    ...original,
    listarPeriodos: mocks.listarPeriodos,
    contabilidadeService: { ...contabilidadeService, listarPeriodos: mocks.listarPeriodos },
  };
});

// O limitador de exportações (10/min por utilizador) não é o objecto deste
// oráculo; sem o neutralizar, a própria suite esgotava a quota.
vi.mock('@/server/security/rate-limiter', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    exportLimiter: { consume: async () => ({ limited: false, remaining: 10, retryAfterSec: 0 }) },
  };
});

const rota = () => import('../route');

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

const TENANT = 'tenant-abc';
const USER = 'u1';
const EXPORTAR = 'financas:exportar';

function sessao(permissions: string[], acesso: 'aberto' | 'leitura' = 'aberto', tenantId = TENANT) {
  return { user: { id: USER, tenantId, permissions, acesso } };
}

// ---------------------------------------------------------------------------
// Calendário: exercícios 2025 e 2026, 12 períodos mensais, limites em Maputo
// ---------------------------------------------------------------------------

function periodo(ano: number, mes: number): PeriodoContabil {
  const mm = String(mes).padStart(2, '0');
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return {
    id: `per-${ano}-${mm}`,
    tenantId: TENANT,
    exercicioId: `ex-${ano}`,
    ordem: mes,
    codigo: `${ano}-${mm}`,
    // Dia civil em Africa/Maputo (UTC+2), com o fuso explícito — nunca `new Date('aaaa-mm-dd')`.
    dataInicio: new Date(`${ano}-${mm}-01T00:00:00.000+02:00`),
    dataFim: new Date(`${ano}-${mm}-${String(ultimo).padStart(2, '0')}T23:59:59.999+02:00`),
    estado: ano === 2025 ? 'FECHADO' : 'ABERTO',
    fechadoEm: null,
    fechadoPorId: null,
    createdAt: new Date('2025-01-01T00:00:00.000+02:00'),
    updatedAt: new Date('2025-01-01T00:00:00.000+02:00'),
  };
}

const PERIODOS: PeriodoContabil[] = [2025, 2026].flatMap((ano) =>
  Array.from({ length: 12 }, (_, i) => periodo(ano, i + 1)),
);

// ---------------------------------------------------------------------------
// DFC de duplo — montantes escolhidos para serem inconfundíveis no PDF
// ---------------------------------------------------------------------------

const D = (v: string) => new Prisma.Decimal(v);
const ZERO = D('0');

/** Algarismos que só aparecem no PDF se a coluna N for escrita. */
const N = { caixaFinal: '4235981.20', clientes: '-123456.78', resultado: '702519.36' };
/** Idem para a coluna N-1 (homólogo). */
const N1 = { caixaFinal: '1918273.64', clientes: '-87654.29', resultado: '311408.57' };
const VERSAO = 37;

const soAlgarismos = (v: string) => v.replace(/\D+/g, '');

function ref(p: PeriodoContabil): PeriodoRef {
  const { id, codigo, ordem, dataInicio, dataFim, estado } = p;
  return { id, codigo, ordem, dataInicio, dataFim, estado };
}

const RUBRICA_CLIENTES: RubricaResumo = {
  id: 'rub-op-02',
  codigo: 'OP-02',
  designacao: 'Variação de clientes',
  atividade: 'OPERACIONAL',
  sinal: 'VARIACAO',
  ordem: 2,
};

function seccao(atividade: SeccaoDFC['atividade'], rubricas: LinhaRubricaDFC[], total: Prisma.Decimal): SeccaoDFC {
  return { atividade, rubricas, total };
}

function coluna(ano: number, v: typeof N): ColunaDFC {
  const resultado = D(v.resultado);
  const clientes = D(v.clientes);
  const op = resultado.plus(clientes);
  const caixaFinal = D(v.caixaFinal);
  const caixaInicial = caixaFinal.minus(op);
  return {
    exercicio: { id: `ex-${ano}`, codigo: String(ano) },
    periodoInicio: ref(periodo(ano, 4)),
    periodoFim: ref(periodo(ano, 6)),
    seccoes: {
      resultadoLiquido: resultado,
      operacional: seccao('OPERACIONAL', [{ rubrica: RUBRICA_CLIENTES, valor: clientes, contas: [] }], op),
      investimento: seccao('INVESTIMENTO', [], ZERO),
      financiamento: seccao('FINANCIAMENTO', [], ZERO),
      somaAtividades: op,
    },
    caixaInicial,
    caixaFinal,
    variacaoCaixa: caixaFinal.minus(caixaInicial),
  };
}

function dfc(opts: { estado: 'PENDING' | 'VALIDATED'; provisorio: boolean; comHomologo?: boolean }): DFC {
  return {
    atual: coluna(2026, N),
    homologo: opts.comHomologo === false ? null : coluna(2025, N1),
    provisorio: opts.provisorio,
    versao: { id: `ver-${VERSAO}`, numero: VERSAO, estado: opts.estado },
    avisos: [],
  };
}

const IMPEDIMENTOS: ImpedimentosDFC = {
  impedimentos: [
    'A conta 2411 Imobilizado em curso tem movimento no intervalo e não está mapeada a nenhuma rubrica.',
    'A conta 44331 IVA liquidado tem movimento no comparativo N-1 e não está mapeada a nenhuma rubrica.',
  ],
  contasNaoMapeadas: [
    {
      conta: { id: 'c-2411', codigo: '2411', nome: 'Imobilizado em curso', classe: 'CLASSE_2', natureza: 'DEVEDORA' },
      movimento: D('15000.00'),
      saldoFinal: D('15000.00'),
      comparativo: false,
    },
    {
      conta: { id: 'c-44331', codigo: '44331', nome: 'IVA liquidado', classe: 'CLASSE_4', natureza: 'DEVEDORA' },
      movimento: D('-3400.50'),
      saldoFinal: D('-3400.50'),
      comparativo: true,
    },
  ],
  avisos: [],
};

// ---------------------------------------------------------------------------
// Pedido
// ---------------------------------------------------------------------------

const URL_BASE = 'http://localhost:3000/api/contabilidade/dfc/export';

function pedido(qs = 'dataInicio=2026-04-01&dataFim=2026-06-30'): NextRequest {
  return new NextRequest(`${URL_BASE}${qs ? `?${qs}` : ''}`);
}

async function chamar(req: NextRequest = pedido()): Promise<Response> {
  const { GET } = await rota();
  return GET(req, { params: Promise.resolve({}) });
}

async function corpo(res: Response): Promise<Uint8Array> {
  return new Uint8Array(await res.arrayBuffer());
}

function comecaPorPdf(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-';
}

async function pdfDe(resultado: DFC): Promise<Uint8Array> {
  await garantirExtractor();
  mocks.gerarDFC.mockResolvedValue(resultado);
  const res = await chamar();
  expect(res.status).toBe(200);
  const bytes = await corpo(res);
  expect(comecaPorPdf(bytes)).toBe(true);
  return bytes;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(sessao([EXPORTAR, 'financas:fluxo-caixa:leitura']));
  mocks.listarPeriodos.mockResolvedValue(PERIODOS);
  mocks.gerarDFC.mockResolvedValue(dfc({ estado: 'PENDING', provisorio: true }));
});

// ===========================================================================

describe('GET /api/contabilidade/dfc/export — forma da rota', () => {
  it('declara runtime Node (o motor de PDF do ADR-0005 não corre em Edge)', async () => {
    const mod = await rota();
    expect(mod.runtime).toBe('nodejs');
    expect(typeof mod.GET).toBe('function');
  });

  it('resolve as datas da página para os períodos que as contêm e chama gerarDFC com o tenant da sessão', async () => {
    const res = await chamar(pedido('dataInicio=2026-04-01&dataFim=2026-06-30'));
    expect(res.status).toBe(200);
    expect(mocks.gerarDFC).toHaveBeenCalledTimes(1);
    const [filtro, ctx] = mocks.gerarDFC.mock.calls[0]!;
    expect(filtro).toEqual({ periodoInicioId: 'per-2026-04', periodoFimId: 'per-2026-06' });
    expect(ctx).toMatchObject({ tenantId: TENANT, userId: USER });
  });

  it('alarga a períodos completos como a página (15/04 a 10/06 ⇒ 2026-04 a 2026-06)', async () => {
    const res = await chamar(pedido('dataInicio=2026-04-15&dataFim=2026-06-10'));
    expect(res.status).toBe(200);
    expect(mocks.gerarDFC.mock.calls[0]![0]).toEqual({ periodoInicioId: 'per-2026-04', periodoFimId: 'per-2026-06' });
  });

  it('TEM DE RECUSAR uma data inválida (30/02) sem chamar o serviço e sem PDF', async () => {
    const res = await chamar(pedido('dataInicio=2026-02-30&dataFim=2026-06-30'));
    expect([400, 422]).toContain(res.status);
    expect(res.headers.get('content-type') ?? '').toContain('application/json');
    expect(comecaPorPdf(await corpo(res))).toBe(false);
    expect(mocks.gerarDFC).not.toHaveBeenCalled();
  });

  it('TEM DE RECUSAR uma data sem período contabilístico, sem chamar o serviço e sem PDF', async () => {
    const res = await chamar(pedido('dataInicio=2031-01-01&dataFim=2031-03-31'));
    expect([400, 404, 422]).toContain(res.status);
    expect(comecaPorPdf(await corpo(res))).toBe(false);
    expect(mocks.gerarDFC).not.toHaveBeenCalled();
  });
});

describe('GET — PDF da DFC', () => {
  it('200, application/pdf, anexo .pdf, corpo começa por %PDF', async () => {
    const res = await chamar();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('application/pdf');
    const disp = res.headers.get('content-disposition') ?? '';
    expect(disp).toContain('attachment');
    expect(disp).toMatch(/\.pdf"?$/);
    expect(comecaPorPdf(await corpo(res))).toBe(true);
  });

  it('versão PENDING ⇒ o PDF diz «Mapeamento por validar»', async () => {
    const pdf = await pdfDe(dfc({ estado: 'PENDING', provisorio: false }));
    expect(contem(pdf, 'Mapeamento por validar')).toBe(true);
  });

  it('versão VALIDATED ⇒ o PDF NÃO diz «Mapeamento por validar»', async () => {
    const pdf = await pdfDe(dfc({ estado: 'VALIDATED', provisorio: false }));
    expect(contem(pdf, 'Mapeamento por validar')).toBe(false);
  });

  it('provisório ⇒ o PDF diz «Provisório»', async () => {
    const pdf = await pdfDe(dfc({ estado: 'VALIDATED', provisorio: true }));
    expect(contem(pdf, 'Provisório')).toBe(true);
  });

  it('não provisório ⇒ o PDF NÃO diz «Provisório»', async () => {
    const pdf = await pdfDe(dfc({ estado: 'VALIDATED', provisorio: false }));
    expect(contem(pdf, 'Provisório')).toBe(false);
  });

  it('leva o número da versão do mapeamento (E1), em PENDING e em VALIDATED', async () => {
    for (const estado of ['PENDING', 'VALIDATED'] as const) {
      const pdf = await pdfDe(dfc({ estado, provisorio: false }));
      const texto = textoCompacto(pdf);
      expect(
        /vers[aã]o[^0-9]{0,20}37(?!\d)/.test(texto) || /mapeamentov37(?!\d)/.test(texto),
        `versão ${VERSAO} ausente do PDF (${estado})`,
      ).toBe(true);
    }
  });

  it('é a Demonstração de Fluxos de Caixa', async () => {
    const pdf = await pdfDe(dfc({ estado: 'PENDING', provisorio: true }));
    expect(contem(pdf, 'Fluxos de Caixa')).toBe(true);
  });

  it('leva a coluna N: caixa final, uma rubrica e o resultado líquido do intervalo', async () => {
    const pdf = await pdfDe(dfc({ estado: 'PENDING', provisorio: true }));
    const digitos = algarismos(pdf);
    for (const v of Object.values(N)) expect(digitos, `N: ${v}`).toContain(soAlgarismos(v));
  });

  it('leva a coluna N-1 (homólogo, E3): caixa final, uma rubrica e o resultado líquido', async () => {
    const pdf = await pdfDe(dfc({ estado: 'PENDING', provisorio: true }));
    const digitos = algarismos(pdf);
    for (const v of Object.values(N1)) expect(digitos, `N-1: ${v}`).toContain(soAlgarismos(v));
  });

  it('sem exercício anterior (homologo null) ⇒ PDF na mesma, sem valores N-1 inventados', async () => {
    const pdf = await pdfDe(dfc({ estado: 'PENDING', provisorio: true, comHomologo: false }));
    const digitos = algarismos(pdf);
    expect(digitos).toContain(soAlgarismos(N.caixaFinal));
    for (const v of Object.values(N1)) expect(digitos).not.toContain(soAlgarismos(v));
    expect(textoCompacto(pdf)).toContain('—');
  });
});

describe('GET — impedimentos e recusas do serviço: nunca PDF', () => {
  it('TEM DE RESPONDER 422 com a lista completa de impedimentos em JSON, e sem PDF', async () => {
    mocks.gerarDFC.mockResolvedValue(IMPEDIMENTOS);
    const res = await chamar();
    expect(res.status).toBe(422);
    expect(res.headers.get('content-type') ?? '').toContain('application/json');
    const bytes = await corpo(res);
    expect(comecaPorPdf(bytes)).toBe(false);
    const texto = Buffer.from(bytes).toString('utf8');
    const json: unknown = JSON.parse(texto);
    expect(json).toBeTypeOf('object');
    // Todas de uma vez (§4, I7): cada frase e cada conta, incluindo a 44331 do comparativo.
    for (const frase of IMPEDIMENTOS.impedimentos) expect(texto).toContain(frase);
    for (const c of IMPEDIMENTOS.contasNaoMapeadas) expect(texto).toContain(c.conta.codigo);
  });

  it.each([ERROS_DFC.DFC_NAO_ARTICULA, ERROS_DFC.DFC_ENTRE_EXERCICIOS, ERROS_DFC.DFC_INTERVALO_INVERTIDO])(
    'TEM DE PROPAGAR %s do serviço (409, código no envelope) e não sair PDF',
    async (codigo) => {
      mocks.gerarDFC.mockRejectedValue(new BusinessRuleError(codigo, `recusa ${codigo}`, { delta: '0.01' }));
      const res = await chamar();
      expect(res.status).toBe(409);
      const bytes = await corpo(res);
      expect(comecaPorPdf(bytes)).toBe(false);
      const json = JSON.parse(Buffer.from(bytes).toString('utf8')) as { error?: { code?: string } };
      expect(json.error?.code).toBe(codigo);
    },
  );
});

describe('GET — acesso', () => {
  it('TEM DE RECUSAR sem sessão (401), sem chamar o serviço', async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await chamar();
    expect(res.status).toBe(401);
    expect(mocks.gerarDFC).not.toHaveBeenCalled();
  });

  it('TEM DE RECUSAR sem financas:exportar (403), mesmo com a leitura da DFC', async () => {
    mocks.auth.mockResolvedValue(sessao(['financas:fluxo-caixa:leitura', 'financas:leitura']));
    const res = await chamar();
    expect(res.status).toBe(403);
    expect(comecaPorPdf(await corpo(res))).toBe(false);
    expect(mocks.gerarDFC).not.toHaveBeenCalled();
  });

  it('modo Leitura (ADR-0032): o GET passa e sai o PDF — exportar nunca se trava', async () => {
    mocks.auth.mockResolvedValue(sessao([EXPORTAR], 'leitura'));
    const res = await chamar();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('application/pdf');
    expect(comecaPorPdf(await corpo(res))).toBe(true);
  });

  it('o tenant vem da sessão, nunca da query: um tenantId na URL é ignorado', async () => {
    const res = await chamar(pedido('dataInicio=2026-04-01&dataFim=2026-06-30&tenantId=tenant-xyz'));
    expect(res.status).toBe(200);
    for (const [, ctx] of mocks.gerarDFC.mock.calls) expect(ctx).toMatchObject({ tenantId: TENANT });
    for (const [, ctx] of mocks.listarPeriodos.mock.calls) expect(ctx).toMatchObject({ tenantId: TENANT });
  });

  it('cross-tenant ⇒ 404 (nunca 403, nunca 500): NotFoundError do serviço propaga, sem PDF', async () => {
    mocks.gerarDFC.mockRejectedValue(new NotFoundError('Período não encontrado'));
    const res = await chamar();
    expect(res.status).toBe(404);
    expect(comecaPorPdf(await corpo(res))).toBe(false);
  });
});

