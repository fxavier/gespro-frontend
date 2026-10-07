/**
 * ORÁCULO da issue #196 (nó A:rate-limit-exportacoes-196) — escrito pelo verificador
 * ANTES da implementação. Ficheiro protegido: o autor não o altera.
 *
 * Contrato (ADR-0014, porta `RateLimiter` com adaptador memória/Valkey):
 *  - Exportações, PDF e mapas de IVA têm limitador POR UTILIZADOR E POR ROTA:
 *      · GET /api/export/[modulo]
 *      · GET /api/faturacao/[id]/pdf
 *      · GET /api/financas/iva/mapas/[periodo]
 *      · GET /api/contabilidade/exercicios/[id]/encerramento/[documento]
 *    e as que já tinham limitador partilhado (DRE, balanço…) deixam de partilhar
 *    a quota entre rotas.
 *  - Limite L por minuto com 10 ≤ L ≤ 30 (o contrato pede «razoável, ex.: 30/min»;
 *    o oráculo aceita o intervalo entre o limite actual das exportações e 30, e
 *    recusa tanto «sem limite» como um limite que trave o uso normal).
 *  - Excedido ⇒ 429, envelope `{ error: { code: 'RATE_LIMIT_EXCEEDED' } }`,
 *    cabeçalho `Retry-After` inteiro em [1, 60].
 *  - Outro utilizador não é afectado; passado o minuto, a quota volta.
 *
 * Os serviços a jusante são duplos baratos: o objecto aqui é a ROTA e o limitador
 * REAL (adaptador memória — `RATE_LIMIT_DRIVER=memory`). Cada teste faz
 * `vi.resetModules()` e importa as rotas de novo, para começar com quotas limpas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));

// --- /api/export/[modulo] ---------------------------------------------------
vi.mock('@/server/services/plataforma/export.service', () => ({
  resolverExport: (modulo: string) =>
    modulo === 'clientes'
      ? {
          permission: 'vendas:leitura',
          build: async () => ({ titulo: 'Clientes', colunas: [], linhas: [] }),
        }
      : undefined,
}));
vi.mock('@/lib/reporting', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    exportResponse: () => new Response('ok', { headers: { 'Content-Type': 'text/csv' } }),
  };
});

// --- /api/faturacao/[id]/pdf ------------------------------------------------
vi.mock('@/server/services/plataforma/documentos.service', () => ({
  obterModeloFatura: async () => ({ designacao: 'Factura', numero: 'FAT-2026-000001' }),
}));
vi.mock('@/lib/documents/pdf/fatura-pdf', () => ({
  renderFaturaPdf: async () => new Uint8Array([37, 80, 68, 70]),
}));

// --- /api/financas/iva/mapas/[periodo] --------------------------------------
vi.mock('@/server/db/client', () => {
  const prismaBase = {
    periodoContabil: {
      findFirst: async () => ({
        id: 'per-2026-01',
        codigo: '2026-01',
        estado: 'ABERTO',
        dataInicio: new Date('2025-12-31T22:00:00.000Z'),
        dataFim: new Date('2026-01-31T21:59:59.999Z'),
      }),
    },
    apuramentoIva: {
      findFirst: async () => ({ id: 'ap-1', versao: 1, estado: 'APURADO', linhas: [] }),
      findMany: async () => [],
    },
    $queryRaw: async () => [],
  };
  return { prismaBase, prisma: prismaBase };
});

// --- /api/contabilidade/exercicios/[id]/encerramento/[documento] -----------
vi.mock('@/server/services/financas/encerramento-exercicio.service', () => ({
  DOCUMENTOS_ARQUIVO_ENCERRAMENTO: ['balanco', 'dre', 'balancete'],
  keyArquivoEncerramento: async () => 'tenants/t-196/encerramento/balanco.pdf',
}));
vi.mock('@/lib/storage/objeto', () => ({
  getObjectStorage: () => ({ presignGet: async () => 'https://storage.example/assinado' }),
}));

// --- DRE e balanço (já tinham limitador, partilhado entre rotas) -----------
vi.mock('@/server/services/financas/contabilidade.service', () => ({
  gerarDRE: async () => ({}),
}));
vi.mock('@/server/services/financas/balanco.service', () => ({
  gerarBalanco: async () => ({ exercicio: { codigo: '2026' }, periodoFinal: 12 }),
}));
vi.mock('@/server/services/financas/emissao-mapas', () => ({
  emissaoDosMapas: async () => ({ entidade: {}, emissao: {} }),
}));
vi.mock('@/lib/documents/pdf/dre-pdf', () => ({
  renderDrePdf: async () => new Uint8Array([37, 80, 68, 70]),
}));
vi.mock('@/lib/documents/pdf/balanco-pdf', () => ({
  renderBalancoPdf: async () => new Uint8Array([37, 80, 68, 70]),
}));

// ---------------------------------------------------------------------------

const TENANT = 'tenant-196';
const PERMISSOES = ['vendas:leitura', 'faturacao:leitura', 'financas:iva:mapas', 'financas:exportar'];
const LIMITE_MIN = 10;
const LIMITE_MAX = 30;

let utilizadorActual = 'u-196-a';

function sessao(id: string) {
  return { user: { id, tenantId: TENANT, permissions: PERMISSOES, acesso: 'aberto' } };
}

type Handler = (
  req: NextRequest,
  segment?: { params: Promise<Record<string, string | string[]>> },
) => Promise<Response>;

interface Rota {
  nome: string;
  carregar: () => Promise<Handler>;
  url: string;
  params: Record<string, string>;
}

// Acesso dinâmico: sem implementação o ficheiro carrega na mesma e falha o CASO.
const getDe = async (caminho: Promise<unknown>): Promise<Handler> =>
  ((await caminho) as { GET: Handler }).GET;

const ROTAS_SEM_LIMITADOR: Rota[] = [
  {
    nome: 'GET /api/export/[modulo]',
    carregar: () => getDe(import('@/app/api/export/[modulo]/route')),
    url: 'http://localhost/api/export/clientes?formato=csv',
    params: { modulo: 'clientes' },
  },
  {
    nome: 'GET /api/faturacao/[id]/pdf',
    carregar: () => getDe(import('@/app/api/faturacao/[id]/pdf/route')),
    url: 'http://localhost/api/faturacao/fat-1/pdf',
    params: { id: 'fat-1' },
  },
  {
    nome: 'GET /api/financas/iva/mapas/[periodo]',
    carregar: () => getDe(import('@/app/api/financas/iva/mapas/[periodo]/route')),
    url: 'http://localhost/api/financas/iva/mapas/2026-01?tipo=clientes',
    params: { periodo: '2026-01' },
  },
  {
    nome: 'GET /api/contabilidade/exercicios/[id]/encerramento/[documento]',
    carregar: () =>
      getDe(import('@/app/api/contabilidade/exercicios/[id]/encerramento/[documento]/route')),
    url: 'http://localhost/api/contabilidade/exercicios/ex-2026/encerramento/balanco',
    params: { id: 'ex-2026', documento: 'balanco' },
  },
];

const ROTA_DRE: Rota = {
  nome: 'GET /api/contabilidade/dre/export',
  carregar: () => getDe(import('@/app/api/contabilidade/dre/export/route')),
  url: 'http://localhost/api/contabilidade/dre/export?dataInicio=2026-01-01&dataFim=2026-01-31&formato=pdf',
  params: {},
};

const ROTA_BALANCO: Rota = {
  nome: 'GET /api/contabilidade/balanco/export',
  carregar: () => getDe(import('@/app/api/contabilidade/balanco/export/route')),
  url: 'http://localhost/api/contabilidade/balanco/export?exercicioId=ex-2026&formato=pdf',
  params: {},
};

async function pedir(rota: Rota, handler: Handler): Promise<Response> {
  return handler(new NextRequest(rota.url), { params: Promise.resolve(rota.params) });
}

/**
 * Faz pedidos até ao primeiro 429 (no máximo LIMITE_MAX + 1). Devolve quantos
 * passaram antes e a resposta 429 (ou `null` se nunca limitou).
 */
async function esgotar(rota: Rota, handler: Handler) {
  for (let i = 0; i <= LIMITE_MAX; i++) {
    const res = await pedir(rota, handler);
    if (res.status === 429) return { passaram: i, recusa: res };
    // Os pedidos dentro da quota têm de chegar ao handler e ter êxito — senão o
    // teste estaria a contar erros, não exportações.
    expect(res.status, `${rota.nome}: pedido ${i + 1} devia ter êxito`).toBeLessThan(400);
  }
  return { passaram: LIMITE_MAX + 1, recusa: null };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('RATE_LIMIT_DRIVER', 'memory');
  utilizadorActual = 'u-196-a';
  mocks.auth.mockImplementation(async () => sessao(utilizadorActual));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('#196 — exportações, PDF e mapas de IVA têm limitador por utilizador', () => {
  for (const rota of ROTAS_SEM_LIMITADOR) {
    describe(rota.nome, () => {
      it(`devolve 429 com Retry-After depois de ${LIMITE_MIN}..${LIMITE_MAX} pedidos/minuto do mesmo utilizador`, async () => {
        const handler = await rota.carregar();
        const { passaram, recusa } = await esgotar(rota, handler);

        expect(recusa, `${rota.nome}: ${LIMITE_MAX + 1} pedidos seguidos sem 429`).not.toBeNull();
        expect(passaram).toBeGreaterThanOrEqual(LIMITE_MIN);
        expect(passaram).toBeLessThanOrEqual(LIMITE_MAX);

        const retryAfter = Number(recusa!.headers.get('Retry-After'));
        expect(Number.isInteger(retryAfter)).toBe(true);
        expect(retryAfter).toBeGreaterThanOrEqual(1);
        expect(retryAfter).toBeLessThanOrEqual(60);

        const corpo = (await recusa!.json()) as { error?: { code?: string } };
        expect(corpo.error?.code).toBe('RATE_LIMIT_EXCEEDED');

        // E continua recusado enquanto a janela não passa.
        const outra = await pedir(rota, handler);
        expect(outra.status).toBe(429);
      });

      it('a quota é por utilizador: outro utilizador do mesmo tenant não é travado', async () => {
        const handler = await rota.carregar();
        const { recusa } = await esgotar(rota, handler);
        expect(recusa, `${rota.nome}: sem limitador`).not.toBeNull();

        utilizadorActual = 'u-196-b';
        const res = await pedir(rota, handler);
        expect(res.status).toBeLessThan(400);
      });

      it('a quota volta passado o minuto', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-07T10:00:00.000Z'));
        const handler = await rota.carregar();
        const { recusa } = await esgotar(rota, handler);
        expect(recusa, `${rota.nome}: sem limitador`).not.toBeNull();

        vi.setSystemTime(new Date('2026-10-07T10:01:01.000Z'));
        const res = await pedir(rota, handler);
        expect(res.status).toBeLessThan(400);
      });
    });
  }
});

describe('#196 — a chave é utilizador + rota (esgotar uma rota não trava as outras)', () => {
  it('esgotar /api/export/[modulo] não trava o PDF da factura do mesmo utilizador', async () => {
    const [exportar, pdf] = [ROTAS_SEM_LIMITADOR[0], ROTAS_SEM_LIMITADOR[1]];
    const hExportar = await exportar.carregar();
    const hPdf = await pdf.carregar();

    const { recusa } = await esgotar(exportar, hExportar);
    expect(recusa, `${exportar.nome}: sem limitador`).not.toBeNull();

    const res = await pedir(pdf, hPdf);
    expect(res.status).toBeLessThan(400);
  });

  it('esgotar os mapas de IVA não trava o arquivo do encerramento do mesmo utilizador', async () => {
    const [mapas, encerramento] = [ROTAS_SEM_LIMITADOR[2], ROTAS_SEM_LIMITADOR[3]];
    const hMapas = await mapas.carregar();
    const hEnc = await encerramento.carregar();

    const { recusa } = await esgotar(mapas, hMapas);
    expect(recusa, `${mapas.nome}: sem limitador`).not.toBeNull();

    const res = await pedir(encerramento, hEnc);
    expect(res.status).toBeLessThan(400);
  });

  it('esgotar a exportação da DRE não trava a do balanço (deixam de partilhar a quota)', async () => {
    const hDre = await ROTA_DRE.carregar();
    const hBalanco = await ROTA_BALANCO.carregar();

    const { passaram, recusa } = await esgotar(ROTA_DRE, hDre);
    expect(recusa, `${ROTA_DRE.nome}: sem limitador`).not.toBeNull();
    expect(passaram).toBeGreaterThanOrEqual(LIMITE_MIN);

    const res = await pedir(ROTA_BALANCO, hBalanco);
    expect(res.status).toBeLessThan(400);
  });
});
