/**
 * ORÁCULO — GET /api/rh/payroll/mapas/irps: injecção de fórmulas (issue #294).
 *
 * Escrito pelo VERIFICADOR antes da correcção. NUNCA `vitest -u`; um agente de
 * implementação que altere este ficheiro é BLOCKER.
 *
 * Contrato: os campos de TEXTO (código, nome, NUIT) passam por
 * `neutralizarFormula` de `@/lib/reporting/csv` — prefixo `'` quando começam por
 * `= + - @ \t \r`; os valores monetários (`toFixed(2)`) ficam intactos, mesmo
 * negativos. O formato do #97 (cabeçalho, BOM, CRLF) não muda.
 *
 * Duplos: `auth`, `PayrollService.mapaMensal`, `exportLimiter`.
 */
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), mapaMensal: vi.fn(), consume: vi.fn() }));

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

const D = (v: string) => new Prisma.Decimal(v);

/** Parser RFC-4180 mínimo (`;`, CRLF, aspas duplicadas) — lê o que o Excel leria. */
function parseCsv(csv: string): string[][] {
  const texto = csv.replace(/^﻿/, '');
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]!;
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === ';') { linha.push(campo); campo = ''; }
    else if (ch === '\r' && texto[i + 1] === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; i++; }
    else campo += ch;
  }
  linha.push(campo);
  linhas.push(linha);
  return linhas;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    user: { id: 'u-csv-294', tenantId: 'tenant-csv-294', permissions: ['rh:payroll:read'], acesso: 'aberto', name: 'V', email: 'v@demo.mz' },
  });
  mocks.consume.mockResolvedValue({ limited: false, retryAfterSec: 0 });
});

async function mapa(linhas: unknown[]): Promise<string[][]> {
  mocks.mapaMensal.mockResolvedValue({ linhas });
  const { GET } = await import('../route');
  const res = await (GET as any)(new NextRequest('http://localhost/api/rh/payroll/mapas/irps?mes=3&ano=2026'), {
    params: Promise.resolve({}),
  });
  expect(res.status).toBe(200);
  return parseCsv(await res.text());
}

describe('GET /api/rh/payroll/mapas/irps — CSV injection (#294)', () => {
  it('código, nome e NUIT começados por = + - @ TAB CR saem com apóstrofo', async () => {
    const t = await mapa([
      {
        colaboradorCodigo: '=1+1',
        colaboradorNome: '=HYPERLINK("http://mal.example";"x")',
        nuit: '+258',
        niss: null,
        salarioBruto: D('20000'),
        inssTrabalhador: D('0'),
        inssEntidade: D('0'),
        irps: D('1500'),
      },
      {
        colaboradorCodigo: '-COL',
        colaboradorNome: '@Nome',
        nuit: '\t1',
        niss: null,
        salarioBruto: D('100'),
        inssTrabalhador: D('0'),
        inssEntidade: D('0'),
        irps: D('0'),
      },
      {
        colaboradorCodigo: '\rX',
        colaboradorNome: 'Normal',
        nuit: '100200300',
        niss: null,
        salarioBruto: D('100'),
        inssTrabalhador: D('0'),
        inssEntidade: D('0'),
        irps: D('0'),
      },
    ]);
    expect(t[0]!.join(';')).toBe('Codigo;Nome;NUIT;SalarioBruto;IRPS_Retido');
    expect(t[1]).toEqual(["'=1+1", `'=HYPERLINK("http://mal.example";"x")`, "'+258", '20000.00', '1500.00']);
    expect(t[2]).toEqual(["'-COL", "'@Nome", "'\t1", '100.00', '0.00']);
    expect(t[3]).toEqual(["'\rX", 'Normal', '100200300', '100.00', '0.00']);
  });

  it('valores negativos (estornos) ficam intactos — não são fórmulas', async () => {
    const t = await mapa([
      {
        colaboradorCodigo: 'COL-009',
        colaboradorNome: 'Carla Nhaca',
        nuit: '100200309',
        niss: null,
        salarioBruto: D('-603500'),
        inssTrabalhador: D('0'),
        inssEntidade: D('0'),
        irps: D('-12000.5'),
      },
    ]);
    expect(t[1]).toEqual(['COL-009', 'Carla Nhaca', '100200309', '-603500.00', '-12000.50']);
  });
});
