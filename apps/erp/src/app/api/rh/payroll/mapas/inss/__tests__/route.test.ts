/**
 * ORÁCULO — GET /api/rh/payroll/mapas/inss (issue #97, nó B:inss-cabecalho-97).
 *
 * Escrito pelo VERIFICADOR antes da correcção. NUNCA `vitest -u`; um agente de
 * implementação que altere este ficheiro é BLOCKER.
 *
 * Contrato (decisão do orquestrador):
 *  - o cabeçalho do CSV é NEUTRO — nenhuma taxa fixa (nada que case com /_\d+/):
 *    `Codigo;Nome;NUIT;NISS;SalarioBruto;INSS_Trabalhador;INSS_Entidade;INSS_Total`;
 *  - os valores e o formato das linhas NÃO mudam (mesmas 8 colunas, mesma ordem,
 *    `;` como separador, CRLF, BOM UTF-8, nome com aspas duplicadas);
 *  - os valores vêm do processamento (`mapaMensal`), não de uma taxa no código: com
 *    taxas de outra vigência (3,5 % / 4,5 %) a linha reflecte o que foi processado.
 *
 * Duplos: `auth`, `PayrollService.mapaMensal`, `exportLimiter`.
 */
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  mapaMensal: vi.fn(),
  consume: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));

vi.mock('@/server/services/pessoas-projetos/payroll.service', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const PayrollService = (original.PayrollService ?? {}) as Record<string, unknown>;
  return { ...original, PayrollService: { ...PayrollService, mapaMensal: mocks.mapaMensal } };
});

vi.mock('@/server/security/rate-limiter', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return { ...original, exportLimiter: { consume: mocks.consume, check: mocks.consume } };
});

const rota = () => import('../route');

const TENANT = 'tenant-inss-cabecalho-97';
const USER = 'u-inss-cabecalho-97';
const D = (v: string) => new Prisma.Decimal(v);

function sessao(permissions: string[] = ['rh:payroll:read']) {
  return {
    user: { id: USER, tenantId: TENANT, permissions, acesso: 'aberto', name: 'Verificador', email: 'v@demo.mz' },
  };
}

function pedido(qs = 'mes=3&ano=2026') {
  return new NextRequest(`http://localhost/api/rh/payroll/mapas/inss?${qs}`);
}

// Taxas de uma vigência hipotética diferente de 3 % / 4 %: 3,5 % trabalhador, 4,5 % entidade.
const LINHAS = [
  {
    colaboradorCodigo: 'COL-001',
    colaboradorNome: 'Ana "Nita" Mabunda',
    nuit: '100200300',
    niss: '987654321',
    salarioBruto: D('20000'),
    inssTrabalhador: D('700'),
    inssEntidade: D('900'),
    irps: D('0'),
  },
  {
    colaboradorCodigo: 'COL-002',
    colaboradorNome: 'Bento Cossa',
    nuit: '100200301',
    niss: null,
    salarioBruto: D('15000.5'),
    inssTrabalhador: D('525.02'),
    inssEntidade: D('675.02'),
    irps: D('0'),
  },
];

async function csvDe(res: Response): Promise<string[]> {
  // `text()` descodifica e retira o BOM: lê-se os bytes para provar que se mantém.
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
  return new TextDecoder('utf-8').decode(bytes.slice(3)).split('\r\n');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(sessao());
  mocks.consume.mockResolvedValue({ limited: false, retryAfterSec: 0 });
  mocks.mapaMensal.mockResolvedValue({ linhas: LINHAS });
});

describe('GET /api/rh/payroll/mapas/inss — cabeçalho neutro (#97)', () => {
  it('o cabeçalho não contém taxa nenhuma (/_\\d+/)', async () => {
    const { GET } = await rota();
    const res = await (GET as any)(pedido(), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const [cabecalho] = await csvDe(res);
    expect(cabecalho).not.toMatch(/_\d+/);
  });

  it('o cabeçalho é exactamente o neutro, com as mesmas 8 colunas e a mesma ordem', async () => {
    const { GET } = await rota();
    const res = await (GET as any)(pedido(), { params: Promise.resolve({}) });
    const [cabecalho] = await csvDe(res);
    expect(cabecalho).toBe(
      'Codigo;Nome;NUIT;NISS;SalarioBruto;INSS_Trabalhador;INSS_Entidade;INSS_Total',
    );
  });

  it('as linhas não mudam: valores processados, 2 casas, nome com aspas, NISS vazio, CRLF', async () => {
    const { GET } = await rota();
    const res = await (GET as any)(pedido(), { params: Promise.resolve({}) });
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="mapa-inss-2026-03.csv"');
    const [cabecalho, ...corpo] = await csvDe(res);
    expect(corpo).toEqual([
      'COL-001;"Ana ""Nita"" Mabunda";100200300;987654321;20000.00;700.00;900.00;1600.00',
      'COL-002;"Bento Cossa";100200301;;15000.50;525.02;675.02;1200.04',
    ]);
    for (const linha of corpo) {
      // O nome pode ter `;`? Não nestes dados: cada linha tem tantas colunas quanto o cabeçalho.
      expect(linha.split(';')).toHaveLength(cabecalho.split(';').length);
    }
    expect(mocks.mapaMensal).toHaveBeenCalledWith(
      'INSS',
      3,
      2026,
      expect.objectContaining({ tenantId: TENANT, userId: USER }),
    );
  });

  it('sem linhas, o CSV é só o cabeçalho neutro', async () => {
    mocks.mapaMensal.mockResolvedValue({ linhas: [] });
    const { GET } = await rota();
    const res = await (GET as any)(pedido(), { params: Promise.resolve({}) });
    const linhas = await csvDe(res);
    expect(linhas).toEqual([
      'Codigo;Nome;NUIT;NISS;SalarioBruto;INSS_Trabalhador;INSS_Entidade;INSS_Total',
    ]);
  });
});
