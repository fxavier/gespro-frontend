/**
 * Oráculo do ticket 3 do épico #149 — núcleo puro das séries de documento.
 *
 * Escrito pelo verificador ANTES da implementação; o implementador não o altera.
 *
 *   S2  proximoNumero ≥ numeroInicial; «usada» ⇔ proximoNumero > numeroInicial;
 *       documentos emitidos = proximoNumero − numeroInicial.
 *   S4  formato fixo `{prefixo}/{ano}/{numero:06}` — e a pré-visualização é o
 *       número que `proximoNumeroSerie` emite (mesma função, sem cópia).
 *   S5  anos permitidos na criação = [ano civil em Africa/Maputo, +1].
 *
 * Os oráculos aqui são independentes do código: o ano em Maputo calcula-se como
 * UTC+2 (Moçambique não tem hora de Verão), o número formatado como
 * `${p}/${a}/${String(n).padStart(6, '0')}`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock('@/server/db/client', () => ({
  prisma: { serieDocumento: {} },
  prismaBase: {},
}));

import {
  FORMATO_NUMERO_SERIE,
  formatarNumero,
  previsualizarNumero,
  serieUsada,
  documentosEmitidos,
  anosPermitidos,
} from '@/lib/series-documento';
import { proximoNumeroSerie } from '@/server/services/financas/faturacao.service';

const CTX = { tenantId: 'tenant-1', userId: 'user-1' };
const TX = { $queryRaw: queryRaw, serieDocumento: {} };

beforeEach(() => {
  queryRaw.mockReset();
});

// Geradores ------------------------------------------------------------------

/** Prefixos que o schema aceita: 1–10 de [A-Z0-9-]. */
const prefixo = fc
  .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-'.split('')), {
    minLength: 1,
    maxLength: 10,
  })
  .map((cs) => cs.join(''));
const ano = fc.integer({ min: 2020, max: 2100 });
const numero = fc.integer({ min: 1, max: 99_999_999 });

/** Oráculo independente do ano civil em Africa/Maputo (UTC+2 fixo). */
function anoMaputo(d: Date): number {
  return new Date(d.getTime() + 2 * 3_600_000).getUTCFullYear();
}

// ---------------------------------------------------------------------------
// S4 — formato e pré-visualização
// ---------------------------------------------------------------------------

describe('S4 — formato fixo e pré-visualização', () => {
  it('FORMATO_NUMERO_SERIE é exactamente {prefixo}/{ano}/{numero:06}', () => {
    expect(FORMATO_NUMERO_SERIE).toBe('{prefixo}/{ano}/{numero:06}');
  });

  it('previsualizarNumero = prefixo/ano/número com padding a 6', () => {
    fc.assert(
      fc.property(prefixo, ano, numero, (p, a, n) => {
        expect(previsualizarNumero(p, a, n)).toBe(`${p}/${a}/${String(n).padStart(6, '0')}`);
      }),
    );
  });

  it('padding a 6 nos números pequenos', () => {
    expect(previsualizarNumero('FAT', 2026, 1)).toBe('FAT/2026/000001');
    expect(previsualizarNumero('FAT', 2026, 487)).toBe('FAT/2026/000487');
    expect(previsualizarNumero('FAT', 2026, 999_999)).toBe('FAT/2026/999999');
  });

  it('números ≥ 1 000 000 não são truncados', () => {
    expect(previsualizarNumero('FAT', 2026, 1_000_000)).toBe('FAT/2026/1000000');
    fc.assert(
      fc.property(prefixo, ano, fc.integer({ min: 1_000_000, max: 99_999_999 }), (p, a, n) => {
        expect(previsualizarNumero(p, a, n).endsWith(`/${n}`)).toBe(true);
      }),
    );
  });

  it('formatarNumero honra a largura do template (e sem largura não acolchoa)', () => {
    expect(formatarNumero('{prefixo}-{numero:04}', { prefixo: 'NC', ano: 2026, numero: 7 })).toBe('NC-0007');
    expect(formatarNumero('{ano}.{numero}', { prefixo: 'X', ano: 2027, numero: 7 })).toBe('2027.7');
  });

  it('a pré-visualização É o número que proximoNumeroSerie emite', async () => {
    await fc.assert(
      fc.asyncProperty(prefixo, ano, numero, async (p, a, n) => {
        queryRaw.mockResolvedValueOnce([
          { numero: n, prefixo: p, ano: a, formatoNumero: FORMATO_NUMERO_SERIE },
        ]);
        // data do documento a meio do ano `a` em Maputo
        const data = new Date(Date.UTC(a, 5, 15, 10));
        const emitido = await proximoNumeroSerie(TX as never, 'FATURA', CTX, data);
        expect(emitido).toBe(previsualizarNumero(p, a, n));
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// S2 — série usada e documentos emitidos
// ---------------------------------------------------------------------------

describe('S2 — usada ⇔ proximoNumero > numeroInicial', () => {
  const serie = fc
    .record({ numeroInicial: fc.integer({ min: 1, max: 999_999 }), emitidos: fc.integer({ min: 0, max: 1_000_000 }) })
    .map(({ numeroInicial, emitidos }) => ({
      numeroInicial,
      proximoNumero: numeroInicial + emitidos,
      emitidos,
    }));

  it('serieUsada ⇔ emitidos > 0', () => {
    fc.assert(
      fc.property(serie, (s) => {
        expect(serieUsada({ numeroInicial: s.numeroInicial, proximoNumero: s.proximoNumero })).toBe(s.emitidos > 0);
      }),
    );
  });

  it('documentosEmitidos = proximoNumero − numeroInicial', () => {
    fc.assert(
      fc.property(serie, (s) => {
        expect(documentosEmitidos({ numeroInicial: s.numeroInicial, proximoNumero: s.proximoNumero })).toBe(s.emitidos);
      }),
    );
  });

  it('série do bootstrap (1, 1) não está usada; depois de emitir um, está', () => {
    expect(serieUsada({ numeroInicial: 1, proximoNumero: 1 })).toBe(false);
    expect(documentosEmitidos({ numeroInicial: 1, proximoNumero: 1 })).toBe(0);
    expect(serieUsada({ numeroInicial: 1, proximoNumero: 2 })).toBe(true);
    expect(documentosEmitidos({ numeroInicial: 1, proximoNumero: 2 })).toBe(1);
  });

  it('série a começar em 500: usada só depois do 1.º documento', () => {
    expect(serieUsada({ numeroInicial: 500, proximoNumero: 500 })).toBe(false);
    expect(serieUsada({ numeroInicial: 500, proximoNumero: 501 })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// S5 — anos permitidos na criação (Africa/Maputo)
// ---------------------------------------------------------------------------

describe('S5 — anosPermitidos(agora) = [ano em Maputo, +1]', () => {
  it('propriedade: para qualquer instante, o par é [anoMaputo, anoMaputo + 1]', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2099-12-31T00:00:00Z'), noInvalidDate: true }),
        (d) => {
          const y = anoMaputo(d);
          expect(anosPermitidos(d)).toEqual([y, y + 1]);
        },
      ),
    );
  });

  it('31/12 às 23h30 em Maputo (21h30 UTC) ainda é o ano que acaba', () => {
    expect(anosPermitidos(new Date('2026-12-31T21:30:00Z'))).toEqual([2026, 2027]);
  });

  it('31/12 às 21h59 UTC (23h59 em Maputo) ainda é o ano que acaba', () => {
    expect(anosPermitidos(new Date('2026-12-31T21:59:59Z'))).toEqual([2026, 2027]);
  });

  it('31/12 às 22h00 UTC já é 1/1 em Maputo ⇒ ano seguinte (getFullYear UTC erraria)', () => {
    expect(anosPermitidos(new Date('2026-12-31T22:00:00Z'))).toEqual([2027, 2028]);
  });

  it('1/1 às 00h30 UTC continua o ano novo', () => {
    expect(anosPermitidos(new Date('2027-01-01T00:30:00Z'))).toEqual([2027, 2028]);
  });
});

// ---------------------------------------------------------------------------
// Estrutura — uma só função de formatação, e o núcleo é client-safe
// ---------------------------------------------------------------------------

describe('estrutura (ticket 3.1)', () => {
  const raiz = path.resolve(__dirname, '../../..');
  const lib = readFileSync(path.join(raiz, 'src/lib/series-documento.ts'), 'utf8');
  const servico = readFileSync(path.join(raiz, 'src/server/services/financas/faturacao.service.ts'), 'utf8');

  it('src/lib/series-documento.ts não importa server-only nem o cliente Prisma', () => {
    expect(lib).not.toMatch(/['"]server-only['"]/);
    expect(lib).not.toMatch(/@\/server\//);
  });

  it('faturacao.service.ts não tem cópia de formatarNumero — importa-a de @/lib/series-documento', () => {
    expect(servico).not.toMatch(/function\s+formatarNumero\s*\(/);
    expect(servico).not.toMatch(/const\s+formatarNumero\s*=/);
    expect(servico).toMatch(/from\s+['"]@\/lib\/series-documento['"]/);
  });
});
