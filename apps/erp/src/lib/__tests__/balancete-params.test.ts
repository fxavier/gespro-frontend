// ---------------------------------------------------------------------------
// ORÁCULO — `lerParametrosBalancete` (run balancete-phc, S5, issue #285).
// Contrato: .scratch/sdlc/balancete-phc/S5-contrato.md §«Partilha página ↔ exportação».
//
// Escrito pelo AUTOR DO ORÁCULO antes de existir `src/lib/balancete-params.ts`:
// até lá o import dinâmico rebenta — é a prova vermelha. NUNCA `vitest -u`; um
// agente de implementação que altere este ficheiro é BLOCKER.
//
// As regras são as que a página `/contabilidade/balancete` aplicava ANTES do S5
// (page.tsx no commit de base do S5), à letra:
//  - exercício: `?exercicio=` (vazio = ausente) → o pedido, senão o que contém
//    «agora» (dataInicio ≤ agora ≤ dataFim), senão o primeiro da lista; lista vazia
//    → `{ semExercicio: true }`; código pedido e não encontrado → assinalado;
//  - períodos: `FiltroBalanceteVerificacaoSchema.safeParse({ de, ate ?? mesAtual,
//    p13 === '1' })`; se falhar, TUDO cai para 1..mesAtual sem p13; depois
//    final = p13 ? final : min(final, 12) e inicial = min(inicial, final);
//  - nivel = parseInt, aceite em 1..7; razao/zeradas/comSaldo só com '1';
//  - ci/cf/excluir: códigos PGC válidos (CODIGO_CONTA_PGC_REGEX, ≤ 20), os
//    outros ignorados; classe /^[1-8]$/ → CLASSE_N; q aparado e cortado a 100;
//  - tipo: 'periodo' → PERIODO, 'acumulado' → ACUMULADO, tudo o resto → AMBOS;
//  - parâmetro repetido (string[]) → o primeiro valor.
//
// «Agora» é o relógio do processo (a página usa `new Date()`); o oráculo fixa-o
// com `vi.setSystemTime` e não passa data nenhuma.
//
// Tolerâncias deliberadas (o contrato não as fixa): `codigoPedidoNaoEncontrado`
// pode ser booleano ou o próprio código; nos filtros e opções, «ausente» aceita
// `undefined`, `false`, '' ou [] (o `filtrarBalancete`/`hierarquizarBalancete`
// tratam-nos igual).
// ---------------------------------------------------------------------------
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const modulo = () => import('../balancete-params');

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

interface ExercicioRef {
  id: string;
  codigo: string;
  dataInicio: Date;
  dataFim: Date;
}

// ids no formato cuid — o `FiltroBalanceteVerificacaoSchema` valida o exercicioId
// com `idEntidade()`; um id de brincar faria o safeParse falhar e mascarava as regras.
function exercicio(ano: number): ExercicioRef {
  return {
    id: `cexercicio${ano}aaaaaaaaaaaaaa`,
    codigo: String(ano),
    dataInicio: new Date(`${ano}-01-01T00:00:00.000+02:00`),
    dataFim: new Date(`${ano}-12-31T23:59:59.999+02:00`),
  };
}

const EX2027 = exercicio(2027);
const EX2026 = exercicio(2026);
const EX2025 = exercicio(2025);
/** Como `listarExercicios` os devolve: código desc — o primeiro é o mais recente. */
const EXERCICIOS = [EX2027, EX2026, EX2025];
const MES_ATUAL = 6;
const AGORA = new Date('2026-06-15T10:00:00.000+02:00');

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AGORA);
});
afterAll(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** O mesmo pedido nas duas formas que a função aceita. */
function formas(qs: string): Array<[string, Params]> {
  const usp = new URLSearchParams(qs);
  const registo: Record<string, string | string[] | undefined> = {};
  for (const chave of new Set(usp.keys())) {
    const todos = usp.getAll(chave);
    registo[chave] = todos.length === 1 ? todos[0] : todos;
  }
  return [
    ['URLSearchParams', usp],
    ['registo do Next', registo],
  ];
}

const ausente = (v: unknown) =>
  v === undefined || v === false || v === '' || (Array.isArray(v) && v.length === 0) ? undefined : v;

function normalizar(o: Record<string, unknown> | undefined): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o ?? {})) {
    const n = ausente(v);
    if (n !== undefined) saida[k] = n;
  }
  return saida;
}

interface Esperado {
  exercicio: ExercicioRef;
  naoEncontrado?: string;
  periodoInicial: number;
  periodoFinal: number;
  incluir13: boolean;
  hierarquia?: { nivelMaximo?: number; apenasRazao?: true; incluirSemMovimento?: true };
  filtros?: {
    contaInicial?: string;
    contaFinal?: string;
    classe?: string;
    excluir?: string[];
    apenasComSaldo?: true;
    pesquisa?: string;
  };
  tipo?: 'PERIODO' | 'ACUMULADO' | 'AMBOS';
}

async function ler(params: Params, exercicios: ExercicioRef[] = EXERCICIOS) {
  const { lerParametrosBalancete } = await modulo();
  return lerParametrosBalancete(params, { exercicios, mesAtual: MES_ATUAL }) as Record<string, unknown> & {
    semExercicio?: true;
  };
}

function verificar(r: Record<string, unknown>, e: Esperado) {
  expect(r.semExercicio).toBeFalsy();
  expect(r.exercicio).toMatchObject({ id: e.exercicio.id, codigo: e.exercicio.codigo });

  const nao = r.codigoPedidoNaoEncontrado;
  if (e.naoEncontrado === undefined) {
    expect(nao === undefined || nao === null || nao === false || nao === '').toBe(true);
  } else {
    expect(nao === true || nao === e.naoEncontrado).toBe(true);
  }

  expect(r.filtroServico).toEqual({
    exercicioId: e.exercicio.id,
    periodoInicial: e.periodoInicial,
    periodoFinal: e.periodoFinal,
    incluir13: e.incluir13,
  });
  expect(normalizar(r.opcoesHierarquia as Record<string, unknown>)).toEqual(e.hierarquia ?? {});
  expect(normalizar(r.filtros as Record<string, unknown>)).toEqual(e.filtros ?? {});
  expect(r.tipo).toBe(e.tipo ?? 'AMBOS');
}

const BASE: Esperado = { exercicio: EX2026, periodoInicial: 1, periodoFinal: MES_ATUAL, incluir13: false };

// ---------------------------------------------------------------------------
// Casos (query string → resultado esperado)
// ---------------------------------------------------------------------------

const CASOS: Array<[string, string, Esperado]> = [
  // --- omissões
  ['sem parâmetros: exercício corrente, 1..mesAtual, ambos', '', BASE],

  // --- períodos
  ['de/ate explícitos', 'de=3&ate=5', { ...BASE, periodoInicial: 3, periodoFinal: 5 }],
  ['só de: ate = mesAtual', 'de=2', { ...BASE, periodoInicial: 2 }],
  ['só ate', 'ate=9', { ...BASE, periodoFinal: 9 }],
  ['de > ate: de passa a ate', 'de=8&ate=3', { ...BASE, periodoInicial: 3, periodoFinal: 3 }],
  ['ate=13 sem p13: tecto 12', 'de=1&ate=13', { ...BASE, periodoFinal: 12 }],
  ['de=13&ate=13 sem p13: 12..12', 'de=13&ate=13', { ...BASE, periodoInicial: 12, periodoFinal: 12 }],
  ['p13=1 com ate=13: 13 entra', 'de=1&ate=13&p13=1', { ...BASE, periodoFinal: 13, incluir13: true }],
  ['p13=1 com 13..13', 'de=13&ate=13&p13=1', { ...BASE, periodoInicial: 13, periodoFinal: 13, incluir13: true }],
  ['p13=1 com ate<13: incluir13 fica true', 'de=2&ate=4&p13=1', { ...BASE, periodoInicial: 2, periodoFinal: 4, incluir13: true }],
  ['p13 diferente de 1 não conta', 'de=1&ate=13&p13=true', { ...BASE, periodoFinal: 12 }],
  ['de inválido: tudo cai para 1..mesAtual, sem p13', 'de=abc&ate=9&p13=1', BASE],
  ['ate=14: fora de 1..13, cai tudo', 'de=2&ate=14', BASE],
  ['de=0: fora de 1..13, cai tudo', 'de=0&ate=4', BASE],
  ['ate vazio: cai tudo', 'de=2&ate=', BASE],

  // --- exercício
  ['exercício pedido existente', 'exercicio=2025', { ...BASE, exercicio: EX2025 }],
  ['exercício pedido futuro existente', 'exercicio=2027&de=2&ate=3', { ...BASE, exercicio: EX2027, periodoInicial: 2, periodoFinal: 3 }],
  ['exercício pedido inexistente: corrente e assinalado', 'exercicio=1999', { ...BASE, naoEncontrado: '1999' }],
  ['exercício vazio = ausente, sem aviso', 'exercicio=', BASE],

  // --- nível e razão
  ['nivel=3', 'nivel=3', { ...BASE, hierarquia: { nivelMaximo: 3 } }],
  ['nivel=7 (limite superior aceite)', 'nivel=7', { ...BASE, hierarquia: { nivelMaximo: 7 } }],
  ['nivel=0 ignorado', 'nivel=0', BASE],
  ['nivel=8 ignorado', 'nivel=8', BASE],
  ['nivel lixo ignorado', 'nivel=abc', BASE],
  ['nivel=4x lido por parseInt como 4', 'nivel=4x', { ...BASE, hierarquia: { nivelMaximo: 4 } }],
  ['razao=1', 'razao=1', { ...BASE, hierarquia: { apenasRazao: true } }],
  ['razao=true ignorado', 'razao=true', BASE],

  // --- filtros de apresentação
  ['ci/cf válidos', 'ci=21&cf=26', { ...BASE, filtros: { contaInicial: '21', contaFinal: '26' } }],
  ['ci/cf com pontos aceites, aparados', 'ci=%201.1%20&cf=4.4.3', { ...BASE, filtros: { contaInicial: '1.1', contaFinal: '4.4.3' } }],
  ['ci/cf inválidos ignorados', 'ci=21a&cf=1..2', BASE],
  ['código com mais de 20 caracteres ignorado', `ci=${'1'.repeat(21)}`, BASE],
  ['classe=4', 'classe=4', { ...BASE, filtros: { classe: 'CLASSE_4' } }],
  ['classe aparada', 'classe=%208%20', { ...BASE, filtros: { classe: 'CLASSE_8' } }],
  ['classe=9 ignorada', 'classe=9', BASE],
  ['classe=0 ignorada', 'classe=0', BASE],
  ['classe=12 ignorada', 'classe=12', BASE],
  [
    'excluir: lista com entradas inválidas largadas',
    `excluir=${encodeURIComponent('21, 2.2,abc,,31 ,4a')}`,
    { ...BASE, filtros: { excluir: ['21', '2.2', '31'] } },
  ],
  ['excluir só com lixo = sem exclusões', 'excluir=abc,,x', BASE],
  ['zeradas=1', 'zeradas=1', { ...BASE, hierarquia: { incluirSemMovimento: true } }],
  ['zeradas=true ignorado', 'zeradas=true', BASE],
  ['comSaldo=1', 'comSaldo=1', { ...BASE, filtros: { apenasComSaldo: true } }],
  ['comSaldo=sim ignorado', 'comSaldo=sim', BASE],
  ['q aparado', 'q=%20%20caixa%20', { ...BASE, filtros: { pesquisa: 'caixa' } }],
  ['q com espaços só = sem pesquisa', 'q=%20%20%20', BASE],
  ['q cortado a 100', `q=${'a'.repeat(150)}`, { ...BASE, filtros: { pesquisa: 'a'.repeat(100) } }],

  // --- tipo
  ['tipo=periodo', 'tipo=periodo', { ...BASE, tipo: 'PERIODO' }],
  ['tipo=acumulado', 'tipo=acumulado', { ...BASE, tipo: 'ACUMULADO' }],
  ['tipo=ambos', 'tipo=ambos', { ...BASE, tipo: 'AMBOS' }],
  ['tipo lixo → ambos', 'tipo=xpto', { ...BASE, tipo: 'AMBOS' }],
  ['tipo em maiúsculas não é o da página → ambos', 'tipo=PERIODO', { ...BASE, tipo: 'AMBOS' }],

  // --- tudo junto
  [
    'combinação completa',
    'exercicio=2025&de=4&ate=13&p13=1&nivel=5&razao=1&ci=1&cf=7&classe=6&excluir=61,62&zeradas=1&comSaldo=1&q=vendas&tipo=acumulado',
    {
      exercicio: EX2025,
      periodoInicial: 4,
      periodoFinal: 13,
      incluir13: true,
      hierarquia: { nivelMaximo: 5, apenasRazao: true, incluirSemMovimento: true },
      filtros: {
        contaInicial: '1',
        contaFinal: '7',
        classe: 'CLASSE_6',
        excluir: ['61', '62'],
        apenasComSaldo: true,
        pesquisa: 'vendas',
      },
      tipo: 'ACUMULADO',
    },
  ],
];

describe('lerParametrosBalancete — regras da página, nas duas formas de parâmetros', () => {
  for (const [nome, qs, esperado] of CASOS) {
    for (const [forma, params] of formas(qs)) {
      it(`${nome} (${forma})`, async () => {
        verificar(await ler(params), esperado);
      });
    }
  }
});

describe('lerParametrosBalancete — exercício', () => {
  it('sem exercícios → { semExercicio: true }', async () => {
    for (const [, params] of formas('exercicio=2026&de=1&ate=3')) {
      const r = await ler(params, []);
      expect(r.semExercicio).toBe(true);
    }
  });

  it('nenhum exercício contém «agora» → o primeiro da lista', async () => {
    vi.setSystemTime(new Date('2030-03-01T12:00:00.000+02:00'));
    try {
      verificar(await ler(new URLSearchParams('')), { ...BASE, exercicio: EX2027 });
      verificar(await ler(new URLSearchParams('exercicio=1999')), { ...BASE, exercicio: EX2027, naoEncontrado: '1999' });
    } finally {
      vi.setSystemTime(AGORA);
    }
  });

  it('o corrente decide pelo relógio, não pela posição na lista', async () => {
    vi.setSystemTime(new Date('2025-11-20T09:00:00.000+02:00'));
    try {
      verificar(await ler(new URLSearchParams('')), { ...BASE, exercicio: EX2025 });
    } finally {
      vi.setSystemTime(AGORA);
    }
  });

  it('a lista com um só exercício (não corrente) usa-o', async () => {
    verificar(await ler(new URLSearchParams(''), [EX2025]), { ...BASE, exercicio: EX2025 });
  });
});

describe('lerParametrosBalancete — registo do Next com valores repetidos', () => {
  it('string[] → o primeiro valor de cada parâmetro', async () => {
    const r = await ler({
      exercicio: ['2025', '2026'],
      de: ['2', '9'],
      ate: ['4', '1'],
      tipo: ['periodo', 'acumulado'],
      classe: ['3', '5'],
      nivel: undefined,
    });
    verificar(r, {
      ...BASE,
      exercicio: EX2025,
      periodoInicial: 2,
      periodoFinal: 4,
      filtros: { classe: 'CLASSE_3' },
      tipo: 'PERIODO',
    });
  });
});
