/**
 * ORÁCULO — GET /api/contabilidade/balancete/export (run balancete-phc, S5, issue #285).
 * Contrato: .scratch/sdlc/balancete-phc/S5-contrato.md §«Rota».
 *
 * Escrito pelo AUTOR DO ORÁCULO antes de a rota existir; a rota é importada
 * dinamicamente em cada teste para que, sem implementação, cada caso falhe
 * sozinho e pela razão certa (módulo em falta). NUNCA `vitest -u`; um agente de
 * implementação que altere este ficheiro é BLOCKER.
 *
 * Contrato verificado:
 *  - `withApi` com permissão `financas:exportar` (403 sem ela, 401 sem sessão);
 *    o GET passa em modo Leitura; `exportLimiter` consultado (429 quando esgota);
 *  - `formato=csv|xlsx`, ausente/inválido → csv; nome `balancete-<exercicio>-<pi>-<pf>.<ext>`;
 *  - sem exercício → 404 JSON, sem chamar o serviço;
 *  - os MESMOS parâmetros da página (via `lerParametrosBalancete`) mudam a saída —
 *    `tipo` as colunas, `excluir`/`nivel` as linhas — e a linha «Total» é sempre a
 *    do balancete completo;
 *  - o tenant vem da sessão, nunca da query.
 *
 * Duplos: `listarExercicios` e `gerarBalanceteVerificacao`. O resultado do serviço
 * é montado pelo núcleo REAL (`montarBalanceteVerificacao`); hierarquia, filtros,
 * dataset e CSV/XLSX são os reais.
 */
import { Prisma, type ClassePGC, type NaturezaConta } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { XLSX_CONTENT_TYPE } from '@/lib/reporting';
import {
  filtrarBalancete,
  hierarquizarBalancete,
  montarBalanceteVerificacao,
  type AgregadoPartidaBV,
  type ContaBV,
  type FiltrosBalancete,
} from '@/server/services/financas/balancete-verificacao';
import type { BalanceteVerificacaoResult } from '@/server/services/financas/contabilidade.interface';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  listarExercicios: vi.fn(),
  gerarBalanceteVerificacao: vi.fn(),
  consume: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));

vi.mock('@/server/services/financas/contabilidade.service', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const contabilidadeService = (original.contabilidadeService ?? {}) as Record<string, unknown>;
  return {
    ...original,
    listarExercicios: mocks.listarExercicios,
    gerarBalanceteVerificacao: mocks.gerarBalanceteVerificacao,
    contabilidadeService: {
      ...contabilidadeService,
      listarExercicios: mocks.listarExercicios,
      gerarBalanceteVerificacao: mocks.gerarBalanceteVerificacao,
    },
  };
});

vi.mock('@/server/security/rate-limiter', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return { ...original, exportLimiter: { consume: mocks.consume, check: mocks.consume } };
});

const rota = () => import('../route');

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

const TENANT = 'tenant-abc';
const USER = 'u1';
const EXPORTAR = 'financas:exportar';

function sessao(permissions: string[], acesso: 'aberto' | 'leitura' = 'aberto') {
  return { user: { id: USER, tenantId: TENANT, permissions, acesso } };
}

// ---------------------------------------------------------------------------
// Exercícios e relógio
// ---------------------------------------------------------------------------

function exercicio(ano: number) {
  return {
    id: `cexercicio${ano}aaaaaaaaaaaaaa`,
    tenantId: TENANT,
    codigo: String(ano),
    dataInicio: new Date(`${ano}-01-01T00:00:00.000+02:00`),
    dataFim: new Date(`${ano}-12-31T23:59:59.999+02:00`),
    estado: 'ABERTO',
  };
}
const EX2026 = exercicio(2026);
const EX2025 = exercicio(2025);

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T10:00:00.000+02:00'));
});
afterAll(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Balancete de duplo — montado pelo núcleo real
// ---------------------------------------------------------------------------

const D = (v: string) => new Prisma.Decimal(v);

function conta(
  id: string,
  codigo: string,
  nome: string,
  nivel: number,
  classe: ClassePGC,
  contaMaeId: string | null,
  aceitaLancamento: boolean,
  natureza: NaturezaConta = 'DEVEDORA',
): ContaBV {
  return { id, codigo, nome, classe, natureza, nivel, contaMaeId, aceitaLancamento };
}

const CONTAS: ContaBV[] = [
  conta('c-1', '1', 'Meios financeiros líquidos', 1, 'CLASSE_1', null, false),
  conta('c-11', '11', 'Caixa', 2, 'CLASSE_1', 'c-1', false),
  conta('c-111', '111', 'Caixa sede', 3, 'CLASSE_1', 'c-11', true),
  conta('c-12', '12', 'Depósitos à ordem', 2, 'CLASSE_1', 'c-1', true),
  conta('c-7', '7', 'Rendimentos', 1, 'CLASSE_7', null, false, 'CREDORA'),
  conta('c-71', '71', 'Vendas', 2, 'CLASSE_7', 'c-7', true, 'CREDORA'),
];

const ag = (contaId: string, tipo: 'DEBITO' | 'CREDITO', valor: string): AgregadoPartidaBV => ({
  contaId,
  tipo,
  _sum: { valor: D(valor) },
});

function resultadoServico(ex = EX2026, periodoInicial = 2, periodoFinal = 5, incluir13 = false): BalanceteVerificacaoResult {
  const nucleo = montarBalanceteVerificacao({
    contas: CONTAS,
    movimento: [ag('c-111', 'DEBITO', '12345.67'), ag('c-71', 'CREDITO', '12345.67')],
    acumulado: [
      ag('c-111', 'DEBITO', '12345.67'),
      ag('c-12', 'DEBITO', '1000000'),
      ag('c-71', 'CREDITO', '1012345.67'),
    ],
    anteriores: null,
  });
  return {
    ...nucleo,
    exercicio: { id: ex.id, codigo: ex.codigo, dataInicio: ex.dataInicio, dataFim: ex.dataFim },
    periodoInicial,
    periodoFinal,
    incluir13,
    contas: CONTAS,
  };
}

/** A linha «Total» esperada, em CSV, para cada tipo (totais do balancete completo). */
const TOTAL = {
  AMBOS: ['12345.67', '12345.67', '1012345.67', '1012345.67', '1012345.67', '1012345.67'],
  PERIODO: ['12345.67', '12345.67', '1012345.67', '1012345.67'],
  ACUMULADO: ['1012345.67', '1012345.67', '1012345.67', '1012345.67'],
};

const CAB = {
  AMBOS:
    'Conta;Descrição;Tipo;Nível;Movimento Débito;Movimento Crédito;Acumulado Débito;Acumulado Crédito;Saldo Devedor;Saldo Credor',
  PERIODO: 'Conta;Descrição;Tipo;Nível;Movimento Débito;Movimento Crédito;Saldo Devedor;Saldo Credor',
  ACUMULADO: 'Conta;Descrição;Tipo;Nível;Acumulado Débito;Acumulado Crédito;Saldo Devedor;Saldo Credor',
};

// ---------------------------------------------------------------------------
// Pedido e leitura
// ---------------------------------------------------------------------------

const URL_BASE = 'http://localhost:3000/api/contabilidade/balancete/export';

function pedido(qs = 'exercicio=2026&de=2&ate=5'): NextRequest {
  return new NextRequest(`${URL_BASE}${qs ? `?${qs}` : ''}`);
}

async function chamar(qs?: string): Promise<Response> {
  const { GET } = await rota();
  return GET(pedido(qs), { params: Promise.resolve({}) });
}

/** Tabela do CSV a partir do cabeçalho (pode haver metadados antes). */
async function tabela(res: Response, cabecalho: string): Promise<string[][]> {
  const texto = (await res.text()).replace(/^﻿/, '');
  const linhas = texto.split('\r\n');
  const i = linhas.indexOf(cabecalho);
  expect(i, `cabeçalho «${cabecalho}» não encontrado`).toBeGreaterThanOrEqual(0);
  return linhas.slice(i + 1).filter((l) => l !== '').map((l) => l.split(';'));
}

const contasDe = (t: string[][]) => t.filter((c) => c[2] === 'Conta').map((c) => c[0]);
const totalDe = (t: string[][]) => {
  const ultima = t[t.length - 1]!;
  expect(ultima[2]).toBe('Total');
  return ultima.slice(4);
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(sessao([EXPORTAR, 'financas:leitura']));
  mocks.consume.mockResolvedValue({ limited: false, remaining: 9, retryAfterSec: 0 });
  mocks.listarExercicios.mockResolvedValue([EX2026, EX2025]);
  mocks.gerarBalanceteVerificacao.mockImplementation(async (filtro: { exercicioId: string; periodoInicial: number; periodoFinal: number; incluir13: boolean }) => {
    const ex = [EX2026, EX2025].find((e) => e.id === filtro.exercicioId) ?? EX2026;
    return resultadoServico(ex, filtro.periodoInicial, filtro.periodoFinal, filtro.incluir13);
  });
});

// ---------------------------------------------------------------------------
// Calibração do duplo (verde já hoje — prova que o fixture é o que o oráculo julga)
// ---------------------------------------------------------------------------

describe('calibração do fixture', () => {
  it('a hierarquia real mostra 1, 11, 111, 12, subtotal 1, 7, 71, subtotal 7', () => {
    const r = resultadoServico();
    const linhas = hierarquizarBalancete(r, r.contas);
    expect(linhas.map((l) => (l.tipo === 'CONTA' ? l.conta!.codigo : `${l.tipo}:${l.classe}`))).toEqual([
      '1', '11', '111', '12', 'SUBTOTAL_CLASSE:CLASSE_1', '7', '71', 'SUBTOTAL_CLASSE:CLASSE_7',
    ]);
    expect(r.totais.saldoDevedor.toString()).toBe('1012345.67');
    expect(r.totais.movD.toString()).toBe('12345.67');
  });

  it('o núcleo real com os filtros dos casos abaixo dá as contas que o oráculo espera', () => {
    const r = resultadoServico();
    const contas = (opcoes: Parameters<typeof hierarquizarBalancete>[2], filtros: FiltrosBalancete) =>
      filtrarBalancete(hierarquizarBalancete(r, r.contas, opcoes), filtros)
        .filter((l) => l.tipo === 'CONTA')
        .map((l) => l.conta!.codigo);
    expect(contas({}, { excluir: ['11'] })).toEqual(['1', '12', '7', '71']);
    expect(contas({}, { classe: 'CLASSE_7' })).toEqual(['7', '71']);
    expect(contas({ nivelMaximo: 1 }, {})).toEqual(['1', '7']);
    expect(contas({}, { pesquisa: 'caixa sede' })).toEqual(['1', '11', '111']);
  });
});

// ---------------------------------------------------------------------------
// Forma
// ---------------------------------------------------------------------------

describe('GET /api/contabilidade/balancete/export — forma', () => {
  it('exporta GET e corre em Node', async () => {
    const mod = await rota();
    expect(typeof mod.GET).toBe('function');
    expect((mod as { runtime?: string }).runtime).toBe('nodejs');
  });
});

// ---------------------------------------------------------------------------
// Acesso
// ---------------------------------------------------------------------------

describe('GET — acesso', () => {
  it('sem sessão → 401', async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await chamar();
    expect(res.status).toBe(401);
    expect(mocks.gerarBalanceteVerificacao).not.toHaveBeenCalled();
  });

  it('sem financas:exportar → 403, mesmo com financas:leitura', async () => {
    mocks.auth.mockResolvedValue(sessao(['financas:leitura', 'contabilidade:leitura']));
    const res = await chamar();
    expect(res.status).toBe(403);
    expect(mocks.gerarBalanceteVerificacao).not.toHaveBeenCalled();
  });

  it('modo Leitura: o GET passa (exportar nunca se trava)', async () => {
    mocks.auth.mockResolvedValue(sessao([EXPORTAR], 'leitura'));
    const res = await chamar();
    expect(res.status).toBe(200);
  });

  it('consulta o exportLimiter com uma chave do utilizador', async () => {
    const res = await chamar();
    expect(res.status).toBe(200);
    expect(mocks.consume).toHaveBeenCalledTimes(1);
    expect(String(mocks.consume.mock.calls[0]![0])).toContain(USER);
  });

  it('limitador esgotado → 429, sem gerar o balancete', async () => {
    mocks.consume.mockResolvedValue({ limited: true, remaining: 0, retryAfterSec: 42 });
    const res = await chamar();
    expect(res.status).toBe(429);
    expect(mocks.gerarBalanceteVerificacao).not.toHaveBeenCalled();
  });

  it('o tenant vem da sessão: tenantId na query é ignorado', async () => {
    const res = await chamar('exercicio=2026&de=2&ate=5&tenantId=tenant-xyz');
    expect(res.status).toBe(200);
    expect(mocks.listarExercicios).toHaveBeenCalled();
    for (const chamada of mocks.listarExercicios.mock.calls) {
      expect(chamada.find((a: unknown) => typeof a === 'object' && a !== null && 'tenantId' in a)).toMatchObject({ tenantId: TENANT });
    }
    expect(mocks.gerarBalanceteVerificacao).toHaveBeenCalledTimes(1);
    const [, ctx] = mocks.gerarBalanceteVerificacao.mock.calls[0]!;
    expect(ctx).toMatchObject({ tenantId: TENANT, userId: USER });
    expect(JSON.stringify(mocks.gerarBalanceteVerificacao.mock.calls)).not.toContain('tenant-xyz');
  });
});

// ---------------------------------------------------------------------------
// Formato e nome
// ---------------------------------------------------------------------------

describe('GET — formato e nome do ficheiro', () => {
  const NOME = (ext: string) => new RegExp(`attachment; filename="balancete-2026-0?2-0?5\\.${ext}"`);

  it('formato=csv → text/csv com o nome balancete-<exercicio>-<pi>-<pf>.csv', async () => {
    const res = await chamar('exercicio=2026&de=2&ate=5&formato=csv');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/^text\/csv/);
    expect(res.headers.get('Content-Disposition')).toMatch(NOME('csv'));
    await tabela(res, CAB.AMBOS);
  });

  it('formato=xlsx → folha Excel (zip) com o nome .xlsx', async () => {
    const res = await chamar('exercicio=2026&de=2&ate=5&formato=xlsx');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe(XLSX_CONTENT_TYPE);
    expect(res.headers.get('Content-Disposition')).toMatch(NOME('xlsx'));
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Buffer.from(bytes.subarray(0, 2)).toString('latin1')).toBe('PK');
  });

  it('formato ausente → csv', async () => {
    const res = await chamar('exercicio=2026&de=2&ate=5');
    expect(res.headers.get('Content-Type')).toMatch(/^text\/csv/);
    expect(res.headers.get('Content-Disposition')).toMatch(NOME('csv'));
  });

  it('formato lixo → csv', async () => {
    for (const f of ['pdf', 'XLSX', '']) {
      const res = await chamar(`exercicio=2026&de=2&ate=5&formato=${f}`);
      expect(res.status, f).toBe(200);
      expect(res.headers.get('Content-Type'), f).toMatch(/^text\/csv/);
    }
  });

  it('o nome usa os períodos NORMALIZADOS (de > ate, ate=13 sem p13)', async () => {
    const res = await chamar('exercicio=2025&de=9&ate=13');
    expect(res.headers.get('Content-Disposition')).toMatch(/filename="balancete-2025-0?9-12\.csv"/);
    const inv = await chamar('exercicio=2025&de=8&ate=3');
    expect(inv.headers.get('Content-Disposition')).toMatch(/filename="balancete-2025-0?3-0?3\.csv"/);
    const res13 = await chamar('exercicio=2025&de=1&ate=13&p13=1');
    expect(res13.headers.get('Content-Disposition')).toMatch(/filename="balancete-2025-0?1-13\.csv"/);
  });
});

// ---------------------------------------------------------------------------
// Sem exercício
// ---------------------------------------------------------------------------

describe('GET — sem exercício', () => {
  it('nenhum exercício → 404 JSON, sem gerar o balancete', async () => {
    mocks.listarExercicios.mockResolvedValue([]);
    const res = await chamar();
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toMatch(/json/);
    expect(mocks.gerarBalanceteVerificacao).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Os parâmetros da página mudam a saída; o Total não
// ---------------------------------------------------------------------------

describe('GET — mesmos parâmetros da página', () => {
  it('chama o serviço com o filtro normalizado da página', async () => {
    await chamar('exercicio=2025&de=8&ate=3');
    expect(mocks.gerarBalanceteVerificacao).toHaveBeenCalledTimes(1);
    expect(mocks.gerarBalanceteVerificacao.mock.calls[0]![0]).toEqual({
      exercicioId: EX2025.id,
      periodoInicial: 3,
      periodoFinal: 3,
      incluir13: false,
    });
  });

  it('exercício pedido inexistente → o corrente (como a página), não 404', async () => {
    const res = await chamar('exercicio=1999&de=2&ate=5');
    expect(res.status).toBe(200);
    expect(mocks.gerarBalanceteVerificacao.mock.calls[0]![0]).toMatchObject({ exercicioId: EX2026.id });
    expect(res.headers.get('Content-Disposition')).toMatch(/filename="balancete-2026-/);
  });

  it('sem filtros: todas as linhas mostradas e o Total do balancete', async () => {
    const t = await tabela(await chamar(), CAB.AMBOS);
    expect(contasDe(t)).toEqual(['1', '11', '111', '12', '7', '71']);
    expect(t.filter((c) => c[2] === 'Subtotal').map((c) => c[1])).toEqual(['Total da classe 1', 'Total da classe 7']);
    expect(totalDe(t)).toEqual(TOTAL.AMBOS);
  });

  it('tipo=periodo tira o par Acumulado; tipo=acumulado tira o par Movimento', async () => {
    const tp = await tabela(await chamar('exercicio=2026&de=2&ate=5&tipo=periodo'), CAB.PERIODO);
    expect(totalDe(tp)).toEqual(TOTAL.PERIODO);
    const ta = await tabela(await chamar('exercicio=2026&de=2&ate=5&tipo=acumulado&formato=csv'), CAB.ACUMULADO);
    expect(totalDe(ta)).toEqual(TOTAL.ACUMULADO);
  });

  it('excluir tira a conta e as que se mostram por baixo; o Total não muda', async () => {
    const t = await tabela(await chamar('exercicio=2026&de=2&ate=5&excluir=11'), CAB.AMBOS);
    expect(contasDe(t)).toEqual(['1', '12', '7', '71']);
    expect(totalDe(t)).toEqual(TOTAL.AMBOS);
  });

  it('classe=7 deixa só o bloco da classe 7; o Total não muda', async () => {
    const t = await tabela(await chamar('exercicio=2026&de=2&ate=5&classe=7'), CAB.AMBOS);
    expect(contasDe(t)).toEqual(['7', '71']);
    expect(totalDe(t)).toEqual(TOTAL.AMBOS);
  });

  it('nivel=1 só mostra as contas de nível 1; o Total não muda', async () => {
    const t = await tabela(await chamar('exercicio=2026&de=2&ate=5&nivel=1'), CAB.AMBOS);
    expect(contasDe(t)).toEqual(['1', '7']);
    expect(totalDe(t)).toEqual(TOTAL.AMBOS);
  });

  it('pesquisa (q) mantém as mães como contexto («Conta»); o Total não muda', async () => {
    const t = await tabela(await chamar('exercicio=2026&de=2&ate=5&q=caixa%20sede'), CAB.AMBOS);
    expect(contasDe(t)).toEqual(['1', '11', '111']);
    expect(totalDe(t)).toEqual(TOTAL.AMBOS);
  });

  it('parâmetros inválidos são ignorados como na página (não dão erro)', async () => {
    const res = await chamar('exercicio=2026&de=2&ate=5&classe=9&nivel=abc&excluir=x,,y&tipo=xpto&ci=1a');
    expect(res.status).toBe(200);
    const t = await tabela(res, CAB.AMBOS);
    expect(contasDe(t)).toEqual(['1', '11', '111', '12', '7', '71']);
    expect(totalDe(t)).toEqual(TOTAL.AMBOS);
  });
});
