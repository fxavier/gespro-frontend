/**
 * ORÁCULO — renderBalancetePdf (run balancete-phc, S6, issue #286).
 * Contrato: .scratch/sdlc/balancete-phc/S6-contrato.md §«Documento» e §«Paginação».
 *
 * Escrito pelo AUTOR DO ORÁCULO antes de o documento existir. NUNCA `vitest -u`;
 * um agente de implementação que altere este ficheiro é BLOCKER.
 *
 * O PDF é o REAL (motor do ADR-0005, Helvetica); o texto extrai-se com o auxiliar
 * calibrado da DFC (`pdf-texto.ts`), página a página: cada stream de conteúdo é
 * passado sozinho ao extractor e a página identifica-se pelo seu «Página x de y».
 *
 * Leitura literal do contrato (o contrato não fixa a forma de `dados`/`emissao`;
 * fixa-se AQUI — questão em aberto reportada ao orquestrador):
 *
 *   import { renderBalancetePdf } from '@/lib/documents/pdf/balancete-pdf';
 *   renderBalancetePdf(
 *     dados: {
 *       entidade: { nome: string; nuit: string };
 *       exercicio: string;                 // código do exercício
 *       periodoInicial: number; periodoFinal: number; incluir13: boolean;
 *       tipo: TipoBalancete;               // de '@/lib/balancete-params'
 *       filtros: string;                   // descreverFiltros(p); '' ⇒ sem linha «Filtros»
 *       filtrosTiramLinhas: boolean;       // NOVO (Esclarecimentos 2026-10-02): true quando classe,
 *                                          // ci/cf, excluir, comSaldo ou q estão activos
 *       linhas: LinhaHierarquica[];        // as linhas mostradas (balanceteApresentado)
 *       totais: TotaisBV;                  // do balancete completo
 *       equilibrio: { movimento: boolean; acumulado: boolean; saldo: boolean };
 *     },
 *     emissao: { em: Date; por: string },  // «Emitido em …» e «por <utilizador>»
 *   ): Promise<Uint8Array>
 *
 * O tamanho de página não é parâmetro: o oráculo descobre-o — procura o N para o
 * qual `paginarBalancete(linhas, N)` dá exactamente a partição que o PDF mostra
 * (identificada pelas descrições das linhas, todas distintas). O fixture tem 150
 * linhas: força ≥ 3 páginas desde que a implementação ponha ≤ 50 linhas por página
 * (A4 horizontal a ~8 pt dá ~30).
 *
 * Asserções de texto sobre a forma COMPACTA (sem espaços, minúsculas):
 *  - «Exercício 2026 — períodos 3..5» (+ «com período 13» quando p13);
 *  - «Emitido em dd/mm/aaaa[,] hh:mm (Maputo)» — vírgula opcional (formatarDataHora);
 *  - «NUIT[:] <nuit>»;
 *  - Transporte / A transportar / Totais: o rótulo seguido IMEDIATAMENTE dos valores
 *    das colunas visíveis pela ordem Movimento D, C, Acumulado D, C, Saldo D, C,
 *    formatados como no ecrã (`formatNumero`, «—» para zero);
 *  - igualdades: «Movimento», «Acumulado», «Saldos» seguidos (até 3 sinais) de
 *    «equilibrado»/«desequilibrado».
 *
 * Esclarecimentos (orquestrador, 2026-10-02, após G5 iter 1) — acrescentado:
 *  - nº de páginas físicas (objectos `/Type /Page`, não `/Pages`) = N de «Página x de N»,
 *    com descrições longas a profundidade 5–6 e a linha «Filtros» no cabeçalho;
 *  - `filtrosTiramLinhas: true` ⇒ na última página «Total das linhas mostradas» (= último
 *    transporte + linhas que contam da última página) ANTES de «Totais do balancete (sem
 *    filtros)» com os totais do núcleo; `false` ⇒ só «Totais», sem linha extra. O campo é a
 *    entrada mínima que o documento precisa (a rota deriva-o dos parâmetros).
 *
 * Esclarecimentos 2 (2026-10-02, após G5 iter 2): nome da entidade e «por <utilizador>» com
 * ~150 caracteres ficam numa só linha (reticências). Verifica-se pela camada de texto: cada
 * linha do layout é um operador TJ próprio (calibrado no `pdf-texto.ts`), logo o início do
 * nome aparece num só troço e o fim do nome não aparece em troço nenhum à parte. A NÃO
 * sobreposição ao título exige posições (matriz de texto) — não verificada aqui.
 */
import { Prisma, type ClassePGC } from '@prisma/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { formatNumero } from '@/lib/format-currency';
import type { LinhaHierarquica, TotaisBV } from '@/server/services/financas/balancete-verificacao';
import {
  compactar,
  garantirExtractor,
  trocosDoPdf,
} from '@/app/api/contabilidade/dfc/export/__tests__/pdf-texto';

const documento = () => import('@/lib/documents/pdf/balancete-pdf');
const paginas = () => import('@/lib/documents/balancete-paginas');

type Decimal = Prisma.Decimal;
type Tipo = 'PERIODO' | 'ACUMULADO' | 'AMBOS';
const D = (v: string | number) => new Prisma.Decimal(v);

// ---------------------------------------------------------------------------
// Extracção por página
// ---------------------------------------------------------------------------

/** Texto compacto de cada página, indexado pela ordem (0 = «Página 1 de N»). */
function textoPorPagina(pdf: Uint8Array): { total: number; paginas: string[] } {
  const buf = Buffer.from(pdf);
  const bruto = buf.toString('latin1');
  const porNumero = new Map<number, string>();
  let total = 0;
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bruto))) {
    const ini = m.index + m[0].length;
    const fim = bruto.indexOf('endstream', ini);
    if (fim < 0) break;
    const isolado = Buffer.concat([Buffer.from('stream\n', 'latin1'), buf.subarray(ini, fim), Buffer.from('endstream', 'latin1')]);
    const texto = compactar(trocosDoPdf(new Uint8Array(isolado)).join(''));
    const pag = /página(\d+)de(\d+)/.exec(texto);
    if (pag) {
      porNumero.set(Number(pag[1]), (porNumero.get(Number(pag[1])) ?? '') + texto);
      total = Math.max(total, Number(pag[2]));
    }
    // Saltar o próprio «endstream\n»: senão a regex casava o «stream\n» dele e
    // engolia o stream seguinte num pedaço que não infla.
    re.lastIndex = fim + 'endstream'.length;
  }
  const paginasOrdenadas = Array.from({ length: total }, (_, i) => porNumero.get(i + 1) ?? '');
  return { total, paginas: paginasOrdenadas };
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const ENTIDADE = { nome: 'Mercearia Oráculo Lda', nuit: '400123456' };
const EMISSAO = { em: new Date('2026-10-02T23:30:00.000Z'), por: 'Ana Contabilista' }; // Maputo: 03/10/2026 01:30

let seq = 0;
function linhaConta(
  nome: string,
  v: [string, string, string, string, string, string],
  opcoes: { agregadora?: boolean; contexto?: boolean; nivel?: number; classe?: ClassePGC } = {},
): LinhaHierarquica {
  seq += 1;
  const classe = opcoes.classe ?? 'CLASSE_1';
  const nivel = opcoes.nivel ?? 2;
  const [movD, movC, acumD, acumC, saldoDevedor, saldoCredor] = v.map((x) => D(x)) as Decimal[];
  return {
    conta: {
      id: `c-${seq}`,
      codigo: `${classe.slice(-1)}${String(seq).padStart(3, '0')}`,
      nome,
      classe,
      natureza: 'DEVEDORA',
      nivel,
      contaMaeId: null,
      aceitaLancamento: !opcoes.agregadora,
    },
    implicita: false,
    movD: movD!, movC: movC!, acumD: acumD!, acumC: acumC!, saldoDevedor: saldoDevedor!, saldoCredor: saldoCredor!,
    contraNatureza: false,
    tipo: 'CONTA',
    nivel,
    agregadora: opcoes.agregadora ?? false,
    classe,
    maeMostradaId: null,
    profundidade: nivel - 1,
    ...(opcoes.contexto ? { contexto: true } : {}),
  };
}
function subtotal(classe: ClassePGC, t: TotaisBV): LinhaHierarquica {
  return {
    conta: null, implicita: false, ...t, contraNatureza: false,
    tipo: 'SUBTOTAL_CLASSE', nivel: 1, agregadora: false, classe, maeMostradaId: null, profundidade: 0,
  };
}

const CAMPOS = ['movD', 'movC', 'acumD', 'acumC', 'saldoDevedor', 'saldoCredor'] as const;
type Pagina = { linhas: LinhaHierarquica[]; transporte: TotaisBV | null; aTransportar: TotaisBV | null };
const zero = (): TotaisBV => ({ movD: D(0), movC: D(0), acumD: D(0), acumC: D(0), saldoDevedor: D(0), saldoCredor: D(0) });
const contaNaSoma = (l: LinhaHierarquica) =>
  (l.tipo === 'CONTA' && !l.agregadora && !l.contexto) || l.tipo === 'SINTETICA';
function somar(ls: LinhaHierarquica[]): TotaisBV {
  const r = zero();
  for (const l of ls.filter(contaNaSoma)) for (const k of CAMPOS) r[k] = r[k].plus(l[k]);
  return r;
}

/** Nome distinto por linha: «Rubrica 001 q» → compacto «rubrica001q». */
const nomeDe = (i: number) => `Rubrica ${String(i).padStart(3, '0')} q`;

/**
 * 150 linhas em 3 classes: por classe, uma agregadora + 48 folhas + subtotal.
 * Valores com cêntimos distintos (nenhum zero «perdido» na formatação) e alguns
 * zeros para o «—».
 */
function fixtureGrande(): { linhas: LinhaHierarquica[]; totais: TotaisBV } {
  seq = 0;
  const linhas: LinhaHierarquica[] = [];
  let n = 0;
  for (const classe of ['CLASSE_1', 'CLASSE_2', 'CLASSE_6'] as ClassePGC[]) {
    const folhas: LinhaHierarquica[] = [];
    for (let j = 0; j < 48; j++) {
      n += 1;
      const a = (1000 + n * 37.11).toFixed(2);
      const b = (n % 5 === 0 ? 0 : 200 + n * 3.07).toFixed(2);
      folhas.push(linhaConta(nomeDe(n), [a, b, (Number(a) * 2).toFixed(2), b, n % 2 ? a : '0', n % 2 ? '0' : b], { nivel: 2, classe }));
    }
    const s = somar(folhas);
    n += 1;
    linhas.push(linhaConta(nomeDe(n), CAMPOS.map((k) => s[k].toString()) as never, { agregadora: true, nivel: 1, classe }));
    linhas.push(...folhas);
    linhas.push(subtotal(classe, s));
  }
  return { linhas, totais: somar(linhas) };
}

const fmt = (d: Decimal) => (d.isZero() ? '—' : formatNumero(d.toString()));
function valoresVisiveis(t: TotaisBV, tipo: Tipo): string {
  const ks = [
    ...(tipo !== 'ACUMULADO' ? (['movD', 'movC'] as const) : []),
    ...(tipo !== 'PERIODO' ? (['acumD', 'acumC'] as const) : []),
    'saldoDevedor', 'saldoCredor',
  ] as const;
  return compactar(ks.map((k) => fmt(t[k])).join(''));
}

function dados(over: Partial<Record<string, unknown>> = {}) {
  const { linhas, totais } = fixtureGrande();
  return {
    entidade: ENTIDADE,
    exercicio: '2026',
    periodoInicial: 3,
    periodoFinal: 5,
    incluir13: false,
    tipo: 'AMBOS' as Tipo,
    filtros: '',
    filtrosTiramLinhas: false,
    linhas,
    totais,
    equilibrio: { movimento: true, acumulado: true, saldo: true },
    ...over,
  };
}

async function render(d: ReturnType<typeof dados>) {
  const { renderBalancetePdf } = await documento();
  // A forma de `dados` é a fixada no cabeçalho deste ficheiro.
  return renderBalancetePdf(d as never, EMISSAO as never) as Promise<Uint8Array>;
}

/** Os nomes (índices) das linhas «Rubrica nnn» presentes numa página. */
function nomesNaPagina(texto: string, linhas: LinhaHierarquica[]): string[] {
  return linhas
    .filter((l) => l.conta)
    .map((l) => compactar(l.conta!.nome))
    .filter((nome) => texto.includes(nome));
}

/** Descobre o N cuja paginação reproduz a partição do PDF. */
async function particaoDoPdf(texto: { paginas: string[] }, linhas: LinhaHierarquica[]) {
  const { paginarBalancete } = await paginas();
  const doPdf = texto.paginas.map((p) => nomesNaPagina(p, linhas));
  for (let n = 1; n <= linhas.length; n++) {
    const pag: Pagina[] = paginarBalancete(linhas, n);
    if (pag.length !== doPdf.length) continue;
    const ok = pag.every((pg, i) =>
      JSON.stringify(pg.linhas.filter((l) => l.conta).map((l) => compactar(l.conta!.nome))) === JSON.stringify(doPdf[i]),
    );
    if (ok) return pag;
  }
  throw new Error(`nenhum linhasPorPagina reproduz a partição do PDF: ${JSON.stringify(doPdf.map((x) => x.length))}`);
}

beforeAll(async () => {
  await garantirExtractor();
}, 30_000);

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

describe('renderBalancetePdf — forma', () => {
  it('é um PDF A4 horizontal', async () => {
    const pdf = await render(dados());
    expect(Buffer.from(pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
    const bruto = Buffer.from(pdf).toString('latin1');
    expect(bruto).toMatch(/\/MediaBox\s*\[\s*0\s+0\s+841\.89\d*\s+595\.28\d*\s*\]/);
    expect(bruto).not.toMatch(/\/MediaBox\s*\[\s*0\s+0\s+595\.28\d*\s+841\.89\d*\s*\]/);
  }, 60_000);
});

describe('renderBalancetePdf — várias páginas', () => {
  it('pelo menos 3 páginas, cada uma com «Página x de N»', async () => {
    const t = textoPorPagina(await render(dados()));
    expect(t.total).toBeGreaterThanOrEqual(3);
    t.paginas.forEach((p, i) => expect(p, `página ${i + 1}`).toContain(`página${i + 1}de${t.total}`));
  }, 60_000);

  it('cabeçalho em TODAS as páginas: entidade, NUIT, título, exercício/períodos, emissão em Maputo, utilizador', async () => {
    const t = textoPorPagina(await render(dados()));
    t.paginas.forEach((p, i) => {
      const onde = `página ${i + 1}`;
      expect(p, onde).toContain(compactar(ENTIDADE.nome));
      expect(p, onde).toMatch(/nuit:?400123456/);
      expect(p, onde).toContain(compactar('Balancete de verificação'));
      expect(p, onde).toContain(compactar('Exercício 2026 — períodos 3..5'));
      expect(p, onde).not.toContain(compactar('com período 13'));
      expect(p, onde).toMatch(/emitidoem03\/10\/2026,?01:30\(maputo\)/);
      expect(p, onde).toContain(compactar('por Ana Contabilista'));
      expect(p, onde).not.toContain('filtros:');
    });
  }, 60_000);

  it('todas as linhas aparecem, cada uma numa só página, e a partição é a de paginarBalancete', async () => {
    const d = dados();
    const t = textoPorPagina(await render(d));
    const pag = await particaoDoPdf(t, d.linhas);
    expect(pag.length).toBe(t.total);
    const vistos = t.paginas.flatMap((p) => nomesNaPagina(p, d.linhas));
    expect(new Set(vistos).size).toBe(vistos.length);
    expect(vistos).toHaveLength(d.linhas.filter((l) => l.conta).length);
  }, 60_000);

  it('«Transporte» nas páginas 2..n e «A transportar» nas 1..n-1, com os valores de paginarBalancete', async () => {
    const d = dados();
    const t = textoPorPagina(await render(d));
    const pag = await particaoDoPdf(t, d.linhas);
    pag.forEach((pg, i) => {
      const p = t.paginas[i]!;
      const onde = `página ${i + 1}`;
      if (i === 0) expect(p, onde).not.toContain('transporte');
      else expect(p, onde).toContain(`transporte${valoresVisiveis(pg.transporte!, 'AMBOS')}`);
      if (i === pag.length - 1) expect(p, onde).not.toContain('atransportar');
      else expect(p, onde).toContain(`atransportar${valoresVisiveis(pg.aTransportar!, 'AMBOS')}`);
    });
  }, 60_000);

  it('«Totais» e as três igualdades só na última página', async () => {
    const d = dados();
    const t = textoPorPagina(await render(d));
    const ultima = t.paginas[t.total - 1]!;
    expect(ultima).toContain(`totais${valoresVisiveis(d.totais, 'AMBOS')}`);
    expect(ultima).toMatch(/movimento[^a-z0-9]{0,3}equilibrado/);
    expect(ultima).toMatch(/acumulado[^a-z0-9]{0,3}equilibrado/);
    expect(ultima).toMatch(/saldos[^a-z0-9]{0,3}equilibrado/);
    expect(ultima).not.toContain('desequilibrado');
    for (const p of t.paginas.slice(0, -1)) {
      expect(p).not.toContain('totais');
      expect(p).not.toMatch(/saldos[^a-z0-9]{0,3}(des)?equilibrado/);
    }
  }, 60_000);

  it('igualdade falhada aparece como «desequilibrado» só nessa', async () => {
    const t = textoPorPagina(
      await render(dados({ equilibrio: { movimento: true, acumulado: false, saldo: true } })),
    );
    const ultima = t.paginas[t.total - 1]!;
    expect(ultima).toMatch(/acumulado[^a-z0-9]{0,3}desequilibrado/);
    expect(ultima).toMatch(/movimento[^a-z0-9]{0,3}equilibrado/);
    expect(ultima).toMatch(/saldos[^a-z0-9]{0,3}equilibrado/);
  }, 60_000);
});

describe('renderBalancetePdf — colunas por tipo', () => {
  it('PERIODO: sem Acumulado; transporte/totais só com Movimento e Saldo', async () => {
    const d = dados({ tipo: 'PERIODO', filtros: 'Por período' });
    const t = textoPorPagina(await render(d));
    const pag = await particaoDoPdf(t, d.linhas);
    const p1 = t.paginas[0]!;
    expect(p1).not.toContain('acumulado');
    expect(p1).toContain('movimento');
    expect(p1).toContain('devedor');
    expect(p1).toContain('credor');
    expect(p1).toContain(`atransportar${valoresVisiveis(pag[0]!.aTransportar!, 'PERIODO')}`);
    expect(t.paginas[1]).toContain(`transporte${valoresVisiveis(pag[1]!.transporte!, 'PERIODO')}`);
    expect(t.paginas[t.total - 1]).toContain(`totais${valoresVisiveis(d.totais, 'PERIODO')}`);
  }, 60_000);

  it('ACUMULADO: sem Movimento; transporte/totais só com Acumulado e Saldo', async () => {
    const d = dados({ tipo: 'ACUMULADO', filtros: 'Acumulado' });
    const t = textoPorPagina(await render(d));
    const pag = await particaoDoPdf(t, d.linhas);
    const p1 = t.paginas[0]!;
    expect(p1).not.toContain('movimento');
    expect(p1).toContain('acumulado');
    expect(p1).toContain(`atransportar${valoresVisiveis(pag[0]!.aTransportar!, 'ACUMULADO')}`);
    expect(t.paginas[t.total - 1]).toContain(`totais${valoresVisiveis(d.totais, 'ACUMULADO')}`);
  }, 60_000);

  it('AMBOS: as três famílias de colunas no cabeçalho da tabela', async () => {
    const t = textoPorPagina(await render(dados()));
    const p1 = t.paginas[0]!;
    for (const s of ['conta', 'descrição', 'movimento', 'acumulado', 'devedor', 'credor']) expect(p1).toContain(s);
  }, 60_000);
});

describe('renderBalancetePdf — filtros, p13 e uma só página', () => {
  it('«Filtros: …» em todas as páginas quando há filtros', async () => {
    const t = textoPorPagina(await render(dados({ filtros: 'Classe 6; Excluir 121' })));
    for (const p of t.paginas) expect(p).toContain(compactar('Filtros: Classe 6; Excluir 121'));
  }, 60_000);

  it('p13: «com período 13» no cabeçalho', async () => {
    const t = textoPorPagina(await render(dados({ periodoInicial: 1, periodoFinal: 13, incluir13: true })));
    for (const p of t.paginas) {
      expect(p).toContain(compactar('Exercício 2026 — períodos 1..13'));
      expect(p).toContain(compactar('com período 13'));
    }
  }, 60_000);

  it('balancete pequeno: «Página 1 de 1», sem transporte, com Totais e igualdades', async () => {
    seq = 0;
    const folhas = [
      linhaConta('Caixa sede', ['12345.67', '0', '12345.67', '0', '12345.67', '0']),
      linhaConta('Vendas', ['0', '12345.67', '0', '12345.67', '0', '12345.67'], { classe: 'CLASSE_7' }),
    ];
    const totais = somar(folhas);
    const t = textoPorPagina(await render({ ...dados(), linhas: folhas, totais }));
    expect(t.total).toBe(1);
    const p = t.paginas[0]!;
    expect(p).toContain('página1de1');
    expect(p).not.toContain('transporte');
    expect(p).not.toContain('atransportar');
    expect(p).toContain('caixasede');
    expect(p).toContain(`totais${valoresVisiveis(totais, 'AMBOS')}`);
    // zero vira «—» como no ecrã
    expect(p).toContain(compactar(`Caixa sede${fmt(D('12345.67'))}—${fmt(D('12345.67'))}—${fmt(D('12345.67'))}—`));
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Esclarecimentos 2026-10-02 (após G5 iter 1)
// ---------------------------------------------------------------------------

/** Objectos de página do PDF (`/Type /Page`, excluindo `/Type /Pages`). */
function paginasFisicas(pdf: Uint8Array): number {
  return (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page(?![A-Za-z])/g) ?? []).length;
}

const DESCRICOES_LONGAS = [
  'Material de manutenção e reparação - Viaturas ligeiras de passageiros',
  'Material de manutenção e reparação - Viaturas ligeiras de passageiros e mistas afectas à actividade comercial e administrativa da sede e das delegações provinciais',
  'Conservação e reparação de edifícios e outras construções - Armazéns, oficinas, estaleiros e instalações fabris arrendadas a terceiros com contrato plurianual',
  'Fornecimentos e serviços de terceiros - Trabalhos especializados de consultoria fiscal, jurídica, informática e de auditoria externa às contas do exercício',
];

/** ~130 linhas: cadeia de mães até ao nível 5 e folhas nos níveis 6–7 (profundidade 5–6), descrições longas. */
function fixtureLonga(): { linhas: LinhaHierarquica[]; totais: TotaisBV } {
  seq = 0;
  const linhas: LinhaHierarquica[] = [];
  for (const classe of ['CLASSE_6', 'CLASSE_2'] as ClassePGC[]) {
    const folhas: LinhaHierarquica[] = [];
    for (let j = 0; j < 60; j++) {
      const nivel = j % 2 ? 7 : 6;
      const a = (500 + j * 11.13).toFixed(2);
      folhas.push(linhaConta(`${DESCRICOES_LONGAS[j % DESCRICOES_LONGAS.length]!} ${j}`, [a, '0', a, '0', a, '0'], { nivel, classe }));
    }
    const s = somar(folhas);
    const v = CAMPOS.map((k) => s[k].toString()) as never;
    for (let nivel = 1; nivel <= 5; nivel++) {
      linhas.push(linhaConta(`${DESCRICOES_LONGAS[nivel % DESCRICOES_LONGAS.length]!} (mãe ${nivel})`, v, { agregadora: true, nivel, classe }));
    }
    linhas.push(...folhas);
    linhas.push(subtotal(classe, s));
  }
  return { linhas, totais: somar(linhas) };
}

describe('renderBalancetePdf — páginas físicas = «Página x de N» (Esclarecimentos)', () => {
  it('descrições longas a profundidade 5–6, com «Filtros»: nº de /Type /Page = N e cada página tem o seu número', async () => {
    const { linhas, totais } = fixtureLonga();
    const pdf = await render({
      ...dados({ filtros: 'Classe 6; Pesquisa "manutenção"', filtrosTiramLinhas: true }),
      linhas,
      totais,
    });
    const t = textoPorPagina(pdf);
    expect(t.total).toBeGreaterThanOrEqual(2);
    expect(paginasFisicas(pdf)).toBe(t.total);
    t.paginas.forEach((p, i) => expect(p, `página ${i + 1}`).toContain(`página${i + 1}de${t.total}`));
    for (const p of t.paginas) expect(p).toContain(compactar('Filtros: Classe 6; Pesquisa "manutenção"'));
  }, 60_000);

  it('o fixture grande também: nº de /Type /Page = N', async () => {
    const pdf = await render(dados({ filtros: 'Classe 6' }));
    expect(paginasFisicas(pdf)).toBe(textoPorPagina(pdf).total);
  }, 60_000);
});

describe('renderBalancetePdf — filtros que tiram linhas (Esclarecimentos)', () => {
  /** Totais do núcleo ≠ soma do que se mostra (há linhas escondidas pelos filtros). */
  function comEscondidas() {
    const d = dados({ filtros: 'Excluir 121', filtrosTiramLinhas: true });
    const extra = D('1000.01');
    const totais = { ...d.totais };
    for (const k of CAMPOS) totais[k] = totais[k].plus(extra);
    return { ...d, totais };
  }

  it('última página: «Total das linhas mostradas» = último transporte + linhas que contam, depois «Totais do balancete (sem filtros)»', async () => {
    const d = comEscondidas();
    const t = textoPorPagina(await render(d));
    const pag = await particaoDoPdf(t, d.linhas);
    const ultimaPag = pag[pag.length - 1]!;
    const mostradas = zero();
    for (const k of CAMPOS) {
      mostradas[k] = (ultimaPag.transporte?.[k] ?? D(0)).plus(somar(ultimaPag.linhas)[k]);
    }
    // calibração: o que se mostra é a soma de todas as linhas que contam
    for (const k of CAMPOS) expect(mostradas[k].toString()).toBe(somar(d.linhas)[k].toString());

    const ultima = t.paginas[t.total - 1]!;
    const linhaMostradas = `totaldaslinhasmostradas${valoresVisiveis(mostradas, 'AMBOS')}`;
    const linhaTotais = `${compactar('Totais do balancete (sem filtros)')}${valoresVisiveis(d.totais, 'AMBOS')}`;
    expect(ultima).toContain(linhaMostradas);
    expect(ultima).toContain(linhaTotais);
    expect(ultima.indexOf(linhaMostradas)).toBeLessThan(ultima.indexOf(linhaTotais));
    for (const p of t.paginas.slice(0, -1)) {
      expect(p).not.toContain('totaldaslinhasmostradas');
      expect(p).not.toContain('semfiltros');
    }
  }, 60_000);

  it('com tipo=PERIODO: as duas linhas só com Movimento e Saldo', async () => {
    const d = { ...comEscondidas(), tipo: 'PERIODO' as Tipo };
    const t = textoPorPagina(await render(d));
    const ultima = t.paginas[t.total - 1]!;
    expect(ultima).toContain(`totaldaslinhasmostradas${valoresVisiveis(somar(d.linhas), 'PERIODO')}`);
    expect(ultima).toContain(`${compactar('Totais do balancete (sem filtros)')}${valoresVisiveis(d.totais, 'PERIODO')}`);
  }, 60_000);

  it('sem filtros que tiram linhas (mesmo com «Filtros: Grau máximo 3; Por período»): só «Totais», sem linha extra', async () => {
    const d = dados({ filtros: 'Grau máximo 3', filtrosTiramLinhas: false });
    const t = textoPorPagina(await render(d));
    const ultima = t.paginas[t.total - 1]!;
    expect(ultima).toContain(`totais${valoresVisiveis(d.totais, 'AMBOS')}`);
    expect(ultima).not.toContain('totaldaslinhasmostradas');
    expect(ultima).not.toContain('semfiltros');
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Esclarecimentos 2 (2026-10-02) — nome da entidade e «por» numa só linha
// ---------------------------------------------------------------------------

describe('renderBalancetePdf — cabeçalho com nomes longos numa só linha (Esclarecimentos 2)', () => {
  const NOME_LONGO =
    'Sociedade Moçambicana de Distribuição, Comércio Geral, Importação e Exportação de Produtos Alimentares e Industriais do Norte e Centro, Limitada';
  const POR_LONGO =
    'Maria Fernanda dos Santos Mondlane Machel Chissano Guebuza Nyusi Tembe Cossa Macuácua Sitoe Bila Muianga Nhantumbo Chongo Matsinhe Zandamela Langa';

  /** Troços (linhas do layout) que contêm o fragmento, em forma compacta. */
  const trocosCom = (trocos: string[], fragmento: string) => trocos.filter((t) => compactar(t).includes(compactar(fragmento)));

  it('fixture: os nomes têm ~150 caracteres', () => {
    expect(NOME_LONGO.length).toBeGreaterThanOrEqual(140);
    expect(POR_LONGO.length).toBeGreaterThanOrEqual(140);
  });

  it('o nome da entidade e «por <utilizador>» não partem linha', async () => {
    seq = 0;
    const folhas = [linhaConta('Caixa sede', ['10.01', '0', '10.01', '0', '10.01', '0'])];
    const { renderBalancetePdf } = await documento();
    const pdf = (await renderBalancetePdf(
      { ...dados(), entidade: { nome: NOME_LONGO, nuit: '400123456' }, linhas: folhas, totais: somar(folhas) } as never,
      { em: EMISSAO.em, por: POR_LONGO } as never,
    )) as Uint8Array;
    const trocos = trocosDoPdf(pdf);

    for (const [rotulo, texto] of [['entidade', NOME_LONGO], ['por', `por ${POR_LONGO}`]] as const) {
      const inicio = texto.slice(0, 24);
      const fim = texto.slice(-24);
      const comInicio = trocosCom(trocos, inicio);
      expect(comInicio, `${rotulo}: início numa só linha`).toHaveLength(1);
      const resto = trocosCom(trocos, fim).filter((t) => t !== comInicio[0]);
      expect(resto, `${rotulo}: o fim não pode aparecer numa linha à parte`).toHaveLength(0);
    }
    // o título continua a ser o seu próprio troço
    expect(trocosCom(trocos, 'Balancete de verificação').length).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
