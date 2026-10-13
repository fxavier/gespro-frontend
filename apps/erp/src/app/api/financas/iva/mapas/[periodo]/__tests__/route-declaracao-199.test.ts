/**
 * ORÁCULO — GET /api/financas/iva/mapas/[periodo] (issue #199, nó C:mapa-declaracao-iva-199).
 *
 * Escrito pelo VERIFICADOR antes da correcção. NUNCA `vitest -u`; um agente de
 * implementação que altere este ficheiro é BLOCKER.
 *
 * Contrato:
 *  1. `tipo=declaracao` — o ficheiro leva o RESUMO e os AVISOS que a rota já calcula
 *     (e hoje descarta), em linhas de cabeçalho/rodapé à volta da tabela
 *     `Conta;Nome;Lado;BaseImponivel;Taxa;Imposto;Divergencia`. Cada linha de resumo é
 *     `<rótulo>;<valor>` (o valor é a primeira célula não vazia depois do rótulo, em
 *     qualquer coluna). Rótulos esperados (comparados sem acentos, sem `:` e sem
 *     distinção de maiúsculas):
 *       Período (código aaaa-mm) · Versão · Estado · Declarado em · Referência de entrega ·
 *       IVA liquidado total · IVA dedutível total · Regularizações total (ou Regularizações) ·
 *       Crédito reportado · Saldo · A pagar · A recuperar
 *     Cada aviso de divergência é uma linha que leva a conta e a mensagem
 *     («… difere do imposto do razão …»). Todas as células de texto — rótulos, conta,
 *     referência de entrega, mensagem — passam pela neutralização do #294: nenhuma célula
 *     começa por `= + @ TAB CR`, e uma que comece por `-` só pode ser um número.
 *  2. O nome do ficheiro leva o CÓDIGO do período (aaaa-mm), nunca o id do apuramento.
 *  3. `tipo=antiguidade` não depende do apuramento do período pedido: sem apuramento
 *     nesse período, responde 200 com o saldo a recuperar dos outros períodos.
 *     `tipo=declaracao` sem apuramento continua a recusar (404).
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
const TENANT = 'tenant-mapa-199';
const ID_APURAMENTO = 'ckapuramento199xyz';
const CABECALHO_TABELA = 'Conta;Nome;Lado;BaseImponivel;Taxa;Imposto;Divergencia';

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

const norm = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/:\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Valor da linha de resumo cujo rótulo é um dos dados: primeira célula não vazia depois do rótulo. */
function valorDe(t: string[][], ...rotulos: string[]): string | undefined {
  const alvo = rotulos.map(norm);
  for (const l of t) {
    const i = l.findIndex((c) => alvo.includes(norm(c)));
    if (i >= 0) {
      const v = l.slice(i + 1).find((c) => c.trim() !== '');
      if (v !== undefined) return v;
    }
  }
  return undefined;
}

function esperaDecimal(t: string[][], esperado: string, ...rotulos: string[]) {
  const v = valorDe(t, ...rotulos);
  expect(v, `linha «${rotulos[0]}» no CSV`).toBeDefined();
  expect(D(v!).equals(D(esperado)), `«${rotulos[0]}» = ${v}, esperado ${esperado}`).toBe(true);
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

const APURAMENTO_RECUPERAR = {
  id: ID_APURAMENTO,
  versao: 2,
  estado: 'DECLARADO',
  declaradoEm: new Date('2026-04-20T10:00:00Z'),
  referenciaEntrega: '=EVIL()',
  totalIvaLiquidado: D('160'),
  totalIvaDedutivel: D('603660'),
  totalRegularizacoes: D('-25.5'),
  creditoReportado: D('1200'),
  saldoApuramento: D('-603500'),
  linhas: [
    linhaApuramento({ contaCodigo: '=1+1', divergenciaBase: D('-12.5') }),
    linhaApuramento({ contaCodigo: '2432', contaNome: 'IVA dedutível', tipoMovimento: 'DEBITO', divergenciaBase: D('7.25') }),
    linhaApuramento({ contaCodigo: '2433', contaNome: 'IVA dedutível imobilizado', valorImposto: D('-603660') }),
  ],
};

const APURAMENTO_PAGAR = {
  ...APURAMENTO_RECUPERAR,
  versao: 1,
  estado: 'APURADO',
  declaradoEm: null,
  referenciaEntrega: null,
  totalIvaLiquidado: D('500'),
  totalIvaDedutivel: D('160'),
  totalRegularizacoes: D('0'),
  creditoReportado: D('0'),
  saldoApuramento: D('340'),
  linhas: [linhaApuramento({}), linhaApuramento({ contaCodigo: '2432', tipoMovimento: 'DEBITO' })],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    user: { id: 'u-mapa-199', tenantId: TENANT, permissions: ['financas:iva:mapas'], acesso: 'aberto', name: 'V', email: 'v@demo.mz' },
  });
  mocks.periodoFindFirst.mockResolvedValue(PERIODO);
  mocks.apuramentoFindFirst.mockResolvedValue(APURAMENTO_RECUPERAR);
  mocks.apuramentoFindMany.mockResolvedValue([]);
  mocks.queryRaw.mockResolvedValue([]);
});

async function pedir(tipo: string): Promise<Response> {
  const { GET } = await import('../route');
  return (GET as any)(new NextRequest(`http://localhost/api/financas/iva/mapas/2026-03?tipo=${tipo}`), {
    params: Promise.resolve({ periodo: '2026-03' }),
  });
}

async function mapa(tipo: string): Promise<{ t: string[][]; res: Response }> {
  const res = await pedir(tipo);
  expect(res.status).toBe(200);
  return { t: parseCsv(await res.text()), res };
}

describe('GET /api/financas/iva/mapas/[periodo]?tipo=declaracao — resumo e avisos no ficheiro (#199)', () => {
  it('a tabela das linhas continua presente e intacta', async () => {
    const { t } = await mapa('declaracao');
    const i = t.findIndex((l) => l.join(';') === CABECALHO_TABELA);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(t[i + 1]).toEqual(["'=1+1", 'IVA liquidado', 'CREDITO', '1000', '16%', '160', '-12.5']);
    expect(t[i + 2]).toEqual(['2432', 'IVA dedutível', 'DEBITO', '1000', '16%', '160', '7.25']);
    expect(t[i + 3]).toEqual(['2433', 'IVA dedutível imobilizado', 'CREDITO', '1000', '16%', '-603660', '']);
  });

  it('identificação: período (aaaa-mm), versão, estado, declarado em e referência de entrega', async () => {
    const { t } = await mapa('declaracao');
    expect(valorDe(t, 'Período')).toBe('2026-03');
    expect(valorDe(t, 'Versão')).toBe('2');
    expect(valorDe(t, 'Estado')).toBe('DECLARADO');
    expect(valorDe(t, 'Declarado em')).toMatch(/2026-04-20|20\/04\/2026/);
    // Texto livre do utilizador: neutralizado (#294).
    expect(valorDe(t, 'Referência de entrega')).toBe("'=EVIL()");
  });

  it('resumo completo com saldo a recuperar: regularizações, crédito reportado, a pagar 0, a recuperar positivo', async () => {
    const { t } = await mapa('declaracao');
    esperaDecimal(t, '160', 'IVA liquidado total');
    esperaDecimal(t, '603660', 'IVA dedutível total');
    esperaDecimal(t, '-25.5', 'Regularizações total', 'Regularizações');
    esperaDecimal(t, '1200', 'Crédito reportado');
    esperaDecimal(t, '-603500', 'Saldo');
    esperaDecimal(t, '0', 'A pagar');
    esperaDecimal(t, '603500', 'A recuperar');
  });

  it('resumo com saldo a pagar: a pagar positivo, a recuperar 0', async () => {
    mocks.apuramentoFindFirst.mockResolvedValue(APURAMENTO_PAGAR);
    const { t } = await mapa('declaracao');
    esperaDecimal(t, '340', 'Saldo');
    esperaDecimal(t, '340', 'A pagar');
    esperaDecimal(t, '0', 'A recuperar');
    esperaDecimal(t, '0', 'Regularizações total', 'Regularizações');
    esperaDecimal(t, '0', 'Crédito reportado');
  });

  it('um aviso por linha com divergência, com a conta (neutralizada) e a divergência', async () => {
    const { t } = await mapa('declaracao');
    const avisos = t.filter((l) => l.some((c) => c.includes('difere do imposto do razão')));
    expect(avisos).toHaveLength(2);
    const avisoFormula = avisos.find((l) => l.includes("'=1+1"));
    expect(avisoFormula, 'aviso da conta =1+1 com a conta neutralizada').toBeDefined();
    expect(avisoFormula!.join(';')).toContain('-12.5');
    const aviso2432 = avisos.find((l) => l.includes('2432'));
    expect(aviso2432, 'aviso da conta 2432').toBeDefined();
    expect(aviso2432!.join(';')).toContain('7.25');
    // A conta em bruto nunca aparece como célula: só neutralizada.
    expect(t.some((l) => l.includes('=1+1'))).toBe(false);
  });

  it('sem divergências não há avisos', async () => {
    mocks.apuramentoFindFirst.mockResolvedValue(APURAMENTO_PAGAR);
    const { t } = await mapa('declaracao');
    expect(t.some((l) => l.some((c) => c.includes('difere do imposto do razão')))).toBe(false);
  });

  it('neutralização do #294 em todo o ficheiro: nenhuma célula é fórmula', async () => {
    const { t } = await mapa('declaracao');
    for (const l of t) {
      for (const c of l) {
        expect(/^[=+@\t\r]/.test(c), `célula perigosa: ${JSON.stringify(c)}`).toBe(false);
        if (c.startsWith('-')) expect(c, 'célula começada por - tem de ser número').toMatch(/^-\d+(\.\d+)?$/);
      }
    }
  });
});

describe('GET /api/financas/iva/mapas/[periodo] — nome do ficheiro (#199)', () => {
  it('declaracao: o nome leva o código do período, não o id do apuramento', async () => {
    const { res } = await mapa('declaracao');
    const disp = res.headers.get('Content-Disposition') ?? '';
    expect(disp).toMatch(/filename="mapa-iva-declaracao-2026-03[^"]*\.csv"/);
    expect(disp).not.toContain(ID_APURAMENTO);
  });
});

describe('GET /api/financas/iva/mapas/[periodo]?tipo=antiguidade — não exige apuramento (#199)', () => {
  it('sem apuramento no período pedido, a antiguidade responde 200 com os créditos dos outros períodos', async () => {
    mocks.apuramentoFindFirst.mockResolvedValue(null);
    mocks.apuramentoFindMany.mockResolvedValue([
      {
        estado: 'DECLARADO',
        declaradoEm: new Date('2026-02-20T10:00:00Z'),
        saldoApuramento: D('-1500'),
        periodo: { codigo: '2026-01', dataInicio: new Date('2025-12-31T22:00:00Z') },
      },
    ]);
    const res = await pedir('antiguidade');
    expect(res.status).toBe(200);
    const t = parseCsv(await res.text());
    expect(t[0]!.join(';')).toBe('Periodo;DataInicio;SaldoOriginal;Estado;DeclaradoEm');
    expect(t[1]).toEqual(['2026-01', '2025-12-31', '1500.00', 'DECLARADO', '2026-02-20']);
  });

  it('a declaração continua a recusar sem apuramento (404)', async () => {
    mocks.apuramentoFindFirst.mockResolvedValue(null);
    const res = await pedir('declaracao');
    expect(res.status).toBe(404);
  });
});
