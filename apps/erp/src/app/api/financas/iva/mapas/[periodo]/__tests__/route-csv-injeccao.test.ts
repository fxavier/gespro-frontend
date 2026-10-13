/**
 * ORÁCULO — GET /api/financas/iva/mapas/[periodo]: injecção de fórmulas (issue #294).
 *
 * Escrito pelo VERIFICADOR antes da correcção. NUNCA `vitest -u`; um agente de
 * implementação que altere este ficheiro é BLOCKER.
 *
 * Contrato: os quatro mapas constroem o CSV à mão e passam os campos de TEXTO por
 * `neutralizarFormula` de `@/lib/reporting/csv` — prefixo `'` quando começam por
 * `= + - @ \t \r`. Os valores (`toFixed(2)`, `toString()` de Decimal, incluindo a
 * divergência e o SALDO negativos) ficam intactos: `-603500.00` não é uma fórmula.
 *
 * Duplos: `auth`, `prismaBase` (findFirst/findMany/$queryRaw).
 */
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  periodoFindFirst: vi.fn(),
  apuramentoFindFirst: vi.fn(),
  apuramentoFindMany: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/server/db/client', () => ({
  prismaBase: {
    periodoContabil: { findFirst: mocks.periodoFindFirst },
    apuramentoIva: { findFirst: mocks.apuramentoFindFirst, findMany: mocks.apuramentoFindMany },
    $queryRaw: mocks.queryRaw,
  },
}));

const D = (v: string) => new Prisma.Decimal(v);
const TENANT = 'tenant-csv-294';

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

const PERIODO = {
  id: 'per-2026-03',
  codigo: '2026-03',
  estado: 'ABERTO',
  dataInicio: new Date('2026-02-28T22:00:00Z'),
  dataFim: new Date('2026-03-31T21:59:59.999Z'),
};

function linhaApuramento(over: Record<string, unknown>) {
  return {
    contaCodigo: '44331',
    contaNome: 'IVA liquidado',
    tipoMovimento: 'CREDITO',
    baseImponivel: D('1000'),
    taxaAplicada: D('0.16'),
    valorImposto: D('160'),
    divergenciaBase: null,
    ...over,
  };
}

const APURAMENTO = {
  id: 'ap-csv-294',
  versao: 1,
  estado: 'APURADO',
  declaradoEm: null,
  referenciaEntrega: null,
  totalIvaLiquidado: D('160'),
  totalIvaDedutivel: D('603660'),
  totalRegularizacoes: D('0'),
  creditoReportado: D('0'),
  saldoApuramento: D('-603500'),
  linhas: [
    linhaApuramento({ contaCodigo: '=1+1', contaNome: '=HYPERLINK("http://mal.example";"x")' }),
    linhaApuramento({ contaCodigo: '2432', contaNome: '@SUM(1)', tipoMovimento: 'DEBITO', divergenciaBase: D('-12.5') }),
    linhaApuramento({ contaCodigo: '2433', contaNome: '-Dedutível', valorImposto: D('-603660') }),
    linhaApuramento({ contaCodigo: '2434', contaNome: 'IVA dedutível imobilizado' }),
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    user: { id: 'u-csv-294', tenantId: TENANT, permissions: ['financas:iva:mapas'], acesso: 'aberto', name: 'V', email: 'v@demo.mz' },
  });
  mocks.periodoFindFirst.mockResolvedValue(PERIODO);
  mocks.apuramentoFindFirst.mockResolvedValue(APURAMENTO);
  mocks.apuramentoFindMany.mockResolvedValue([]);
  mocks.queryRaw.mockResolvedValue([]);
});

async function mapa(tipo: string): Promise<string[][]> {
  const { GET } = await import('../route');
  const res = await (GET as any)(new NextRequest(`http://localhost/api/financas/iva/mapas/2026-03?tipo=${tipo}`), {
    params: Promise.resolve({ periodo: '2026-03' }),
  });
  expect(res.status).toBe(200);
  return parseCsv(await res.text());
}

describe('GET /api/financas/iva/mapas/[periodo] — CSV injection (#294)', () => {
  it('declaracao: conta e nome perigosos saem com apóstrofo; valores negativos intactos', async () => {
    const t = await mapa('declaracao');
    // #199: o resumo pode vir em linhas de cabeçalho antes da tabela — localiza-a.
    const i = t.findIndex((l) => l.join(';') === 'Conta;Nome;Lado;BaseImponivel;Taxa;Imposto;Divergencia');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(t[i + 1]).toEqual(["'=1+1", `'=HYPERLINK("http://mal.example";"x")`, 'CREDITO', '1000', '16%', '160', '']);
    expect(t[i + 2]).toEqual(['2432', "'@SUM(1)", 'DEBITO', '1000', '16%', '160', '-12.5']);
    expect(t[i + 3]).toEqual(['2433', "'-Dedutível", 'CREDITO', '1000', '16%', '-603660', '']);
    expect(t[i + 4]).toEqual(['2434', 'IVA dedutível imobilizado', 'CREDITO', '1000', '16%', '160', '']);
    // Totais: o SALDO negativo é um número, não uma fórmula.
    const saldo = t.find((l) => l[2] === 'SALDO');
    expect(saldo).toEqual(['', '', 'SALDO', '', '', '-603500.00', '']);
    expect(t.find((l) => l[2] === 'IVA DEDUTÍVEL TOTAL')).toEqual(['', '', 'IVA DEDUTÍVEL TOTAL', '', '', '603660.00', '']);
  });

  it('clientes: número, NUIT perigosos saem com apóstrofo; base/IVA/total negativos intactos', async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        numero: '=cmd|\' /C calc\'!A0',
        dataEmissao: new Date('2026-03-10T10:00:00Z'),
        nuitCliente: '+258840000000',
        nuitAtual: null,
        baseIva: D('1000'),
        ivaTotal: D('160'),
        total: D('1160'),
      },
      {
        numero: 'NC/2026/000001',
        dataEmissao: new Date('2026-03-11T10:00:00Z'),
        nuitCliente: null,
        nuitAtual: '\t400100200',
        baseIva: D('-603500'),
        ivaTotal: D('-96560'),
        total: D('-700060'),
      },
    ]);
    const t = await mapa('clientes');
    expect(t[0]!.join(';')).toBe('Numero;Data;NUIT;AvNUIT;BaseImponivel;IVA;Total');
    expect(t[1]).toEqual(["'=cmd|' /C calc'!A0", '2026-03-10', "'+258840000000", '', '1000.00', '160.00', '1160.00']);
    expect(t[2]).toEqual([
      'NC/2026/000001',
      '2026-03-11',
      "'\t400100200",
      'NUIT actual do cliente, não o do documento',
      '-603500.00',
      '-96560.00',
      '-700060.00',
    ]);
  });

  it('fornecedores: número do documento, NUIT e tipo perigosos saem com apóstrofo; valores intactos', async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        numeroDocumento: '@SUM(1+1)',
        dataDocumento: new Date('2026-03-05T10:00:00Z'),
        nuitFornecedor: '-1+1',
        tipoAquisicao: '\r=1',
        baseIva: D('-500'),
        taxaIva: D('0.16'),
        valorIva: D('-80'),
      },
      {
        numeroDocumento: 'FT 123/2026',
        dataDocumento: new Date('2026-03-06T10:00:00Z'),
        nuitFornecedor: '400500600',
        tipoAquisicao: 'BENS',
        baseIva: D('500'),
        taxaIva: D('0.16'),
        valorIva: D('80'),
      },
    ]);
    const t = await mapa('fornecedores');
    expect(t[0]!.join(';')).toBe('NumeroDocumento;Data;NUIT;TipoAquisicao;Base;Taxa;IVA');
    expect(t[1]).toEqual(["'@SUM(1+1)", '2026-03-05', "'-1+1", "'\r=1", '-500.00', '16%', '-80.00']);
    expect(t[2]).toEqual(['FT 123/2026', '2026-03-06', '400500600', 'BENS', '500.00', '16%', '80.00']);
  });

  it('antiguidade: código do período perigoso sai com apóstrofo; saldo intacto', async () => {
    mocks.apuramentoFindMany.mockResolvedValue([
      {
        estado: 'APURADO',
        declaradoEm: null,
        saldoApuramento: D('-603500'),
        periodo: { codigo: '=2026-01', dataInicio: new Date('2025-12-31T22:00:00Z') },
      },
      {
        estado: 'DECLARADO',
        declaradoEm: new Date('2026-02-20T10:00:00Z'),
        saldoApuramento: D('-10'),
        periodo: { codigo: '2026-02', dataInicio: new Date('2026-01-31T22:00:00Z') },
      },
    ]);
    const t = await mapa('antiguidade');
    expect(t[0]!.join(';')).toBe('Periodo;DataInicio;SaldoOriginal;Estado;DeclaradoEm');
    expect(t[1]).toEqual(["'=2026-01", '2025-12-31', '603500.00', 'APURADO', '']);
    expect(t[2]).toEqual(['2026-02', '2026-01-31', '10.00', 'DECLARADO', '2026-02-20']);
  });
});
