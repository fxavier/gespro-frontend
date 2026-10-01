// ---------------------------------------------------------------------------
// Balancete de verificação PHC — oráculo dos FILTROS DE APRESENTAÇÃO.
// Run balancete-phc, S3 (#283), ADR-0040 §5, contrato
// .scratch/sdlc/balancete-phc/S3-contrato.md §1 (incluirSemMovimento) e §2
// (filtrarBalancete).
//
// Escrito pelo AUTOR DO ORÁCULO antes de existirem `filtrarBalancete` e a opção
// `incluirSemMovimento`: até lá as chamadas rebentam — é a prova vermelha. As
// linhas de entrada vêm SEMPRE do `montarBalanceteVerificacao` + `hierarquizarBalancete`
// REAIS. NUNCA `vitest -u`; um agente de implementação que altere este ficheiro
// é BLOCKER.
//
// Definições que o oráculo usa, tiradas do contrato à letra:
// - «antepassado» de uma linha CONTA = a linha cuja conta é a `maeMostradaId` da
//   linha, e assim sucessivamente («Esclarecimentos 2», que SUBSTITUI a regra
//   anterior pelo `nivel`). «descendentes mostradas» = o inverso. Uma raiz órfã de
//   nível > 1 (ex.: 63299 do demo, mostrada logo depois de 6981) não tem
//   antepassados e não herda exclusões.
// - P (predicado) = conjunção dos filtros activos; filtro activo = string não vazia,
//   `classe` definida, `excluir` não vazio, `apenasComSaldo === true`.
// - pesquisa: código COMEÇA por q, ou nome CONTÉM q, comparando sem maiúsculas nem
//   acentos (NFD sem marcas combinantes + minúsculas).
//
// Propriedades (planos aleatórios bem-formados e CORROMPIDOS, como o oráculo de
// propriedades da hierarquia):
//   Q1  saída é subsequência da entrada; cada linha mantida tem os mesmos valores;
//       sem filtros activos a saída é a entrada
//   Q2  cada CONTA da saída passa P (contexto falsy) ou é antepassada de uma CONTA
//       que fica (contexto: true); nunca excluída nem descendente de excluída
//   Q3  nenhuma CONTA que passa P e não está sob uma excluída se perde
//   Q4  SINTETICA e SUBTOTAL_CLASSE seguem as regras (visibilidade dos subtotais só
//       em planos bem-formados — ver nota em Q4b); `excluir` nunca tira a SINTETICA
//   Q5  pura: a entrada (congelada) não muda; duas chamadas dão o mesmo
//   Q6  incluirSemMovimento: todas as contas do plano aparecem uma vez; valores,
//       subtotais e totais iguais aos de false; contas novas a zeros
//
// Reprodução: FC_SEED=<n>, FC_RUNS=<n> (omissão 300).
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Prisma, type ClassePGC, type NaturezaConta } from '@prisma/client';
import {
  filtrarBalancete,
  hierarquizarBalancete,
  montarBalanceteVerificacao,
  type AgregadoPartidaBV,
  type BalanceteVerificacaoNucleo,
  type ContaBV,
  type FiltrosBalancete,
  type LinhaHierarquica,
} from '../balancete-verificacao';

type Decimal = Prisma.Decimal;
const D = (v: string) => new Prisma.Decimal(v);
const ZERO = D('0');

const SEMENTE = process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined;
const CORRIDAS = process.env.FC_RUNS ? Number(process.env.FC_RUNS) : 300;
const PARAMS = { numRuns: CORRIDAS, ...(SEMENTE === undefined ? {} : { seed: SEMENTE }) };

const CLASSES: ClassePGC[] = [
  'CLASSE_1', 'CLASSE_2', 'CLASSE_3', 'CLASSE_4', 'CLASSE_5', 'CLASSE_6', 'CLASSE_7', 'CLASSE_8',
];
const COLS = ['movD', 'movC', 'acumD', 'acumC', 'saldoDevedor', 'saldoCredor'] as const;

// ---------------------------------------------------------------------------
// Helpers comuns
// ---------------------------------------------------------------------------

const rotulo = (l: LinhaHierarquica) =>
  l.tipo === 'CONTA' ? l.conta!.codigo : l.tipo === 'SINTETICA' ? 'SINT' : `SUB:${l.classe.slice(-1)}`;

/** Rótulo com «*» nas linhas mantidas só por contexto. */
const rotuloCtx = (l: LinhaHierarquica) => `${rotulo(l)}${(l as { contexto?: boolean }).contexto === true ? '*' : ''}`;

const contextoDe = (l: LinhaHierarquica): boolean | undefined => (l as { contexto?: boolean }).contexto;

/** Campo novo da hierarquia («Esclarecimentos 2»); lido por cast para o ficheiro compilar antes de existir. */
const maeMostradaDe = (l: LinhaHierarquica): string | null | undefined =>
  (l as { maeMostradaId?: string | null }).maeMostradaId;

/** Representação estável (Decimal → texto, chaves ordenadas) para comparar estruturas. */
function serial(v: unknown): unknown {
  if (v instanceof Prisma.Decimal) return `D:${v.toFixed()}`;
  if (Array.isArray(v)) return v.map(serial);
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, serial(o[k])]));
  }
  return v;
}

/** A linha sem o campo `contexto` (o único que o filtro pode acrescentar). */
function semContexto(l: LinhaHierarquica): unknown {
  const { contexto: _c, ...resto } = l as LinhaHierarquica & { contexto?: boolean };
  void _c;
  return serial(resto);
}

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function filtrosActivos(f: FiltrosBalancete): boolean {
  return (
    !!f.contaInicial || !!f.contaFinal || f.classe !== undefined ||
    (f.excluir?.length ?? 0) > 0 || f.apenasComSaldo === true || !!f.pesquisa
  );
}

/** Predicado P sobre uma linha CONTA (todos os filtros activos excepto `excluir`). */
function passaP(l: LinhaHierarquica, f: FiltrosBalancete): boolean {
  const c = l.conta!;
  if (f.contaInicial && !(c.codigo >= f.contaInicial)) return false;
  if (f.contaFinal && !(c.codigo <= f.contaFinal || c.codigo.startsWith(f.contaFinal))) return false;
  if (f.classe !== undefined && l.classe !== f.classe) return false;
  if (f.apenasComSaldo === true && l.saldoDevedor.isZero() && l.saldoCredor.isZero()) return false;
  if (f.pesquisa) {
    const q = normalizar(f.pesquisa);
    if (!(normalizar(c.codigo).startsWith(q) || normalizar(c.nome).includes(q))) return false;
  }
  return true;
}

/**
 * Antepassado mostrado de cada linha CONTA da entrada (índice), pela `maeMostradaId`
 * («Esclarecimentos 2»). Falha se a mãe indicada não for uma linha CONTA ANTERIOR.
 */
function paisMostrados(linhas: LinhaHierarquica[]): (number | null)[] {
  const indicePorId = new Map<string, number>();
  linhas.forEach((l, i) => { if (l.tipo === 'CONTA') indicePorId.set(l.conta!.id, i); });
  return linhas.map((l, i) => {
    if (l.tipo !== 'CONTA') return null;
    const m = maeMostradaDe(l);
    expect(m !== undefined, `premissa: ${rotulo(l)} sem maeMostradaId na entrada`).toBe(true);
    if (m === null || m === undefined) return null;
    const j = indicePorId.get(m);
    expect(j !== undefined && j < i, `premissa: maeMostradaId de ${rotulo(l)} não é linha CONTA anterior`).toBe(true);
    return j!;
  });
}

/**
 * Referência para as linhas CONTA: índice da entrada → 'P' (passa P, não excluída)
 * ou 'ctx' (antepassada de uma 'P', não passa P). As restantes CONTA saem.
 */
function referenciaContas(linhas: LinhaHierarquica[], f: FiltrosBalancete): Map<number, 'P' | 'ctx'> {
  const pais = paisMostrados(linhas);
  const excluir = new Set(f.excluir ?? []);
  const excluida = (i: number): boolean => {
    for (let cur: number | null = i; cur !== null; cur = pais[cur]!) {
      if (excluir.has(linhas[cur]!.conta!.codigo)) return true;
    }
    return false;
  };
  const r = new Map<number, 'P' | 'ctx'>();
  linhas.forEach((l, i) => {
    if (l.tipo === 'CONTA' && !excluida(i) && passaP(l, f)) r.set(i, 'P');
  });
  for (const i of [...r.keys()]) {
    for (let cur = pais[i]!; cur !== null; cur = pais[cur]!) {
      if (!r.has(cur)) r.set(cur, 'ctx');
    }
  }
  return r;
}

/** Mapeia cada linha da saída para o índice da entrada; falha se não for subsequência. */
function indicesNaEntrada(saida: LinhaHierarquica[], entrada: LinhaHierarquica[], onde: string): number[] {
  const idx: number[] = [];
  let j = 0;
  for (const l of saida) {
    const chave = rotulo(l);
    while (j < entrada.length && rotulo(entrada[j]!) !== chave) j++;
    expect(j < entrada.length, `${onde}: «${chave}» não é subsequência da entrada — saída ${saida.map(rotulo).join(' ')} | entrada ${entrada.map(rotulo).join(' ')}`).toBe(true);
    idx.push(j);
    j++;
  }
  return idx;
}

function congelar(linhas: LinhaHierarquica[]): LinhaHierarquica[] {
  for (const l of linhas) Object.freeze(l);
  return Object.freeze(linhas) as LinhaHierarquica[];
}

// ---------------------------------------------------------------------------
// EXEMPLOS — plano feito à mão, pela cadeia real
// ---------------------------------------------------------------------------

function conta(
  codigo: string, nome: string, classe: ClassePGC, natureza: NaturezaConta,
  nivel: number, mae: string | null, aceitaLancamento: boolean,
): ContaBV {
  return {
    id: `id-${codigo}`, codigo, nome, classe, natureza, nivel,
    contaMaeId: mae === null ? null : `id-${mae}`, aceitaLancamento,
  };
}

const CONTAS: ContaBV[] = [
  conta('1', 'Meios financeiros', 'CLASSE_1', 'DEVEDORA', 1, null, false),
  conta('11', 'Caixa', 'CLASSE_1', 'DEVEDORA', 2, '1', true),
  conta('12', 'Depósitos à ordem', 'CLASSE_1', 'DEVEDORA', 2, '1', false),
  conta('121', 'Standard Bank', 'CLASSE_1', 'DEVEDORA', 3, '12', true),
  conta('122', 'Millennium BIM', 'CLASSE_1', 'DEVEDORA', 3, '12', true),
  conta('13', 'Outros depósitos', 'CLASSE_1', 'DEVEDORA', 2, '1', true), // sem movimento
  conta('2', 'Inventários e activos biológicos', 'CLASSE_2', 'DEVEDORA', 1, null, false), // classe sem movimento
  conta('21', 'Compras', 'CLASSE_2', 'DEVEDORA', 2, '2', true),
  conta('4', 'Terceiros', 'CLASSE_4', 'DEVEDORA', 1, null, false),
  conta('42', 'Fornecedores', 'CLASSE_4', 'CREDORA', 2, '4', false),
  conta('421', 'Fornecedores c/c', 'CLASSE_4', 'CREDORA', 3, '42', true),
  conta('422', 'Fornecedores — títulos a pagar', 'CLASSE_4', 'CREDORA', 3, '42', true),
  conta('6', 'Gastos e perdas', 'CLASSE_6', 'DEVEDORA', 1, null, false),
  conta('62', 'Fornecimentos e serviços de terceiros', 'CLASSE_6', 'DEVEDORA', 2, '6', false),
  conta('621', 'Subcontratos e serviços', 'CLASSE_6', 'DEVEDORA', 3, '62', false),
  conta('6211', 'Água', 'CLASSE_6', 'DEVEDORA', 4, '621', true),
  conta('6212', 'Electricidade', 'CLASSE_6', 'DEVEDORA', 4, '621', true),
  conta('63', 'Gastos com pessoal', 'CLASSE_6', 'DEVEDORA', 2, '6', true),
  conta('7', 'Rendimentos e ganhos', 'CLASSE_7', 'CREDORA', 1, null, false),
  conta('71', 'Vendas', 'CLASSE_7', 'CREDORA', 2, '7', true),
];

const ag = (codigo: string, tipo: 'DEBITO' | 'CREDITO', v: string): AgregadoPartidaBV => ({
  contaId: `id-${codigo}`, tipo, _sum: { valor: D(v) },
});

// Saldos (apurados à mão): 1 D900 · 11 D600 · 12 D300 · 121 D500 · 122 C200 ·
// 4 zero · 42 zero · 421 D100 · 422 C100 · 6 D450 · 62/621/6211 D150 · 6212 ZERO
// (D50 C50) · 63 D300 · 7/71 C1500 · SINT D30 (6211 D30 em anos anteriores).
const MOV: AgregadoPartidaBV[] = [
  ag('11', 'DEBITO', '1000'), ag('11', 'CREDITO', '400'),
  ag('121', 'DEBITO', '500'), ag('122', 'CREDITO', '200'),
  ag('421', 'DEBITO', '100'), ag('422', 'CREDITO', '100'),
  ag('6211', 'DEBITO', '150'), ag('6212', 'DEBITO', '50'), ag('6212', 'CREDITO', '50'),
  ag('63', 'DEBITO', '300'), ag('71', 'CREDITO', '1500'),
];
const NUCLEO = montarBalanceteVerificacao({
  contas: CONTAS, movimento: MOV, acumulado: MOV, anteriores: [ag('6211', 'DEBITO', '30')],
});

const BASE = ['1', '11', '12', '121', '122', 'SUB:1', '4', '42', '421', '422', 'SUB:4',
  '6', '62', '621', '6211', '6212', '63', 'SUB:6', '7', '71', 'SUB:7', 'SINT', 'SUB:8'];

describe('premissa: a entrada dos exemplos', () => {
  it('a hierarquia sem opções é a esperada', () => {
    expect(hierarquizarBalancete(NUCLEO, CONTAS).map(rotulo)).toEqual(BASE);
  });
});

describe('hierarquizarBalancete — incluirSemMovimento (§1)', () => {
  const base = hierarquizarBalancete(NUCLEO, CONTAS);
  const com = hierarquizarBalancete(NUCLEO, CONTAS, { incluirSemMovimento: true });
  const porRotulo = (h: LinhaHierarquica[], r: string) => h.find((l) => rotulo(l) === r);

  it('todas as contas do plano aparecem, na mesma floresta/ordem', () => {
    // «Esclarecimentos»: sem SUBTOTAL_CLASSE para classes sem linhas do núcleo (SUB:2 não existe).
    expect(com.map(rotulo)).toEqual([
      '1', '11', '12', '121', '122', '13', 'SUB:1', '2', '21',
      '4', '42', '421', '422', 'SUB:4',
      '6', '62', '621', '6211', '6212', '63', 'SUB:6', '7', '71', 'SUB:7', 'SINT', 'SUB:8',
    ]);
  });

  it('as contas sem movimento vêm a zeros, como CONTA, com o nível da conta', () => {
    for (const r of ['13', '2', '21']) {
      const l = porRotulo(com, r)!;
      expect(l, r).toBeDefined();
      expect(l.tipo, `${r}.tipo`).toBe('CONTA');
      expect(l.nivel, `${r}.nivel`).toBe(l.conta!.nivel);
      for (const k of COLS) expect(l[k].isZero(), `${r}.${k}`).toBe(true);
      expect(l.contraNatureza, `${r}.contraNatureza`).toBe(false);
      expect(l.implicita, `${r}.implicita`).toBe(false);
    }
    expect(porRotulo(com, '2')!.agregadora, '2 tem a filha 21 visível').toBe(true);
    expect(porRotulo(com, '21')!.agregadora, '21').toBe(false);
    expect(porRotulo(com, '13')!.agregadora, '13').toBe(false);
  });

  it('valores das linhas que já existiam, subtotais e sintética iguais aos de false', () => {
    for (const l of base) {
      const c = porRotulo(com, rotulo(l))!;
      expect(c, rotulo(l)).toBeDefined();
      for (const k of COLS) expect(c[k].equals(l[k]), `${rotulo(l)}.${k}`).toBe(true);
      if (l.tipo !== 'CONTA') expect(serial(c), rotulo(l)).toEqual(serial(l));
    }
  });

  it('sem a opção (ou com false) = comportamento S2', () => {
    expect(serial(hierarquizarBalancete(NUCLEO, CONTAS, { incluirSemMovimento: false }))).toEqual(serial(base));
  });
});

describe('filtrarBalancete — exemplos (§2)', () => {
  const h = congelar(hierarquizarBalancete(NUCLEO, CONTAS));
  const f = (filtros: FiltrosBalancete) => filtrarBalancete(h, filtros);

  /** Compara rótulos (com «*» = contexto) e garante valores intactos face à entrada. */
  function confere(saida: LinhaHierarquica[], esperado: string[], onde: string): void {
    expect(saida.map(rotuloCtx), onde).toEqual(esperado);
    for (const l of saida) {
      const orig = h.find((x) => rotulo(x) === rotulo(l))!;
      expect(semContexto(l), `${onde}: valores de ${rotulo(l)}`).toEqual(semContexto(orig));
      if (!rotuloCtx(l).endsWith('*')) expect(contextoDe(l) === true, `${onde}: ${rotulo(l)} não é contexto`).toBe(false);
    }
  }

  it('sem filtros activos devolve exactamente as linhas de entrada', () => {
    for (const filtros of [{}, { apenasComSaldo: false }, { excluir: [] }] as FiltrosBalancete[]) {
      const s = f(filtros);
      expect(s.map(rotulo), JSON.stringify(filtros)).toEqual(BASE);
      s.forEach((l, i) => {
        expect(semContexto(l)).toEqual(semContexto(h[i]!));
        expect(contextoDe(l) === true).toBe(false);
      });
    }
  });

  it('contaInicial: codigo ≥ inicial (texto); antepassado fora do intervalo fica como contexto', () => {
    confere(f({ contaInicial: '6' }), ['6', '62', '621', '6211', '6212', '63', 'SUB:6', '7', '71', 'SUB:7'], 'ci=6');
    confere(f({ contaInicial: '62' }), ['6*', '62', '621', '6211', '6212', '63', 'SUB:6', '7', '71', 'SUB:7'], 'ci=62');
  });

  it('contaFinal: «até 62» inclui 621 e 6211 (começa por) e deixa 63 de fora', () => {
    confere(
      f({ contaFinal: '62' }),
      ['1', '11', '12', '121', '122', 'SUB:1', '4', '42', '421', '422', 'SUB:4', '6', '62', '621', '6211', '6212', 'SUB:6'],
      'cf=62',
    );
    confere(f({ contaInicial: '62', contaFinal: '62' }), ['6*', '62', '621', '6211', '6212', 'SUB:6'], 'ci=cf=62');
  });

  it('classe: só as linhas dessa classe e o seu subtotal', () => {
    confere(f({ classe: 'CLASSE_6' }), ['6', '62', '621', '6211', '6212', '63', 'SUB:6'], 'classe 6');
    confere(f({ classe: 'CLASSE_8' }), ['SINT', 'SUB:8'], 'classe 8 (sintética)');
    confere(f({ classe: 'CLASSE_2' }), [], 'classe sem linhas');
  });

  it('excluir: a conta e todas as descendentes mostradas saem; o bloco vazio perde o subtotal', () => {
    confere(
      f({ excluir: ['12'] }),
      ['1', '11', 'SUB:1', '4', '42', '421', '422', 'SUB:4', '6', '62', '621', '6211', '6212', '63', 'SUB:6', '7', '71', 'SUB:7', 'SINT', 'SUB:8'],
      'excluir 12',
    );
    confere(
      f({ excluir: ['1', '62'] }),
      ['4', '42', '421', '422', 'SUB:4', '6', '63', 'SUB:6', '7', '71', 'SUB:7', 'SINT', 'SUB:8'],
      'excluir 1 e 62',
    );
    confere(f({ excluir: ['99999'] }), BASE, 'excluir código inexistente');
  });

  it('apenasComSaldo: sai a conta de saldo zero; mães de saldo zero ficam como contexto', () => {
    confere(
      f({ apenasComSaldo: true }),
      ['1', '11', '12', '121', '122', 'SUB:1', '4*', '42*', '421', '422', 'SUB:4',
        '6', '62', '621', '6211', '63', 'SUB:6', '7', '71', 'SUB:7', 'SINT', 'SUB:8'],
      'comSaldo',
    );
  });

  it('apenasComSaldo sobre a entrada com incluirSemMovimento esconde as contas a zeros', () => {
    const com = congelar(hierarquizarBalancete(NUCLEO, CONTAS, { incluirSemMovimento: true }));
    expect(
      filtrarBalancete(com, { apenasComSaldo: true }).map(rotuloCtx),
    ).toEqual(filtrarBalancete(h, { apenasComSaldo: true }).map(rotuloCtx));
  });

  it('pesquisa por código: só «começa por»', () => {
    confere(f({ pesquisa: '12' }), ['1*', '12', '121', '122', 'SUB:1'], 'q=12');
    confere(f({ pesquisa: '21' }), [], 'q=21 (621/6211 contêm 21 mas não começam por 21)');
  });

  it('pesquisa por nome: contém, sem maiúsculas nem acentos', () => {
    confere(f({ pesquisa: 'DEPOSITOS' }), ['1*', '12', 'SUB:1'], 'q=DEPOSITOS');
    confere(f({ pesquisa: 'depósitos' }), ['1*', '12', 'SUB:1'], 'q=depósitos');
    confere(f({ pesquisa: 'áGuA' }), ['6*', '62*', '621*', '6211', 'SUB:6'], 'q=áGuA');
    confere(f({ pesquisa: 'agua' }), ['6*', '62*', '621*', '6211', 'SUB:6'], 'q=agua');
    // Mãe que também passa P não é contexto.
    confere(f({ pesquisa: 'fornecedores' }), ['4*', '42', '421', '422', 'SUB:4'], 'q=fornecedores');
    confere(f({ pesquisa: 'TITULOS' }), ['4*', '42*', '422', 'SUB:4'], 'q=TITULOS');
  });

  it('combinação de filtros é conjunção (AND)', () => {
    confere(f({ classe: 'CLASSE_6', apenasComSaldo: true }), ['6', '62', '621', '6211', '63', 'SUB:6'], 'classe 6 + saldo');
    confere(f({ contaFinal: '62', excluir: ['12'], classe: 'CLASSE_1' }), ['1', '11', 'SUB:1'], 'cf + excluir + classe');
    confere(f({ pesquisa: 'fornec', contaInicial: '5' }), ['6*', '62', 'SUB:6'], 'q=fornec + ci=5');
    confere(f({ pesquisa: 'agua', excluir: ['62'] }), [], 'q=agua + excluir 62');
  });

  it('conta excluída nunca fica como contexto, mesmo com descendente que passa P', () => {
    confere(f({ pesquisa: '121', excluir: ['12'] }), [], 'q=121 sob 12 excluída');
    confere(f({ pesquisa: 'Standard', excluir: ['1'] }), [], 'q=Standard sob 1 excluída');
    confere(f({ apenasComSaldo: true, excluir: ['42'] }),
      ['1', '11', '12', '121', '122', 'SUB:1', '6', '62', '621', '6211', '63', 'SUB:6', '7', '71', 'SUB:7', 'SINT', 'SUB:8'],
      'comSaldo + excluir 42 (4 deixa de ter quem justifique o contexto)');
  });

  it('SINTETICA: segue classe e apenasComSaldo; sai com pesquisa ou intervalo', () => {
    expect(f({ apenasComSaldo: true }).some((l) => l.tipo === 'SINTETICA'), 'comSaldo (saldo 30)').toBe(true);
    expect(f({ excluir: ['1'] }).some((l) => l.tipo === 'SINTETICA'), 'excluir não a toca').toBe(true);
    expect(f({ excluir: ['8', '1', '6'] }).some((l) => l.tipo === 'SINTETICA'), 'excluir nunca a toca').toBe(true);
    expect(f({ classe: 'CLASSE_7' }).some((l) => l.tipo === 'SINTETICA'), 'classe 7').toBe(false);
    expect(f({ pesquisa: 'resultados' }).some((l) => l.tipo === 'SINTETICA'), 'pesquisa').toBe(false);
    // Intervalo que abrange TODOS os códigos: as contas ficam, a sintética sai e o bloco 8 fica vazio.
    const todas = BASE.filter((r) => r !== 'SINT' && r !== 'SUB:8');
    confere(f({ contaInicial: '0' }), todas, 'ci=0');
    confere(f({ contaFinal: '9' }), todas, 'cf=9');
  });

  it('SUBTOTAL_CLASSE: com classe só o dessa classe; valores nunca mudam', () => {
    const s = f({ classe: 'CLASSE_4', apenasComSaldo: true });
    expect(s.map(rotuloCtx)).toEqual(['4*', '42*', '421', '422', 'SUB:4']);
    const sub = s.find((l) => l.tipo === 'SUBTOTAL_CLASSE')!;
    expect(serial(sub)).toEqual(serial(h.find((l) => rotulo(l) === 'SUB:4')!));
    // Bloco só com linhas de contexto + correspondência: o subtotal aparece, com os valores completos.
    const sub6 = f({ pesquisa: 'agua' }).find((l) => rotulo(l) === 'SUB:6')!;
    expect(semContexto(sub6)).toEqual(semContexto(h.find((l) => rotulo(l) === 'SUB:6')!));
    expect(sub6.movD.equals(D('500')), `SUB:6.movD completo (150+50+300) e não só o da 6211: ${sub6.movD.toFixed()}`).toBe(true);
  });

  it('não altera a entrada (congelada) e é determinista', () => {
    const antes = serial(h);
    const a = f({ pesquisa: 'agua', apenasComSaldo: true });
    const b = f({ pesquisa: 'agua', apenasComSaldo: true });
    expect(serial(h)).toEqual(antes);
    expect(serial(b)).toEqual(serial(a));
  });
});

// ---------------------------------------------------------------------------
// EXEMPLO «63299» (G5 iter 1, «Esclarecimentos 2») — raiz órfã de nível 5 mostrada
// logo depois de uma subárvore funda (6 › 69 › 698 › 6981). Pela regra antiga
// (nível) 6981 seria a «mãe» de 63299; pela maeMostradaId não tem antepassados.
// ---------------------------------------------------------------------------

describe('filtrarBalancete — raiz órfã de nível > 1 depois de uma subárvore funda', () => {
  const contas: ContaBV[] = [
    conta('6', 'Gastos e perdas', 'CLASSE_6', 'DEVEDORA', 1, null, false),
    conta('69', 'Gastos e perdas financeiros', 'CLASSE_6', 'DEVEDORA', 2, '6', false),
    conta('698', 'Outros gastos financeiros', 'CLASSE_6', 'DEVEDORA', 3, '69', false),
    conta('6981', 'Diferenças de câmbio', 'CLASSE_6', 'DEVEDORA', 4, '698', true),
    conta('6982', 'Comissões bancárias', 'CLASSE_6', 'DEVEDORA', 4, '698', true), // sem movimento
    conta('63299', 'Formação do pessoal', 'CLASSE_6', 'DEVEDORA', 5, null, true), // ÓRFÃ, nível 5
  ];
  // 6981: D100 C100 ⇒ presente mas saldo zero (e 6/69/698 também); 63299: D40.
  const mov = [ag('6981', 'DEBITO', '100'), ag('6981', 'CREDITO', '100'), ag('63299', 'DEBITO', '40')];
  const nucleo = montarBalanceteVerificacao({ contas, movimento: mov, acumulado: mov, anteriores: [] });
  const h = congelar(hierarquizarBalancete(nucleo, contas));
  const hZeradas = congelar(hierarquizarBalancete(nucleo, contas, { incluirSemMovimento: true }));
  const r = (s: LinhaHierarquica[]) => s.map(rotuloCtx);

  it('premissa: 63299 vem logo depois de 6981, como raiz do bloco 6', () => {
    expect(h.map(rotulo)).toEqual(['6', '69', '698', '6981', '63299', 'SUB:6']);
    expect(hZeradas.map(rotulo)).toEqual(['6', '69', '698', '6981', '6982', '63299', 'SUB:6']);
    const l = h.find((x) => rotulo(x) === '63299')!;
    expect(maeMostradaDe(l), '63299.maeMostradaId').toBeNull();
    expect(maeMostradaDe(h.find((x) => rotulo(x) === '6981')!), '6981.maeMostradaId').toBe('id-698');
  });

  it('excluir 69 não esconde 63299 (não é sua mãe mostrada)', () => {
    expect(r(filtrarBalancete(h, { excluir: ['69'] }))).toEqual(['6', '63299', 'SUB:6']);
    expect(r(filtrarBalancete(h, { excluir: ['6981'] }))).toEqual(['6', '69', '698', '63299', 'SUB:6']);
    expect(r(filtrarBalancete(h, { excluir: ['6'] }))).toEqual(['63299', 'SUB:6']);
    expect(r(filtrarBalancete(h, { excluir: ['63299'] }))).toEqual(['6', '69', '698', '6981', 'SUB:6']);
  });

  it('pesquisa e intervalo: 63299 não arrasta 6/69/698/6981 como contexto', () => {
    expect(r(filtrarBalancete(h, { pesquisa: '63299' }))).toEqual(['63299', 'SUB:6']);
    expect(r(filtrarBalancete(h, { pesquisa: 'FORMACAO' }))).toEqual(['63299', 'SUB:6']);
    expect(r(filtrarBalancete(h, { contaInicial: '63299', contaFinal: '63299' }))).toEqual(['63299', 'SUB:6']);
    expect(r(filtrarBalancete(h, { contaInicial: '69' }))).toEqual(['6*', '69', '698', '6981', 'SUB:6']);
    expect(r(filtrarBalancete(h, { pesquisa: 'câmbio' }))).toEqual(['6*', '69*', '698*', '6981', 'SUB:6']);
  });

  it('zeradas + apenasComSaldo: só 63299, sem contexto', () => {
    expect(r(filtrarBalancete(h, { apenasComSaldo: true }))).toEqual(['63299', 'SUB:6']);
    expect(r(filtrarBalancete(hZeradas, { apenasComSaldo: true }))).toEqual(['63299', 'SUB:6']);
    // As contas a zeros entram com zeradas e saem com qualquer filtro que as não aceite.
    expect(r(filtrarBalancete(hZeradas, { pesquisa: 'comiss' }))).toEqual(['6*', '69*', '698*', '6982', 'SUB:6']);
  });
});

// ---------------------------------------------------------------------------
// PROPRIEDADES — planos aleatórios (bem-formados e corrompidos)
// ---------------------------------------------------------------------------

type MaeSpec = null | number | 'fora' | 'propria';
interface ContaSpec { codigo: string; classe: number; natureza: 'D' | 'C'; nivel: number; mae: MaeSpec; aceita: boolean }
interface AgSpec { alvo: number | 'fora'; tipo: 'D' | 'C'; centimos: number | null }
interface Cenario { contas: ContaSpec[]; movimento: AgSpec[]; acumulado: AgSpec[]; anteriores: AgSpec[] | null }

const NOMES = [
  'Depósitos à ordem', 'Caixa', 'Água e electricidade', 'Fornecedores', 'Clientes',
  'Imóveis', 'Gastos com pessoal', 'Vendas', 'Títulos negociáveis', 'Outros devedores',
];

const arbAg: fc.Arbitrary<AgSpec> = fc.record({
  alvo: fc.oneof({ weight: 6, arbitrary: fc.nat(39) }, { weight: 1, arbitrary: fc.constant('fora' as const) }),
  tipo: fc.constantFrom('D' as const, 'C' as const),
  centimos: fc.oneof({ weight: 9, arbitrary: fc.nat(1_000_000) }, { weight: 1, arbitrary: fc.constant(null) }),
});

const arbAgregados = (contas: fc.Arbitrary<ContaSpec[]>): fc.Arbitrary<Cenario> =>
  fc.record({
    contas,
    movimento: fc.array(arbAg, { maxLength: 30 }),
    acumulado: fc.array(arbAg, { maxLength: 30 }),
    anteriores: fc.oneof(
      { weight: 1, arbitrary: fc.constant(null) },
      { weight: 3, arbitrary: fc.array(arbAg, { maxLength: 30 }) },
    ),
  });

const arbCodigo = fc.stringMatching(/^[0-9]{1,5}$/);

const arbCenarioCorrompido: fc.Arbitrary<Cenario> = arbAgregados(
  fc.uniqueArray(
    fc.record({
      codigo: arbCodigo,
      classe: fc.integer({ min: 1, max: 8 }),
      natureza: fc.constantFrom('D' as const, 'C' as const),
      nivel: fc.integer({ min: 1, max: 7 }),
      mae: fc.oneof(
        { weight: 5, arbitrary: fc.nat(39) as fc.Arbitrary<MaeSpec> },
        { weight: 2, arbitrary: fc.constant(null) },
        { weight: 1, arbitrary: fc.constant('fora' as const) },
        { weight: 1, arbitrary: fc.constant('propria' as const) },
      ),
      aceita: fc.boolean(),
    }),
    { minLength: 1, maxLength: 40, selector: (c) => c.codigo },
  ),
);

/** Bem-formado: mãe j < i (acíclico), nivel = profundidade, classe = classe da raiz. */
const arbCenarioBemFormado: fc.Arbitrary<Cenario> = arbAgregados(
  fc
    .uniqueArray(
      fc.record({
        codigo: arbCodigo,
        classe: fc.integer({ min: 1, max: 8 }),
        natureza: fc.constantFrom('D' as const, 'C' as const),
        nivel: fc.constant(1),
        mae: fc.option(fc.nat(39), { freq: 4 }) as fc.Arbitrary<MaeSpec>,
        aceita: fc.boolean(),
      }),
      { minLength: 1, maxLength: 40, selector: (c) => c.codigo },
    )
    .map((specs) => {
      const out: ContaSpec[] = [];
      specs.forEach((s, i) => {
        let mae: number | null = typeof s.mae === 'number' && i > 0 ? s.mae % i : null;
        if (mae !== null && out[mae]!.nivel >= 7) mae = null;
        out.push(mae === null
          ? { ...s, mae: null, nivel: 1 }
          : { ...s, mae, nivel: out[mae]!.nivel + 1, classe: out[mae]!.classe });
      });
      return out;
    }),
);

function construirContas(specs: ContaSpec[]): ContaBV[] {
  const n = specs.length;
  const idDe = (i: number) => `id-${specs[i]!.codigo}`;
  return specs.map((s, i) => ({
    id: idDe(i),
    codigo: s.codigo,
    nome: NOMES[i % NOMES.length]!,
    classe: CLASSES[s.classe - 1]!,
    natureza: (s.natureza === 'D' ? 'DEVEDORA' : 'CREDORA') as NaturezaConta,
    nivel: s.nivel,
    contaMaeId:
      s.mae === null ? null
        : s.mae === 'fora' ? `id-fora-${s.codigo}`
          : s.mae === 'propria' ? idDe(i)
            : idDe(s.mae % n),
    aceitaLancamento: s.aceita,
  }));
}

function agregados(specs: AgSpec[], contas: ContaBV[]): AgregadoPartidaBV[] {
  return specs.map((a) => ({
    contaId: a.alvo === 'fora' ? 'id-outro-tenant' : contas[a.alvo % contas.length]!.id,
    tipo: a.tipo === 'D' ? 'DEBITO' : 'CREDITO',
    _sum: { valor: a.centimos === null ? null : new Prisma.Decimal(a.centimos).dividedBy(100) },
  }));
}

function montar(c: Cenario): { contas: ContaBV[]; nucleo: BalanceteVerificacaoNucleo } {
  const contas = construirContas(c.contas);
  const nucleo = montarBalanceteVerificacao({
    contas,
    movimento: agregados(c.movimento, contas),
    acumulado: agregados(c.acumulado, contas),
    anteriores: c.anteriores === null ? null : agregados(c.anteriores, contas),
  });
  return { contas, nucleo };
}

/** Opções da hierarquia que produzem a entrada do filtro. */
interface OpcoesSpec { nivelMaximo: number | null; apenasRazao: boolean; incluirSemMovimento: boolean }
const arbOpcoes: fc.Arbitrary<OpcoesSpec> = fc.record({
  nivelMaximo: fc.option(fc.integer({ min: 1, max: 7 }), { freq: 3 }),
  apenasRazao: fc.oneof({ weight: 5, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
  incluirSemMovimento: fc.boolean(),
});

function entrada(c: Cenario, o: OpcoesSpec): { contas: ContaBV[]; nucleo: BalanceteVerificacaoNucleo; h: LinhaHierarquica[] } {
  const { contas, nucleo } = montar(c);
  const h = hierarquizarBalancete(nucleo, contas, {
    ...(o.nivelMaximo === null ? {} : { nivelMaximo: o.nivelMaximo }),
    ...(o.apenasRazao ? { apenasRazao: true } : {}),
    ...(o.incluirSemMovimento ? { incluirSemMovimento: true } : {}),
  });
  return { contas, nucleo, h: congelar(h) };
}

/** Filtros em forma de índices, resolvidos contra os códigos do plano. */
type RefCodigo = string | number;
interface FiltroSpec {
  ci?: RefCodigo; cf?: RefCodigo; classe?: number; excluir?: (number | 'fora')[];
  apenasComSaldo?: boolean; pesquisa?: string | { i: number; len: number };
}
const arbRef: fc.Arbitrary<RefCodigo> = fc.oneof(fc.stringMatching(/^[0-9]{1,3}$/), fc.nat(39));
const arbFiltroSpec: fc.Arbitrary<FiltroSpec> = fc.oneof(
  { weight: 1, arbitrary: fc.constant({}) },
  {
    weight: 9,
    arbitrary: fc.record(
      {
        ci: arbRef,
        cf: arbRef,
        classe: fc.integer({ min: 1, max: 8 }),
        excluir: fc.array(fc.oneof({ weight: 4, arbitrary: fc.nat(39) }, { weight: 1, arbitrary: fc.constant('fora' as const) }), { minLength: 1, maxLength: 3 }),
        apenasComSaldo: fc.boolean(),
        pesquisa: fc.oneof(
          fc.constantFrom('dep', 'DEPÓSITOS', 'agua', 'ÁGUA', 'imoveis', 'Imóv', 'ordem', 'PESSOAL', 'títulos', 'xyz', 'é'),
          fc.record({ i: fc.nat(39), len: fc.nat(4) }),
        ),
      },
      { requiredKeys: [] },
    ),
  },
);

function resolver(s: FiltroSpec, contas: ContaBV[]): FiltrosBalancete {
  const cod = (r: RefCodigo) => (typeof r === 'string' ? r : contas[r % contas.length]!.codigo);
  const f: FiltrosBalancete = {};
  if (s.ci !== undefined) f.contaInicial = cod(s.ci);
  if (s.cf !== undefined) f.contaFinal = cod(s.cf);
  if (s.classe !== undefined) f.classe = CLASSES[s.classe - 1]!;
  if (s.excluir !== undefined) f.excluir = s.excluir.map((e) => (e === 'fora' ? '999999' : cod(e)));
  if (s.apenasComSaldo !== undefined) f.apenasComSaldo = s.apenasComSaldo;
  if (s.pesquisa !== undefined) {
    if (typeof s.pesquisa === 'string') f.pesquisa = s.pesquisa;
    else {
      const c = cod(s.pesquisa.i);
      f.pesquisa = c.slice(0, 1 + (s.pesquisa.len % c.length));
    }
  }
  return f;
}

const arbPlano = fc.oneof(arbCenarioBemFormado, arbCenarioCorrompido);

describe('filtrarBalancete — propriedades', () => {
  it('Q1 subsequência da entrada, valores intactos; sem filtros activos devolve a entrada', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(arbPlano, arbOpcoes, arbFiltroSpec, (c, o, fs) => {
        const { contas, h } = entrada(c, o);
        const f = resolver(fs, contas);
        const s = filtrarBalancete(h, f);
        const idx = indicesNaEntrada(s, h, JSON.stringify(f));
        s.forEach((l, k) => {
          expect(semContexto(l), `valores de ${rotulo(l)} com ${JSON.stringify(f)}`).toEqual(semContexto(h[idx[k]!]!));
          if (l.tipo !== 'CONTA') expect(contextoDe(l) === true, `${rotulo(l)} marcado contexto`).toBe(false);
        });
        if (!filtrosActivos(f)) {
          expect(s.map(rotulo), `sem filtros activos (${JSON.stringify(f)})`).toEqual(h.map(rotulo));
          for (const l of s) expect(contextoDe(l) === true, `${rotulo(l)} contexto sem filtros`).toBe(false);
        }
      }),
      PARAMS,
    );
  });

  it('Q2 cada CONTA da saída passa P ou é antepassada de uma que fica (contexto); nunca excluída', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(arbPlano, arbOpcoes, arbFiltroSpec, (c, o, fs) => {
        const { contas, h } = entrada(c, o);
        const f = resolver(fs, contas);
        const s = filtrarBalancete(h, f);
        const ref = referenciaContas(h, f);
        const idx = indicesNaEntrada(s, h, JSON.stringify(f));
        const mapa = `${JSON.stringify(f)} | entrada ${h.map(rotulo).join(' ')} | saída ${s.map(rotuloCtx).join(' ')}`;
        s.forEach((l, k) => {
          if (l.tipo !== 'CONTA') return;
          const r = ref.get(idx[k]!);
          expect(r, `${rotulo(l)} não devia estar na saída (não passa P, nem é antepassada de quem passa, ou está excluída): ${mapa}`).toBeDefined();
          if (r === 'P') expect(contextoDe(l) === true, `${rotulo(l)} passa P mas vem marcada contexto: ${mapa}`).toBe(false);
          else expect(contextoDe(l), `${rotulo(l)} só por contexto devia ter contexto: true: ${mapa}`).toBe(true);
        });
      }),
      PARAMS,
    );
  });

  it('Q3 nenhuma CONTA que passa P (e não está sob excluída) se perde, nem os seus antepassados', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(arbPlano, arbOpcoes, arbFiltroSpec, (c, o, fs) => {
        const { contas, h } = entrada(c, o);
        const f = resolver(fs, contas);
        const s = filtrarBalancete(h, f);
        const presentes = new Set(s.filter((l) => l.tipo === 'CONTA').map(rotulo));
        const mapa = `${JSON.stringify(f)} | entrada ${h.map(rotulo).join(' ')} | saída ${s.map(rotuloCtx).join(' ')}`;
        for (const [i, r] of referenciaContas(h, f)) {
          expect(presentes.has(rotulo(h[i]!)), `${rotulo(h[i]!)} (${r}) perdida: ${mapa}`).toBe(true);
        }
      }),
      PARAMS,
    );
  });

  it('Q4a SINTETICA segue classe/apenasComSaldo e sai com pesquisa ou intervalo; SUBTOTAL só da classe filtrada', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(arbPlano, arbOpcoes, arbFiltroSpec, (c, o, fs) => {
        const { contas, h } = entrada(c, o);
        const f = resolver(fs, contas);
        const s = filtrarBalancete(h, f);
        const sintIn = h.find((l) => l.tipo === 'SINTETICA');
        const sintOut = s.some((l) => l.tipo === 'SINTETICA');
        // «Esclarecimentos»: `excluir` nunca remove a SINTETICA.
        const esperada = !!sintIn &&
          !f.pesquisa && !f.contaInicial && !f.contaFinal &&
          (f.classe === undefined || f.classe === 'CLASSE_8') &&
          (f.apenasComSaldo !== true || !sintIn.saldoDevedor.isZero() || !sintIn.saldoCredor.isZero());
        expect(sintOut, `SINTETICA com ${JSON.stringify(f)}`).toBe(esperada);
        if (f.classe !== undefined) {
          for (const l of s.filter((x) => x.tipo === 'SUBTOTAL_CLASSE')) {
            expect(l.classe, `SUB de outra classe com classe=${f.classe}`).toBe(f.classe);
          }
        }
        if (!filtrosActivos(f)) {
          expect(s.filter((l) => l.tipo === 'SUBTOTAL_CLASSE').length).toBe(h.filter((l) => l.tipo === 'SUBTOTAL_CLASSE').length);
        }
      }),
      PARAMS,
    );
  });

  it('Q4b (plano bem-formado) SUBTOTAL aparece ⇔ sem filtros, ou o bloco ficou com linhas (e é da classe filtrada)', { timeout: 120_000 }, () => {
    // Só em planos bem-formados: num plano corrompido uma conta pode aparecer no
    // bloco de outra classe e «o bloco da sua classe» deixa de ser inequívoco.
    fc.assert(
      fc.property(arbCenarioBemFormado, arbOpcoes, arbFiltroSpec, (c, o, fs) => {
        const { contas, h } = entrada(c, o);
        const f = resolver(fs, contas);
        const s = filtrarBalancete(h, f);
        const activos = filtrosActivos(f);
        const subsSaida = new Set(s.filter((l) => l.tipo === 'SUBTOTAL_CLASSE').map(rotulo));
        // Plano bem-formado: a classe de cada linha é a classe do seu bloco.
        for (const sub of h.filter((l) => l.tipo === 'SUBTOTAL_CLASSE')) {
          const doBloco = s.filter((l) => l.tipo !== 'SUBTOTAL_CLASSE' && l.classe === sub.classe).length;
          const esperado = !activos || (doBloco > 0 && (f.classe === undefined || f.classe === sub.classe));
          expect(subsSaida.has(rotulo(sub)), `${rotulo(sub)} com ${JSON.stringify(f)}: saída ${s.map(rotuloCtx).join(' ')}`).toBe(esperado);
        }
      }),
      PARAMS,
    );
  });

  it('Q5 pura: a entrada congelada fica intacta; duas chamadas dão o mesmo', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(arbPlano, arbOpcoes, arbFiltroSpec, (c, o, fs) => {
        const { contas, h } = entrada(c, o);
        const f = resolver(fs, contas);
        const fCopia = serial(f);
        const antes = serial(h);
        const a = filtrarBalancete(h, f);
        expect(serial(h), 'entrada alterada').toEqual(antes);
        expect(serial(f), 'filtros alterados').toEqual(fCopia);
        expect(serial(filtrarBalancete(h, f)), 'segunda chamada difere').toEqual(serial(a));
      }),
      PARAMS,
    );
  });
});

describe('hierarquizarBalancete({ incluirSemMovimento }) — propriedades', () => {
  const valores = (l: LinhaHierarquica) => Object.fromEntries(COLS.map((k) => [k, l[k].toFixed()]));

  it('Q6 todas as contas do plano uma vez; valores, subtotais e totais iguais aos de false; novas a zeros', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(arbPlano, (c) => {
        const { contas, nucleo } = montar(c);
        const antesNucleo = serial(nucleo);
        const base = hierarquizarBalancete(nucleo, contas);
        const com = hierarquizarBalancete(nucleo, contas, { incluirSemMovimento: true });
        const mapa = `base ${base.map(rotulo).join(' ')} | com ${com.map(rotulo).join(' ')}`;

        // Todas as contas do plano, exactamente uma vez como CONTA.
        const ids = com.filter((l) => l.tipo === 'CONTA').map((l) => l.conta!.id);
        expect(new Set(ids).size, `conta repetida: ${mapa}`).toBe(ids.length);
        expect(new Set(ids), `contas do plano: ${mapa}`).toEqual(new Set(contas.map((k) => k.id)));

        // A saída sem a opção é subsequência da saída com ela (mesma floresta/ordem).
        indicesNaEntrada(base, com, 'base ⊑ com');

        // Valores das linhas que já existiam iguais; SINTETICA/SUBTOTAL idênticas.
        const comPorRotulo = new Map(com.map((l) => [rotulo(l), l]));
        const baseRotulos = new Set(base.map(rotulo));
        for (const l of base) {
          const x = comPorRotulo.get(rotulo(l))!;
          expect(valores(x), `valores de ${rotulo(l)}: ${mapa}`).toEqual(valores(l));
          if (l.tipo !== 'CONTA') expect(serial(x), `${rotulo(l)}: ${mapa}`).toEqual(serial(l));
        }
        // Linhas novas: só CONTA, a zeros («Esclarecimentos»: nenhum SUBTOTAL novo).
        for (const l of com) {
          if (baseRotulos.has(rotulo(l))) continue;
          expect(l.tipo, `linha nova ${rotulo(l)} não é CONTA: ${mapa}`).toBe('CONTA');
          for (const k of COLS) expect(l[k].isZero(), `${rotulo(l)}.${k} nova devia ser zero: ${mapa}`).toBe(true);
          expect(l.contraNatureza, `${rotulo(l)} nova contraNatureza`).toBe(false);
          if (l.tipo === 'CONTA') expect(l.nivel, `${rotulo(l)}.nivel`).toBe(l.conta!.nivel);
        }

        // Σ subtotais = totais do núcleo; núcleo intacto.
        const subs = com.filter((l) => l.tipo === 'SUBTOTAL_CLASSE');
        for (const k of ['movD', 'movC', 'acumD', 'acumC'] as const) {
          const soma = subs.reduce<Decimal>((a, l) => a.plus(l[k]), ZERO);
          expect(soma.equals(nucleo.totais[k]), `Σ SUB.${k} ${soma.toFixed()} ≠ total ${nucleo.totais[k].toFixed()}`).toBe(true);
        }
        expect(serial(nucleo), 'núcleo alterado').toEqual(antesNucleo);
      }),
      PARAMS,
    );
  });
});
