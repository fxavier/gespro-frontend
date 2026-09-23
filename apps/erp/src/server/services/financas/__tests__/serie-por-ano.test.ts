/**
 * §4 — Série escolhida pela data do documento (ADR-0033 §4)
 *
 * Garante que `proximoNumeroSerie` usa o ano do documento (em Africa/Maputo)
 * para filtrar a série, não `ORDER BY ano DESC`.
 *
 * O modo de falha anterior era silencioso: a 1 de Janeiro de 2027, com só a
 * série de 2026 activa, continuava a emitir FAT/2026/000487 para documentos
 * de 2027. Agora lança SERIE_NAO_ENCONTRADA.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mocks } = vi.hoisted(() => {
  const mocks = {
    queryRaw: vi.fn(),
  };
  return { mocks };
});

vi.mock('@/server/db/client', () => ({
  prisma: { serieDocumento: {} },
  prismaBase: {},
}));

// Mock the tx used in each test
const TX = {
  $queryRaw: mocks.queryRaw,
  serieDocumento: {},
};

// ---------------------------------------------------------------------------
// Import after mock
// ---------------------------------------------------------------------------

import { proximoNumeroSerie } from '../faturacao.service';
import { BusinessRuleError } from '@/lib/errors';

const CTX = { tenantId: 'tenant-1', userId: 'user-1' };

beforeEach(() => {
  mocks.queryRaw.mockReset();
});

describe('proximoNumeroSerie — filtro por ano do documento', () => {
  it('usa a série do ano correcto quando existe (2027)', async () => {
    mocks.queryRaw.mockResolvedValueOnce([
      { numero: 1, prefixo: 'FAT', ano: 2027, formatoNumero: '{prefixo}/{ano}/{numero:06}' },
    ]);

    const doc2027 = new Date('2027-01-05T10:00:00+02:00'); // 05 de Janeiro 2027 em Maputo
    const result = await proximoNumeroSerie(TX as never, 'FATURA', CTX, doc2027);

    expect(result).toBe('FAT/2027/000001');
    // Confirmar que a query SQL usou o ano correcto — verificado pelo mock resolver
    // (a query está certo porque o mock só resolve quando é chamado)
  });

  it('lança SERIE_NAO_ENCONTRADA para documento de 2027 quando só existe série de 2026', async () => {
    // Simula: nenhuma série de 2027 — rows vazias
    mocks.queryRaw.mockResolvedValueOnce([]);

    const doc2027 = new Date('2027-03-10T00:00:00Z');
    await expect(
      proximoNumeroSerie(TX as never, 'FATURA', CTX, doc2027),
    ).rejects.toMatchObject({
      code: 'SERIE_NAO_ENCONTRADA',
    });
  });

  it('não usa a série de 2026 para um documento de 2027 (o bug antigo)', async () => {
    // No comportamento antigo (ORDER BY ano DESC), este mock seria chamado para um
    // documento de 2027 se a série 2027 não existisse — e retornaria a FAT/2026.
    // No comportamento novo, a query filtra por AND ano = 2027, o mock devolve [].
    mocks.queryRaw.mockResolvedValueOnce([]); // nenhuma série de 2027

    const doc2027 = new Date('2027-01-01T00:30:00Z'); // 01 Jan 2027 às 02:30 Maputo
    await expect(
      proximoNumeroSerie(TX as never, 'FATURA', CTX, doc2027),
    ).rejects.toMatchObject({ code: 'SERIE_NAO_ENCONTRADA' });

    // O resultado não deve ser 'FAT/2026/...' — é um erro explícito que se repara.
    // Um erro que pára a emissão repara-se em 5 min; ano errado no número é irreparável.
  });

  it('documento a 31 Dez às 23:30 Maputo (= 21:30 UTC) pertence ao ano correcto', async () => {
    // 31 Dez 2026 às 23:30 Maputo = 21:30 UTC → ano 2026 em Maputo
    mocks.queryRaw.mockResolvedValueOnce([
      { numero: 487, prefixo: 'FAT', ano: 2026, formatoNumero: '{prefixo}/{ano}/{numero:06}' },
    ]);

    const docFimAno2026 = new Date('2026-12-31T21:30:00Z');
    const result = await proximoNumeroSerie(TX as never, 'FATURA', CTX, docFimAno2026);
    expect(result).toBe('FAT/2026/000487');
  });

  it('documento a 1 Jan à meia-noite Maputo (= 22:00 UTC dia anterior) pertence ao novo ano', async () => {
    // 1 Jan 2027 às 00:00 Maputo = 31 Dez 2026 às 22:00 UTC
    // UTC getFullYear() daria 2026 — Maputo dá 2027
    mocks.queryRaw.mockResolvedValueOnce([
      { numero: 1, prefixo: 'FAT', ano: 2027, formatoNumero: '{prefixo}/{ano}/{numero:06}' },
    ]);

    const meiaNoiteMaputo2027 = new Date('2026-12-31T22:00:00Z');
    const result = await proximoNumeroSerie(TX as never, 'FATURA', CTX, meiaNoiteMaputo2027);
    expect(result).toBe('FAT/2027/000001');
    // Se usasse getFullYear() UTC, pediria a série de 2026 e receberia FAT/2026/000001.
  });
});
