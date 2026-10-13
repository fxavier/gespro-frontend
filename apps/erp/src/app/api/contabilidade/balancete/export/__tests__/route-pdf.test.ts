/**
 * ORÁCULO — GET /api/contabilidade/balancete/export?formato=pdf (run balancete-phc, S6, issue #286).
 * Contrato: .scratch/sdlc/balancete-phc/S6-contrato.md §«Rota» e §«Documento».
 *
 * Escrito pelo AUTOR DO ORÁCULO antes de o ramo PDF existir. A rota é importada
 * dinamicamente em cada teste. NUNCA `vitest -u`; um agente de implementação que
 * altere este ficheiro é BLOCKER.
 *
 * Contrato verificado:
 *  - `formato=pdf` → 200 `application/pdf`, assinatura `%PDF-`, anexo
 *    `balancete-<exercicio>-<pi>-<pf>.pdf` (períodos normalizados);
 *  - mesma permissão (`financas:exportar`; 401/403), mesmo limitador (429 sem gerar),
 *    Leitura passa, tenant da sessão, sem exercício → 404 JSON;
 *  - o PDF reflecte os parâmetros da página: `tipo` (colunas da linha «Totais»),
 *    `excluir` (linhas e linha «Filtros: …»), `p13` («com período 13»), e leva a
 *    entidade e o NUIT do tenant e «Emitido em … (Maputo)».
 *
 * Duplos (como no oráculo S5, `route.test.ts`, mocks duplicados aqui):
 * `listarExercicios`, `gerarBalanceteVerificacao`, `exportLimiter`, `auth` e —
 * NOVO — `tenantAdminService.obter` como fonte do nome/NUIT do tenant (o precedente
 * de `documentos.service.ts` para os PDF fiscais). O contrato não diz de onde vêm
 * a entidade e o utilizador: esta escolha é uma QUESTÃO EM ABERTO reportada.
 * O nome do utilizador não é verificado aqui (fonte por decidir); está no oráculo
 * do documento (`balancete-pdf.test.ts`).
 *
 * Esclarecimentos (orquestrador, 2026-10-02, após G5 iter 1) — acrescentado:
 *  - «por <nome>» vem da BASE: `prisma.user.findFirst` (ou findUnique) com where {id, tenantId}
 *    da sessão (dobrado em `@/server/db/client`, `prisma` e `prismaBase`); nome vazio ⇒ email;
 *    nunca «por —» nem o nome da sessão;
 *  - filtros que tiram linhas (classe, ci/cf, excluir, comSaldo, q) ⇒ «Total das linhas
 *    mostradas» + «Totais do balancete (sem filtros)»; nivel/tipo/zeradas ⇒ só «Totais»;
 *  - mais de 3000 linhas MOSTRADAS (subtotais incluídos) ⇒ 422 JSON
 *    `BALANCETE_PDF_DEMASIADO_GRANDE`, mensagem a citar CSV/Excel, sem chamar
 *    `renderBalancetePdf` (espião sobre o real); 3000 exactas passam; CSV/XLSX sem tecto.
 *    Nos dois testes do tecto (> 3000 e = 3000) o espião devolve um PDF mínimo (stub) —
 *    só se prova se a rota chama o renderizador e com que linhas; os restantes usam o real.
 *
 * Esclarecimentos 2 (orquestrador, 2026-10-02, após G5 iter 2) — o flag passa a ser dos DADOS:
 * «Total das linhas mostradas» + «Totais do balancete (sem filtros)» quando Σ das linhas que
 * contam (as mostradas) ≠ totais do núcleo em alguma das 6 colunas, OU com classe/ci/cf/
 * excluir/comSaldo/q. Casos: nivel=2 com conta ÓRFÃ (sem mãe, nível 5 — como a 63299 do demo);
 * razao=1 com folhas de saldos opostos sob a mesma conta de razão (saldo líquido ≠ soma);
 * guarda: nivel/razao sem diferença ⇒ só «Totais». Cada plano é CALIBRADO no próprio teste
 * contra o núcleo e a hierarquia reais (a diferença existe, ou não, antes de olhar para o PDF).
 */
import { Prisma, type ClassePGC, type NaturezaConta } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { formatNumero } from '@/lib/format-currency';
import {
  hierarquizarBalancete,
  montarBalanceteVerificacao,
  type AgregadoPartidaBV,
  type ContaBV,
  type LinhaHierarquica,
  type TotaisBV,
} from '@/server/services/financas/balancete-verificacao';
import type { BalanceteVerificacaoResult } from '@/server/services/financas/contabilidade.interface';
import {
  compactar,
  garantirExtractor,
  textoCompacto,
} from '@/app/api/contabilidade/dfc/export/__tests__/pdf-texto';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  listarExercicios: vi.fn(),
  gerarBalanceteVerificacao: vi.fn(),
  consume: vi.fn(),
  obterTenant: vi.fn(),
  findUser: vi.fn(),
  renderPdf: vi.fn(),
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

vi.mock('@/server/services/plataforma/tenant-admin.service', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const svc = (original.tenantAdminService ?? {}) as Record<string, unknown>;
  return { ...original, tenantAdminService: { ...svc, obter: mocks.obterTenant } };
});

// Esclarecimentos 2026-10-02: o nome do utilizador vem da base (`ctx.userId` + tenantId).
// Só `user` é dobrado; o resto do client é o real (e não é chamado nestes testes).
vi.mock('@/server/db/client', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const user = { findFirst: mocks.findUser, findUnique: mocks.findUser };
  const dobrar = (cliente: unknown) =>
    new Proxy(cliente as object, { get: (alvo, k) => (k === 'user' ? user : Reflect.get(alvo, k)) });
  return { ...original, prisma: dobrar(original.prisma), prismaBase: dobrar(original.prismaBase) };
});

// Espião sobre o documento REAL: prova que o tecto recusa ANTES de renderizar.
vi.mock('@/lib/documents/pdf/balancete-pdf', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const real = original.renderBalancetePdf as (...a: unknown[]) => unknown;
  mocks.renderPdf.mockImplementation((...a: unknown[]) => real(...a));
  return { ...original, renderBalancetePdf: mocks.renderPdf };
});

vi.mock('@/server/security/rate-limiter', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return { ...original, exportLimiter: { consume: mocks.consume, check: mocks.consume } };
});

const rota = () => import('../route');

// ---------------------------------------------------------------------------
// Sessão, tenant, relógio
// ---------------------------------------------------------------------------

const TENANT = 'tenant-abc';
const USER = 'u1';
const EXPORTAR = 'financas:exportar';
const ENTIDADE = { nome: 'Mercearia Oráculo Lda', nuit: '400123456' };

function sessao(permissions: string[], acesso: 'aberto' | 'leitura' = 'aberto') {
  return {
    // O nome da sessão NÃO é o que vai para o PDF (Esclarecimentos): o da base é «Bernardo Revisor».
    user: { id: USER, tenantId: TENANT, permissions, acesso, name: 'Nome Da Sessao', email: 'sessao@demo.mz' },
  };
}

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

beforeAll(async () => {
  await garantirExtractor();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T10:00:00.000+02:00'));
}, 30_000);
afterAll(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Balancete de duplo — núcleo real (o mesmo fixture do oráculo S5)
// ---------------------------------------------------------------------------

const D = (v: string) => new Prisma.Decimal(v);

function conta(
  id: string, codigo: string, nome: string, nivel: number, classe: ClassePGC,
  contaMaeId: string | null, aceitaLancamento: boolean, natureza: NaturezaConta = 'DEVEDORA',
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
  contaId, tipo, _sum: { valor: D(valor) },
});

function resultadoServico(ex = EX2026, periodoInicial = 2, periodoFinal = 5, incluir13 = false): BalanceteVerificacaoResult {
  const nucleo = montarBalanceteVerificacao({
    contas: CONTAS,
    movimento: [ag('c-111', 'DEBITO', '12345.67'), ag('c-71', 'CREDITO', '12345.67')],
    acumulado: [ag('c-111', 'DEBITO', '12345.67'), ag('c-12', 'DEBITO', '1000000'), ag('c-71', 'CREDITO', '1012345.67')],
    anteriores: null,
  });
  return {
    ...nucleo,
    exercicio: { id: ex.id, codigo: ex.codigo, dataInicio: ex.dataInicio, dataFim: ex.dataFim },
    periodoInicial, periodoFinal, incluir13, contas: CONTAS,
  };
}

const f = (v: string) => compactar(formatNumero(v));
/** «Totais» + valores visíveis, compacto (totais do balancete completo). */
const TOTAIS = {
  AMBOS: `totais${f('12345.67')}${f('12345.67')}${f('1012345.67')}${f('1012345.67')}${f('1012345.67')}${f('1012345.67')}`,
  PERIODO: `totais${f('12345.67')}${f('12345.67')}${f('1012345.67')}${f('1012345.67')}`,
  ACUMULADO: `totais${f('1012345.67')}${f('1012345.67')}${f('1012345.67')}${f('1012345.67')}`,
};

// ---------------------------------------------------------------------------
// Pedido
// ---------------------------------------------------------------------------

const URL_BASE = 'http://localhost:3000/api/contabilidade/balancete/export';

async function chamar(qs = 'exercicio=2026&de=2&ate=5&formato=pdf'): Promise<Response> {
  const { GET } = await rota();
  return GET(new NextRequest(`${URL_BASE}?${qs}`), { params: Promise.resolve({}) });
}

async function pdfDe(res: Response): Promise<Uint8Array> {
  return new Uint8Array(await res.arrayBuffer());
}

const UTILIZADOR_BD = { id: USER, tenantId: TENANT, nome: 'Bernardo Revisor', email: 'bernardo@demo.mz' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUser.mockResolvedValue(UTILIZADOR_BD);
  mocks.auth.mockResolvedValue(sessao([EXPORTAR, 'financas:leitura']));
  mocks.consume.mockResolvedValue({ limited: false, remaining: 9, retryAfterSec: 0 });
  mocks.listarExercicios.mockResolvedValue([EX2026, EX2025]);
  mocks.obterTenant.mockResolvedValue({
    id: TENANT, nome: ENTIDADE.nome, nuit: ENTIDADE.nuit, slug: 'oraculo', configuracaoFiscal: null,
  });
  mocks.gerarBalanceteVerificacao.mockImplementation(
    async (filtro: { exercicioId: string; periodoInicial: number; periodoFinal: number; incluir13: boolean }) => {
      const ex = [EX2026, EX2025].find((e) => e.id === filtro.exercicioId) ?? EX2026;
      return resultadoServico(ex, filtro.periodoInicial, filtro.periodoFinal, filtro.incluir13);
    },
  );
});

// ---------------------------------------------------------------------------
// Formato e nome
// ---------------------------------------------------------------------------

describe('GET formato=pdf — resposta', () => {
  it('200 application/pdf, %PDF-, anexo balancete-2026-2-5.pdf', async () => {
    const res = await chamar();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/^application\/pdf/);
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="balancete-2026-0?2-0?5\.pdf"/);
    const pdf = await pdfDe(res);
    expect(Buffer.from(pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
  }, 60_000);

  it('o nome usa os períodos normalizados (de > ate; p13)', async () => {
    const inv = await chamar('exercicio=2025&de=8&ate=3&formato=pdf');
    expect(inv.headers.get('Content-Disposition')).toMatch(/filename="balancete-2025-0?3-0?3\.pdf"/);
    const r13 = await chamar('exercicio=2025&de=1&ate=13&p13=1&formato=pdf');
    expect(r13.headers.get('Content-Disposition')).toMatch(/filename="balancete-2025-0?1-13\.pdf"/);
    expect(textoCompacto(await pdfDe(r13))).toContain(compactar('com período 13'));
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Acesso — as mesmas regras do CSV
// ---------------------------------------------------------------------------

describe('GET formato=pdf — acesso', () => {
  it('sem sessão → 401, sem gerar', async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await chamar();
    expect(res.status).toBe(401);
    expect(mocks.gerarBalanceteVerificacao).not.toHaveBeenCalled();
  });

  it('sem financas:exportar → 403', async () => {
    mocks.auth.mockResolvedValue(sessao(['financas:leitura', 'contabilidade:leitura']));
    const res = await chamar();
    expect(res.status).toBe(403);
    expect(mocks.gerarBalanceteVerificacao).not.toHaveBeenCalled();
  });

  it('modo Leitura passa', async () => {
    mocks.auth.mockResolvedValue(sessao([EXPORTAR], 'leitura'));
    const res = await chamar();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/^application\/pdf/);
  }, 60_000);

  it('consulta o exportLimiter com a chave do utilizador; esgotado → 429 sem gerar', async () => {
    await chamar();
    expect(mocks.consume).toHaveBeenCalledTimes(1);
    expect(String(mocks.consume.mock.calls[0]![0])).toContain(USER);

    vi.clearAllMocks();
    mocks.consume.mockResolvedValue({ limited: true, remaining: 0, retryAfterSec: 42 });
    const res = await chamar();
    expect(res.status).toBe(429);
    expect(mocks.gerarBalanceteVerificacao).not.toHaveBeenCalled();
  }, 60_000);

  it('o tenant vem da sessão: tenantId na query é ignorado', async () => {
    const res = await chamar('exercicio=2026&de=2&ate=5&formato=pdf&tenantId=tenant-xyz');
    expect(res.status).toBe(200);
    const [, ctx] = mocks.gerarBalanceteVerificacao.mock.calls[0]!;
    expect(ctx).toMatchObject({ tenantId: TENANT, userId: USER });
    expect(mocks.obterTenant).toHaveBeenCalled();
    expect(JSON.stringify(mocks.obterTenant.mock.calls)).toContain(TENANT);
    expect(JSON.stringify(mocks.obterTenant.mock.calls)).not.toContain('tenant-xyz');
    expect(JSON.stringify(mocks.gerarBalanceteVerificacao.mock.calls)).not.toContain('tenant-xyz');
  }, 60_000);

  it('sem exercício → 404 JSON, sem gerar', async () => {
    mocks.listarExercicios.mockResolvedValue([]);
    const res = await chamar();
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toMatch(/json/);
    expect(mocks.gerarBalanceteVerificacao).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Conteúdo — reflecte os parâmetros da página
// ---------------------------------------------------------------------------

describe('GET formato=pdf — conteúdo', () => {
  it('cabeçalho: entidade, NUIT, título, exercício/períodos, emissão em Maputo; Totais e igualdades', async () => {
    const t = textoCompacto(await pdfDe(await chamar()));
    expect(t).toContain(compactar(ENTIDADE.nome));
    expect(t).toMatch(/nuit:?400123456/);
    expect(t).toContain(compactar('Balancete de verificação'));
    expect(t).toContain(compactar('Exercício 2026 — períodos 2..5'));
    expect(t).not.toContain(compactar('com período 13'));
    expect(t).toMatch(/emitidoem15\/06\/2026,?10:00\(maputo\)/);
    expect(t).toContain('página1de1');
    expect(t).not.toContain('filtros:');
    expect(t).toContain(TOTAIS.AMBOS);
    expect(t).toMatch(/movimento[^a-z0-9]{0,3}equilibrado/);
    expect(t).toMatch(/acumulado[^a-z0-9]{0,3}equilibrado/);
    expect(t).toMatch(/saldos[^a-z0-9]{0,3}equilibrado/);
    expect(t).toContain('caixasede');
    expect(t).toContain('vendas');
  }, 60_000);

  it('tipo=periodo: Totais só com Movimento e Saldo', async () => {
    const t = textoCompacto(await pdfDe(await chamar('exercicio=2026&de=2&ate=5&tipo=periodo&formato=pdf')));
    expect(t).toContain(TOTAIS.PERIODO);
    expect(t).not.toContain(TOTAIS.AMBOS);
  }, 60_000);

  it('tipo=acumulado: Totais só com Acumulado e Saldo', async () => {
    const t = textoCompacto(await pdfDe(await chamar('exercicio=2026&de=2&ate=5&tipo=acumulado&formato=pdf')));
    expect(t).toContain(TOTAIS.ACUMULADO);
  }, 60_000);

  it('excluir=11: a linha some, «Filtros: Excluir 11», «Total das linhas mostradas» e «Totais do balancete (sem filtros)»', async () => {
    const t = textoCompacto(await pdfDe(await chamar('exercicio=2026&de=2&ate=5&excluir=11&formato=pdf')));
    expect(t).not.toContain('caixasede');
    expect(t).toContain(compactar('Filtros: Excluir 11'));
    // Mostradas que contam: 12 (acum/saldo D 1 000 000) e 71 (mov C 12 345,67; acum/saldo C 1 012 345,67).
    expect(t).toContain(`totaldaslinhasmostradas—${f('12345.67')}${f('1000000')}${f('1012345.67')}${f('1000000')}${f('1012345.67')}`);
    expect(t).toContain(TOTAIS.AMBOS.replace(/^totais/, compactar('Totais do balancete (sem filtros)')));
  }, 60_000);

  it('formato ausente continua a ser CSV', async () => {
    const res = await chamar('exercicio=2026&de=2&ate=5');
    expect(res.headers.get('Content-Type')).toMatch(/^text\/csv/);
  });
});

// ---------------------------------------------------------------------------
// Esclarecimentos 2026-10-02 (após G5 iter 1)
// ---------------------------------------------------------------------------

describe('GET formato=pdf — filtros que tiram linhas vs. os que não tiram', () => {
  it('classe=7 tira linhas: «Total das linhas mostradas» + «Totais do balancete (sem filtros)»', async () => {
    const t = textoCompacto(await pdfDe(await chamar('exercicio=2026&de=2&ate=5&classe=7&formato=pdf')));
    expect(t).toContain('totaldaslinhasmostradas');
    expect(t).toContain(TOTAIS.AMBOS.replace(/^totais/, compactar('Totais do balancete (sem filtros)')));
  }, 60_000);

  it('nivel=1 e tipo=periodo não tiram linhas: só «Totais», sem linha extra', async () => {
    const t = textoCompacto(await pdfDe(await chamar('exercicio=2026&de=2&ate=5&nivel=1&tipo=periodo&formato=pdf')));
    expect(t).toContain(TOTAIS.PERIODO);
    expect(t).not.toContain('totaldaslinhasmostradas');
    expect(t).not.toContain('semfiltros');
  }, 60_000);
});

describe('GET formato=pdf — «por <utilizador>» vem da base', () => {
  it('nome do utilizador lido por id + tenantId da sessão; nunca o da sessão nem «—»', async () => {
    const t = textoCompacto(await pdfDe(await chamar()));
    expect(t).toContain(compactar('por Bernardo Revisor'));
    expect(t).not.toContain(compactar('Nome Da Sessao'));
    expect(t).not.toContain('por—');
    expect(mocks.findUser).toHaveBeenCalled();
    const where = (mocks.findUser.mock.calls[0]![0] as { where?: Record<string, unknown> }).where ?? {};
    expect(where).toMatchObject({ id: USER, tenantId: TENANT });
  }, 60_000);

  it('utilizador sem nome → o email; nunca «—»', async () => {
    mocks.findUser.mockResolvedValue({ ...UTILIZADOR_BD, nome: '' });
    const t = textoCompacto(await pdfDe(await chamar()));
    expect(t).toContain(compactar('por bernardo@demo.mz'));
    expect(t).not.toContain('por—');
  }, 60_000);
});

// Plano grande: mãe «1» + N folhas «1xxxx» ⇒ linhas mostradas = 1 + N + subtotal.
function contasGrandes(folhas: number): ContaBV[] {
  return [
    conta('g-mae', '1', 'Meios financeiros líquidos', 1, 'CLASSE_1', null, false),
    ...Array.from({ length: folhas }, (_, i) =>
      conta(`g-f${i}`, `1${String(i).padStart(4, '0')}`, `Folha ${i}`, 2, 'CLASSE_1', 'g-mae', true)),
  ];
}
function resultadoGrande(folhas: number): BalanceteVerificacaoResult {
  const contas = contasGrandes(folhas);
  const agregados = contas.filter((c) => c.aceitaLancamento).flatMap((c) => [ag(c.id, 'DEBITO', '1.01'), ag(c.id, 'CREDITO', '1.01')]);
  const nucleo = montarBalanceteVerificacao({ contas, movimento: agregados, acumulado: agregados, anteriores: null });
  return {
    ...nucleo,
    exercicio: { id: EX2026.id, codigo: EX2026.codigo, dataInicio: EX2026.dataInicio, dataFim: EX2026.dataFim },
    periodoInicial: 2, periodoFinal: 5, incluir13: false, contas,
  };
}

/** PDF mínimo: nos dois testes do tecto só interessa SE a rota chama o renderizador (não 125 páginas reais). */
const PDF_STUB = new Uint8Array(Buffer.from('%PDF-1.4\n%%EOF\n', 'latin1'));

describe('GET formato=pdf — tecto de 3000 linhas mostradas', () => {
  it('calibração: 2999 folhas ⇒ 3001 linhas; 2998 ⇒ 3000', () => {
    const r1 = resultadoGrande(2999);
    expect(hierarquizarBalancete(r1, r1.contas)).toHaveLength(3001);
    const r0 = resultadoGrande(2998);
    expect(hierarquizarBalancete(r0, r0.contas)).toHaveLength(3000);
  });

  it('> 3000 linhas → 422 JSON BALANCETE_PDF_DEMASIADO_GRANDE (sugere CSV/Excel), sem renderizar', async () => {
    mocks.gerarBalanceteVerificacao.mockResolvedValue(resultadoGrande(2999));
    mocks.renderPdf.mockResolvedValueOnce(PDF_STUB); // se a rota renderizar (defeito), não custa 125 páginas
    const res = await chamar();
    expect(res.status).toBe(422);
    expect(res.headers.get('Content-Type')).toMatch(/json/);
    const corpo = (await res.json()) as { error?: { code?: string; message?: string } };
    expect(corpo.error?.code).toBe('BALANCETE_PDF_DEMASIADO_GRANDE');
    expect(corpo.error?.message ?? '').toMatch(/csv|excel/i);
    expect(mocks.renderPdf).not.toHaveBeenCalled();
  }, 60_000);

  it('o tecto conta as linhas MOSTRADAS: com classe=7 (nada mostrado da classe 1) o PDF sai', async () => {
    mocks.gerarBalanceteVerificacao.mockResolvedValue(resultadoGrande(2999));
    const res = await chamar('exercicio=2026&de=2&ate=5&classe=7&formato=pdf');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/^application\/pdf/);
  }, 60_000);

  it('CSV e Excel não têm tecto', async () => {
    mocks.gerarBalanceteVerificacao.mockResolvedValue(resultadoGrande(2999));
    const csv = await chamar('exercicio=2026&de=2&ate=5&formato=csv');
    expect(csv.status).toBe(200);
    expect(csv.headers.get('Content-Type')).toMatch(/^text\/csv/);
    const xlsx = await chamar('exercicio=2026&de=2&ate=5&formato=xlsx');
    expect(xlsx.status).toBe(200);
    expect(mocks.renderPdf).not.toHaveBeenCalled();
  }, 60_000);

  it('exactamente 3000 linhas → PDF (o tecto é «mais de 3000»)', async () => {
    mocks.gerarBalanceteVerificacao.mockResolvedValue(resultadoGrande(2998));
    mocks.renderPdf.mockResolvedValueOnce(PDF_STUB);
    const res = await chamar();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/^application\/pdf/);
    expect(mocks.renderPdf).toHaveBeenCalledTimes(1);
    const [dadosPdf] = mocks.renderPdf.mock.calls[0]! as [{ linhas: unknown[] }];
    expect(dadosPdf.linhas).toHaveLength(3000);
    expect(Buffer.from(new Uint8Array(await res.arrayBuffer())).toString('latin1')).toBe('%PDF-1.4\n%%EOF\n');
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Esclarecimentos 2 (2026-10-02, após G5 iter 2) — o flag é decidido pelos dados
// ---------------------------------------------------------------------------

const CAMPOS_BV = ['movD', 'movC', 'acumD', 'acumC', 'saldoDevedor', 'saldoCredor'] as const;
const contaNaSoma = (l: LinhaHierarquica) =>
  (l.tipo === 'CONTA' && !l.agregadora && !l.contexto) || l.tipo === 'SINTETICA';
function somaMostrada(ls: LinhaHierarquica[]): TotaisBV {
  const r = Object.fromEntries(CAMPOS_BV.map((k) => [k, D('0')])) as unknown as TotaisBV;
  for (const l of ls.filter(contaNaSoma)) for (const k of CAMPOS_BV) r[k] = r[k].plus(l[k]);
  return r;
}
const iguais = (a: TotaisBV, b: TotaisBV) => CAMPOS_BV.every((k) => a[k].equals(b[k]));
const fz = (d: Prisma.Decimal) => (d.isZero() ? '—' : f(d.toString()));
const valores = (t: TotaisBV) => CAMPOS_BV.map((k) => fz(t[k])).join('');

function resultadoDe(contas: ContaBV[], movimento: AgregadoPartidaBV[], acumulado: AgregadoPartidaBV[]): BalanceteVerificacaoResult {
  const nucleo = montarBalanceteVerificacao({ contas, movimento, acumulado, anteriores: null });
  return {
    ...nucleo,
    exercicio: { id: EX2026.id, codigo: EX2026.codigo, dataInicio: EX2026.dataInicio, dataFim: EX2026.dataFim },
    periodoInicial: 2, periodoFinal: 5, incluir13: false, contas,
  };
}

/** Classe 6 com uma ÓRFÃ de nível 5 (sem contaMaeId), como a 63299 do demo. */
const PLANO_ORFA: ContaBV[] = [
  conta('o-6', '6', 'Gastos e perdas', 1, 'CLASSE_6', null, false),
  conta('o-62', '62', 'Fornecimentos e serviços de terceiros', 2, 'CLASSE_6', 'o-6', false),
  conta('o-621', '621', 'Subcontratos', 3, 'CLASSE_6', 'o-62', true),
  conta('o-63299', '63299', 'Outros gastos com o pessoal órfã', 5, 'CLASSE_6', null, true),
  conta('o-7', '7', 'Rendimentos', 1, 'CLASSE_7', null, false, 'CREDORA'),
  conta('o-71', '71', 'Vendas', 2, 'CLASSE_7', 'o-7', true, 'CREDORA'),
];
const MOV_ORFA = [ag('o-621', 'DEBITO', '4321.09'), ag('o-63299', 'DEBITO', '777.77'), ag('o-71', 'CREDITO', '5098.86')];

/** Conta de razão 21 com duas folhas de saldos opostos: saldo líquido de 21 ≠ soma dos saldos das folhas. */
const PLANO_RAZAO: ContaBV[] = [
  conta('r-2', '2', 'Terceiros', 1, 'CLASSE_2', null, false),
  conta('r-21', '21', 'Clientes', 2, 'CLASSE_2', 'r-2', false),
  conta('r-211', '211', 'Clientes c/c', 3, 'CLASSE_2', 'r-21', true),
  conta('r-212', '212', 'Clientes adiantamentos', 3, 'CLASSE_2', 'r-21', true),
  conta('r-7', '7', 'Rendimentos', 1, 'CLASSE_7', null, false, 'CREDORA'),
  conta('r-71', '71', 'Vendas', 2, 'CLASSE_7', 'r-7', true, 'CREDORA'),
];
const MOV_RAZAO = [
  ag('r-211', 'DEBITO', '1000.11'),
  ag('r-212', 'CREDITO', '400.04'),
  ag('r-71', 'CREDITO', '600.07'),
];

/** O que o PDF tem de mostrar quando o flag é verdadeiro; com a calibração da diferença. */
function esperadoComDiferenca(r: BalanceteVerificacaoResult, opcoes: Parameters<typeof hierarquizarBalancete>[2]) {
  const linhas = hierarquizarBalancete(r, r.contas, opcoes);
  const mostrada = somaMostrada(linhas);
  return { mostrada, totais: r.totais, difere: !iguais(mostrada, r.totais) };
}

describe('GET formato=pdf — «Total das linhas mostradas» decidido pelos dados (Esclarecimentos 2)', () => {
  it('nivel=2 com conta órfã de nível 5 (#298): a órfã é mostrada e entra na soma ⇒ só «Totais»', async () => {
    // Antes da #298 a órfã desaparecia com nivel=2 e o PDF reconciliava com «Total das
    // linhas mostradas». Agora é raiz da sua cadeia (grau relativo 1): aparece, a soma
    // mostrada bate com os totais e não há linha extra.
    const r = resultadoDe(PLANO_ORFA, MOV_ORFA, MOV_ORFA);
    const linhas = hierarquizarBalancete(r, r.contas, { nivelMaximo: 2 });
    expect(linhas.some((l) => l.tipo === 'CONTA' && l.conta!.codigo === '63299'), 'a órfã 63299 tem de ser mostrada').toBe(true);
    const e = esperadoComDiferenca(r, { nivelMaximo: 2 });
    expect(e.difere, 'a órfã entra na soma mostrada: sem diferença').toBe(false);
    mocks.gerarBalanceteVerificacao.mockResolvedValue(r);

    const t = textoCompacto(await pdfDe(await chamar('exercicio=2026&de=2&ate=5&nivel=2&formato=pdf')));
    expect(t).not.toContain('filtros:excluir');
    expect(t).toContain(compactar('63299'));
    expect(t).toContain(`totais${valores(e.totais)}`);
    expect(t).not.toContain('totaldaslinhasmostradas');
    expect(t).not.toContain('semfiltros');
  }, 60_000);

  it('razao=1 com folhas de saldos opostos: as duas linhas de totais', async () => {
    const r = resultadoDe(PLANO_RAZAO, MOV_RAZAO, MOV_RAZAO);
    const e = esperadoComDiferenca(r, { apenasRazao: true });
    expect(e.difere, 'calibração: o saldo líquido da 21 tem de diferir da soma dos saldos das folhas').toBe(true);
    mocks.gerarBalanceteVerificacao.mockResolvedValue(r);

    const t = textoCompacto(await pdfDe(await chamar('exercicio=2026&de=2&ate=5&razao=1&formato=pdf')));
    expect(t).toContain(`totaldaslinhasmostradas${valores(e.mostrada)}`);
    expect(t).toContain(`${compactar('Totais do balancete (sem filtros)')}${valores(e.totais)}`);
  }, 60_000);

  it('guarda: nivel=1 / razao=1 sem diferença nos dados ⇒ só «Totais», sem linha extra', async () => {
    const r = resultadoServico();
    for (const [qs, opcoes] of [
      ['nivel=1', { nivelMaximo: 1 }],
      ['razao=1', { apenasRazao: true }],
      ['nivel=2', { nivelMaximo: 2 }],
    ] as const) {
      expect(esperadoComDiferenca(r, opcoes).difere, `calibração ${qs}: sem diferença`).toBe(false);
      const t = textoCompacto(await pdfDe(await chamar(`exercicio=2026&de=2&ate=5&${qs}&formato=pdf`)));
      expect(t, qs).toContain(TOTAIS.AMBOS);
      expect(t, qs).not.toContain('totaldaslinhasmostradas');
      expect(t, qs).not.toContain('semfiltros');
    }
  }, 60_000);
});
