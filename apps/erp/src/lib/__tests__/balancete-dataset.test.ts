// ---------------------------------------------------------------------------
// ORÁCULO — `datasetBalancete` (run balancete-phc, S5, issue #285).
// Contrato: .scratch/sdlc/balancete-phc/S5-contrato.md §«Dataset».
//
// Escrito pelo AUTOR DO ORÁCULO antes de existir a função: até lá o import
// dinâmico rebenta — é a prova vermelha. NUNCA `vitest -u`; um agente de
// implementação que altere este ficheiro é BLOCKER.
//
// O contrato fixa os CABEÇALHOS, a ordem e os tipos de coluna, não as chaves das
// linhas: o oráculo lê cada célula pelo cabeçalho (coluna → `key`) e serializa-a
// com o `serializeCell` real — a mesma forma que o CSV e o XLSX escrevem.
//
// Forma do 1.º argumento: o contrato diz «{ nucleo/totais, linhas }». O oráculo
// entrega as duas (`nucleo` com `totais`, e `totais` ao lado) para não fixar uma
// escolha que o contrato deixou aberta.
//
// Onde o contrato não fixa nada, não se afirma: Conta/Descrição/Nível da linha
// «Total» e Conta/Nível da «Sintética».
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { Prisma, type ClassePGC, type NaturezaConta } from '@prisma/client';
import { serializeCell, toCsv, type Dataset } from '@/lib/reporting';
import type {
  BalanceteVerificacaoNucleo,
  ContaBV,
  LinhaHierarquica,
  TotaisBV,
} from '@/server/services/financas/balancete-verificacao';

const modulo = () => import('../balancete-params');

const D = (v: string) => new Prisma.Decimal(v);
const ZERO = D('0');

// ---------------------------------------------------------------------------
// Linhas (já hierarquizadas e filtradas, como a página as mostra)
// ---------------------------------------------------------------------------

function conta(id: string, codigo: string, nome: string, nivel: number, classe: ClassePGC, extra: Partial<ContaBV> = {}): ContaBV {
  const natureza: NaturezaConta = 'DEVEDORA';
  return { id, codigo, nome, classe, natureza, nivel, contaMaeId: null, aceitaLancamento: false, ...extra };
}

type Valores = Pick<LinhaHierarquica, 'movD' | 'movC' | 'acumD' | 'acumC' | 'saldoDevedor' | 'saldoCredor'>;

const V = (movD: string, movC: string, acumD: string, acumC: string, sD: string, sC: string): Valores => ({
  movD: D(movD),
  movC: D(movC),
  acumD: D(acumD),
  acumC: D(acumC),
  saldoDevedor: D(sD),
  saldoCredor: D(sC),
});

function linhaConta(c: ContaBV, v: Valores, extra: Partial<LinhaHierarquica> = {}): LinhaHierarquica {
  return {
    tipo: 'CONTA',
    conta: c,
    implicita: false,
    ...v,
    contraNatureza: false,
    nivel: c.nivel,
    agregadora: !c.aceitaLancamento,
    classe: c.classe,
    maeMostradaId: c.contaMaeId,
    profundidade: c.nivel - 1,
    ...extra,
  };
}

const C1 = conta('c-1', '1', 'Meios financeiros líquidos', 1, 'CLASSE_1');
const C11 = conta('c-11', '11', 'Caixa', 2, 'CLASSE_1', { contaMaeId: 'c-1' });
const C111 = conta('c-111', '111', 'Caixa sede; Maputo "central"', 3, 'CLASSE_1', { contaMaeId: 'c-11', aceitaLancamento: true });
const C7 = conta('c-7', '7', 'Rendimentos', 1, 'CLASSE_7');
const C711 = conta('c-711', '7.1.1', 'Vendas de mercadorias', 3, 'CLASSE_7', { contaMaeId: 'c-7', aceitaLancamento: true, natureza: 'CREDORA' });

const L_C1 = linhaConta(C1, V('12345.67', '0', '1012345.67', '0', '1012345.67', '0'), { contexto: true });
const L_C11 = linhaConta(C11, V('12345.67', '0', '1012345.67', '0', '1012345.67', '0'));
const L_C111 = linhaConta(C111, V('12345.67', '0', '1012345.67', '0', '1012345.67', '0'));
const L_SUB1: LinhaHierarquica = {
  tipo: 'SUBTOTAL_CLASSE',
  conta: null,
  implicita: false,
  ...V('12345.67', '0', '1012345.67', '0', '1012345.67', '0'),
  contraNatureza: false,
  nivel: 1,
  agregadora: true,
  classe: 'CLASSE_1',
  maeMostradaId: null,
  profundidade: 0,
};
const L_C7 = linhaConta(C7, V('0', '98765432109.12', '0', '98765432109.12', '0', '98765432109.12'));
const L_C711 = linhaConta(C711, V('0', '98765432109.12', '0', '98765432109.12', '0', '98765432109.12'));
const L_SUB7: LinhaHierarquica = { ...L_SUB1, ...V('0', '98765432109.12', '0', '98765432109.12', '0', '98765432109.12'), classe: 'CLASSE_7' };
const L_SINT: LinhaHierarquica = {
  tipo: 'SINTETICA',
  conta: null,
  implicita: true,
  ...V('0', '0', '0', '500.25', '0', '500.25'),
  contraNatureza: false,
  nivel: 2,
  agregadora: false,
  classe: 'CLASSE_8',
  maeMostradaId: null,
  profundidade: 1,
};
const L_SUB8: LinhaHierarquica = { ...L_SUB1, ...V('0', '0', '0', '500.25', '0', '500.25'), classe: 'CLASSE_8' };

const LINHAS: LinhaHierarquica[] = [L_C1, L_C11, L_C111, L_SUB1, L_C7, L_C711, L_SUB7, L_SINT, L_SUB8];

/**
 * Totais do balancete COMPLETO — de propósito diferentes da soma das linhas acima
 * (o balancete inteiro tem contas que os filtros esconderam).
 */
const TOTAIS: TotaisBV = {
  movD: D('55555.55'),
  movC: D('44444.44'),
  acumD: D('3333333.33'),
  acumC: D('2222222.22'),
  saldoDevedor: D('1111111.11'),
  saldoCredor: D('0'),
};

const NUCLEO: BalanceteVerificacaoNucleo = {
  linhas: [],
  totais: TOTAIS,
  equilibrio: { movimento: false, acumulado: false, saldo: false },
  temAberturaImplicita: false,
  temResultadosAnterioresPorEncerrar: true,
};

const CABECALHO = { exercicio: '2026', periodoInicial: 2, periodoFinal: 5, incluir13: false };

type Tipo = 'PERIODO' | 'ACUMULADO' | 'AMBOS';

async function dataset(linhas: LinhaHierarquica[] = LINHAS, tipo: Tipo = 'AMBOS', totais: TotaisBV = TOTAIS): Promise<Dataset> {
  const { datasetBalancete } = await modulo();
  const resultado = { nucleo: { ...NUCLEO, totais }, totais, linhas };
  return datasetBalancete(resultado, tipo, CABECALHO) as Dataset;
}

// ---------------------------------------------------------------------------
// Leitura pelo cabeçalho
// ---------------------------------------------------------------------------

const PRIMEIRAS = ['Conta', 'Descrição', 'Tipo', 'Nível'];
const MOV = ['Movimento Débito', 'Movimento Crédito'];
const ACUM = ['Acumulado Débito', 'Acumulado Crédito'];
const SALDO = ['Saldo Devedor', 'Saldo Credor'];
const DECIMAIS = [...MOV, ...ACUM, ...SALDO];

const CABECALHOS: Record<Tipo, string[]> = {
  AMBOS: [...PRIMEIRAS, ...MOV, ...ACUM, ...SALDO],
  PERIODO: [...PRIMEIRAS, ...MOV, ...SALDO],
  ACUMULADO: [...PRIMEIRAS, ...ACUM, ...SALDO],
};

/** Célula `header` da linha `i`, serializada como o CSV/XLSX a escrevem. */
function celula(ds: Dataset, i: number, header: string): string {
  const col = ds.colunas.find((c) => c.header === header);
  if (!col) throw new Error(`coluna «${header}» ausente`);
  return serializeCell(ds.linhas[i]![col.key], col.type);
}

function registo(ds: Dataset, i: number): Record<string, string> {
  return Object.fromEntries(ds.colunas.map((c) => [c.header, celula(ds, i, c.header)]));
}

const valores = (v: Valores, tipo: Tipo = 'AMBOS'): Record<string, string> => {
  const todos: Record<string, string> = {
    'Movimento Débito': v.movD.toString(),
    'Movimento Crédito': v.movC.toString(),
    'Acumulado Débito': v.acumD.toString(),
    'Acumulado Crédito': v.acumC.toString(),
    'Saldo Devedor': v.saldoDevedor.toString(),
    'Saldo Credor': v.saldoCredor.toString(),
  };
  return Object.fromEntries(CABECALHOS[tipo].filter((h) => h in todos).map((h) => [h, todos[h]!]));
};

// ---------------------------------------------------------------------------
// Colunas
// ---------------------------------------------------------------------------

describe('datasetBalancete — colunas', () => {
  for (const tipo of ['AMBOS', 'PERIODO', 'ACUMULADO'] as const) {
    it(`${tipo}: cabeçalhos exactos e pela ordem do contrato`, async () => {
      const ds = await dataset(LINHAS, tipo);
      expect(ds.colunas.map((c) => c.header)).toEqual(CABECALHOS[tipo]);
    });
  }

  it('tipos: Conta/Descrição/Tipo texto, Nível inteiro, valores decimais', async () => {
    const ds = await dataset();
    const tipoDe = (h: string) => ds.colunas.find((c) => c.header === h)!.type ?? 'text';
    expect(tipoDe('Conta')).toBe('text');
    expect(tipoDe('Descrição')).toBe('text');
    expect(tipoDe('Tipo')).toBe('text');
    expect(tipoDe('Nível')).toBe('integer');
    for (const h of DECIMAIS) expect(tipoDe(h), h).toBe('decimal');
  });

  it('chaves de coluna únicas', async () => {
    const ds = await dataset();
    const chaves = ds.colunas.map((c) => c.key);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});

// ---------------------------------------------------------------------------
// Linhas
// ---------------------------------------------------------------------------

describe('datasetBalancete — linhas', () => {
  it('uma linha por linha mostrada, pela mesma ordem, e no fim a linha «Total»', async () => {
    const ds = await dataset();
    expect(ds.linhas).toHaveLength(LINHAS.length + 1);
    expect(ds.linhas.map((_, i) => celula(ds, i, 'Tipo'))).toEqual([
      'Conta', 'Conta', 'Conta', 'Subtotal', 'Conta', 'Conta', 'Subtotal', 'Sintética', 'Subtotal', 'Total',
    ]);
    expect(ds.linhas.slice(0, 3).map((_, i) => celula(ds, i, 'Conta'))).toEqual(['1', '11', '111']);
    expect(celula(ds, 5, 'Conta')).toBe('7.1.1');
  });

  it('CONTA: código, nome da conta, «Conta», nível e os seis valores', async () => {
    const ds = await dataset();
    expect(registo(ds, 2)).toEqual({
      Conta: '111',
      'Descrição': 'Caixa sede; Maputo "central"',
      Tipo: 'Conta',
      'Nível': '3',
      ...valores(L_C111),
    });
    expect(registo(ds, 5)).toEqual({
      Conta: '7.1.1',
      'Descrição': 'Vendas de mercadorias',
      Tipo: 'Conta',
      'Nível': '3',
      ...valores(L_C711),
    });
  });

  it('linha de contexto sai como «Conta», com os seus valores', async () => {
    const ds = await dataset();
    expect(registo(ds, 0)).toEqual({
      Conta: '1',
      'Descrição': 'Meios financeiros líquidos',
      Tipo: 'Conta',
      'Nível': '1',
      ...valores(L_C1),
    });
  });

  it('SUBTOTAL: Conta e Nível vazios, «Total da classe N»', async () => {
    const ds = await dataset();
    expect(registo(ds, 3)).toEqual({ Conta: '', 'Descrição': 'Total da classe 1', Tipo: 'Subtotal', 'Nível': '', ...valores(L_SUB1) });
    expect(registo(ds, 6)).toEqual({ Conta: '', 'Descrição': 'Total da classe 7', Tipo: 'Subtotal', 'Nível': '', ...valores(L_SUB7) });
    expect(registo(ds, 8)).toEqual({ Conta: '', 'Descrição': 'Total da classe 8', Tipo: 'Subtotal', 'Nível': '', ...valores(L_SUB8) });
  });

  it('SINTÉTICA: descrição exacta, «Sintética», valores', async () => {
    const ds = await dataset();
    const r = registo(ds, 7);
    expect(r['Descrição']).toBe('Resultados de exercícios anteriores por encerrar (implícita)');
    expect(r.Tipo).toBe('Sintética');
    for (const [h, v] of Object.entries(valores(L_SINT))) expect(r[h], h).toBe(v);
  });

  it('TOTAL: os totais do núcleo (balancete completo), Nível vazio', async () => {
    const ds = await dataset();
    const r = registo(ds, LINHAS.length);
    expect(r.Tipo).toBe('Total');
    expect(r['Nível']).toBe('');
    for (const [h, v] of Object.entries(valores(TOTAIS))) expect(r[h], h).toBe(v);
  });

  it('TOTAL não muda com as linhas mostradas (filtros) nem com o tipo', async () => {
    for (const linhas of [LINHAS, [L_C7, L_C711, L_SUB7], []]) {
      for (const tipo of ['AMBOS', 'PERIODO', 'ACUMULADO'] as const) {
        const ds = await dataset(linhas, tipo);
        expect(ds.linhas).toHaveLength(linhas.length + 1);
        const r = registo(ds, linhas.length);
        expect(r.Tipo).toBe('Total');
        for (const [h, v] of Object.entries(valores(TOTAIS, tipo))) expect(r[h], `${tipo} ${h}`).toBe(v);
      }
    }
  });

  it('PERIODO/ACUMULADO: cada linha leva só as colunas do seu bloco', async () => {
    for (const tipo of ['PERIODO', 'ACUMULADO'] as const) {
      const ds = await dataset(LINHAS, tipo);
      expect(registo(ds, 2)).toEqual({ Conta: '111', 'Descrição': 'Caixa sede; Maputo "central"', Tipo: 'Conta', 'Nível': '3', ...valores(L_C111, tipo) });
    }
  });
});

// ---------------------------------------------------------------------------
// Serialização (CSV real)
// ---------------------------------------------------------------------------

/** Linhas do CSV sem BOM; a tabela começa no cabeçalho (pode haver metadados antes). */
function tabelaCsv(csv: string, cabecalho: string): string[] {
  const linhas = csv.replace(/^﻿/, '').split('\r\n');
  const i = linhas.indexOf(cabecalho);
  expect(i, `cabeçalho «${cabecalho}» não encontrado no CSV`).toBeGreaterThanOrEqual(0);
  return linhas.slice(i);
}

describe('datasetBalancete — CSV', () => {
  it('cabeçalho exacto (AMBOS) e uma linha por linha do dataset', async () => {
    const ds = await dataset();
    const t = tabelaCsv(toCsv(ds), CABECALHOS.AMBOS.join(';'));
    expect(t).toHaveLength(1 + LINHAS.length + 1);
  });

  it('cabeçalho exacto (PERIODO e ACUMULADO)', async () => {
    tabelaCsv(toCsv(await dataset(LINHAS, 'PERIODO')), CABECALHOS.PERIODO.join(';'));
    tabelaCsv(toCsv(await dataset(LINHAS, 'ACUMULADO')), CABECALHOS.ACUMULADO.join(';'));
  });

  it('decimais sem perda: ponto decimal, sem separador de milhares, sem «MT», zeros como 0', async () => {
    const ds = await dataset();
    const t = tabelaCsv(toCsv(ds), CABECALHOS.AMBOS.join(';'));
    // A descrição tem «;» e aspas: sai entre aspas, com as aspas duplicadas (RFC 4180).
    expect(t[3]).toBe('111;"Caixa sede; Maputo ""central""";Conta;3;12345.67;0;1012345.67;0;1012345.67;0');
    expect(t[6]).toBe('7.1.1;Vendas de mercadorias;Conta;3;0;98765432109.12;0;98765432109.12;0;98765432109.12');
    expect(t[4]).toBe(';Total da classe 1;Subtotal;;12345.67;0;1012345.67;0;1012345.67;0');
    expect(t[t.length - 1]!.endsWith(';Total;;55555.55;44444.44;3333333.33;2222222.22;1111111.11;0')).toBe(true);
    const corpo = t.slice(1).join('\n');
    expect(corpo).not.toMatch(/MT/);
    expect(corpo).not.toMatch(/—/);
    expect(corpo).not.toMatch(/\d\.\d{3}\.\d/); // milhares com ponto
    expect(corpo).not.toMatch(/\d \d{3}/); // milhares com espaço
    expect(corpo).not.toMatch(/\d,\d/); // vírgula decimal
  });

  it('zero vem como 0 em todas as colunas de valor (nunca vazio)', async () => {
    const zeros = linhaConta(C11, V('0', '0', '0', '0', '0', '0'));
    const ds = await dataset([zeros], 'AMBOS', { movD: ZERO, movC: ZERO, acumD: ZERO, acumC: ZERO, saldoDevedor: ZERO, saldoCredor: ZERO });
    for (const i of [0, 1]) for (const h of DECIMAIS) expect(celula(ds, i, h), `${i} ${h}`).toBe('0');
  });

  it('decimais com muitas casas passam inteiros (lossless)', async () => {
    const fina = linhaConta(C111, V('0.000001', '123456789012345.6789', '1', '2', '3', '4'));
    const ds = await dataset([fina]);
    expect(celula(ds, 0, 'Movimento Crédito')).toBe('123456789012345.6789');
    expect(celula(ds, 0, 'Movimento Débito')).not.toMatch(/e/i);
    expect(D(celula(ds, 0, 'Movimento Débito')).equals(D('0.000001'))).toBe(true);
  });
});
