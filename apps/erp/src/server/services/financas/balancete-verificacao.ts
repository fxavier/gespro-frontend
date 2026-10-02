/**
 * Balancete de Verificação no modelo PHC — núcleo puro.
 *
 * Sem Prisma client, sem `server-only`, sem I/O. Recebe somas já agregadas
 * e devolve as linhas, totais e indicadores de equilíbrio.
 *
 * ADR-0040, run balancete-phc, issue #280.
 */
import { Prisma, type ClassePGC, type NaturezaConta } from '@prisma/client';

type Decimal = Prisma.Decimal;

// ---------------------------------------------------------------------------
// Interfaces públicas
// ---------------------------------------------------------------------------

/** Linha devolvida por `prisma.partidaLancamento.groupBy({ by: ['contaId','tipo'] })`. */
export interface AgregadoPartidaBV {
  contaId: string;
  tipo: 'DEBITO' | 'CREDITO';
  _sum: { valor: Decimal | null };
}

/** Vista estreita de ContaPGC que o núcleo precisa. */
export interface ContaBV {
  id: string;
  codigo: string;
  nome: string;
  classe: ClassePGC;
  natureza: NaturezaConta;
  nivel: number;
  contaMaeId: string | null;
  aceitaLancamento: boolean;
}

/** Uma linha do balancete de verificação (folha ou sintética). */
export interface LinhaBV {
  /** null apenas na linha sintética «Resultados de exercícios anteriores por encerrar». */
  conta: ContaBV | null;
  /** true apenas na linha sintética. */
  implicita: boolean;
  movD: Decimal;
  movC: Decimal;
  /** Períodos 1..final + abertura implícita (quando aplicável). */
  acumD: Decimal;
  acumC: Decimal;
  /** Um deles é sempre zero; ambos nunca negativos. s = acumD − acumC. */
  saldoDevedor: Decimal;
  saldoCredor: Decimal;
  /** DEVEDORA com saldoCredor > 0 ou CREDORA com saldoDevedor > 0. Sempre false na sintética. */
  contraNatureza: boolean;
}

/** Totais do balancete (folhas + sintética). */
export interface TotaisBV {
  movD: Decimal;
  movC: Decimal;
  acumD: Decimal;
  acumC: Decimal;
  saldoDevedor: Decimal;
  saldoCredor: Decimal;
}

/** Resultado completo do núcleo puro. */
export interface BalanceteVerificacaoNucleo {
  /** S1: só folhas (aceitaLancamento=true), por código como texto; sintética no fim. */
  linhas: LinhaBV[];
  /** Soma de folhas + sintética. */
  totais: TotaisBV;
  /** Igualdade exacta (Decimal) nos totais de cada coluna par. */
  equilibrio: { movimento: boolean; acumulado: boolean; saldo: boolean };
  /** Houve abertura implícita com algum valor não nulo (conta ou sintética). */
  temAberturaImplicita: boolean;
  /** Existe linha sintética «Resultados de exercícios anteriores por encerrar». */
  temResultadosAnterioresPorEncerrar: boolean;
}

// ---------------------------------------------------------------------------
// Classes de balanço vs. resultado
// ---------------------------------------------------------------------------

/** Classes cujo saldo anterior entra conta a conta no acumulado (ADR-0040 §4). */
const CLASSES_BALANCO = new Set<ClassePGC>([
  'CLASSE_1',
  'CLASSE_2',
  'CLASSE_3',
  'CLASSE_4',
  'CLASSE_5',
  'CLASSE_8',
]);

// ---------------------------------------------------------------------------
// Função principal
// ---------------------------------------------------------------------------

/**
 * Monta o balancete de verificação a partir de somas já agregadas.
 *
 * @param input.contas       - todas as contas do tenant (mães e folhas)
 * @param input.movimento    - somas das partidas nos períodos [inicial..final]
 * @param input.acumulado    - somas das partidas nos períodos [1..final]
 * @param input.anteriores   - somas das partidas antes do início do exercício;
 *                             null = o exercício tem lançamentos no diário AB
 *                             → sem abertura implícita
 */
export function montarBalanceteVerificacao(input: {
  contas: ContaBV[];
  movimento: AgregadoPartidaBV[];
  acumulado: AgregadoPartidaBV[];
  anteriores: AgregadoPartidaBV[] | null;
}): BalanceteVerificacaoNucleo {
  const zero = () => new Prisma.Decimal(0);

  // --- 1. Índice de contas válidas (guarda multi-tenant; qualquer conta com agregados entra) ---
  const contasPorId = new Map<string, ContaBV>();
  for (const c of input.contas) {
    contasPorId.set(c.id, c);
  }

  // --- 2. Estado acumulado por conta ---
  type Estado = { movD: Decimal; movC: Decimal; acumD: Decimal; acumC: Decimal };
  const mapa = new Map<string, Estado>();

  /** Devolve (ou cria) o estado da conta; null se não é uma folha conhecida. */
  const entrar = (contaId: string): Estado | null => {
    if (!contasPorId.has(contaId)) return null;
    if (!mapa.has(contaId)) {
      mapa.set(contaId, { movD: zero(), movC: zero(), acumD: zero(), acumC: zero() });
    }
    return mapa.get(contaId)!;
  };

  // --- 3. Acumular movimento ---
  for (const a of input.movimento) {
    const e = entrar(a.contaId);
    if (!e) continue;
    const v = a._sum.valor ?? zero();
    if (a.tipo === 'DEBITO') e.movD = e.movD.plus(v);
    else e.movC = e.movC.plus(v);
  }

  // --- 4. Acumular acumulado ---
  for (const a of input.acumulado) {
    const e = entrar(a.contaId);
    if (!e) continue;
    const v = a._sum.valor ?? zero();
    if (a.tipo === 'DEBITO') e.acumD = e.acumD.plus(v);
    else e.acumC = e.acumC.plus(v);
  }

  // --- 5. Abertura implícita (só quando anteriores !== null) ---
  let temAberturaImplicita = false;
  let sinteticaAcumD = zero();
  let sinteticaAcumC = zero();
  let hasSintetica = false;

  if (input.anteriores !== null) {
    // Agregar anteriores por conta (guarda multi-tenant)
    type AntEstado = { antD: Decimal; antC: Decimal };
    const antMapa = new Map<string, AntEstado>();

    for (const a of input.anteriores) {
      if (!contasPorId.has(a.contaId)) continue; // conta de outro tenant — descartar
      if (!antMapa.has(a.contaId)) antMapa.set(a.contaId, { antD: zero(), antC: zero() });
      const ae = antMapa.get(a.contaId)!;
      const v = a._sum.valor ?? zero();
      if (a.tipo === 'DEBITO') ae.antD = ae.antD.plus(v);
      else ae.antC = ae.antC.plus(v);
    }

    // Resultado acumulado das classes 6 e 7
    let R = zero();

    for (const [contaId, ae] of antMapa.entries()) {
      const conta = contasPorId.get(contaId)!;
      const liquido = ae.antD.minus(ae.antC); // líquido anterior desta conta

      if (conta.classe === 'CLASSE_6' || conta.classe === 'CLASSE_7') {
        // Classes de resultado: vai para a linha sintética
        R = R.plus(liquido);
      } else if (CLASSES_BALANCO.has(conta.classe)) {
        // Classes de balanço (1–5, 8): entra conta a conta, pelo líquido
        if (!liquido.isZero()) {
          const e = entrar(contaId); // cria a entrada se não existe ainda
          if (e) {
            if (liquido.greaterThan(0)) e.acumD = e.acumD.plus(liquido);
            else e.acumC = e.acumC.plus(liquido.negated());
            temAberturaImplicita = true;
          }
        }
      }
      // CLASSE_3 (inventários/imobilizados) segue o mesmo caminho de balanço
    }

    // Linha sintética para R ≠ 0
    if (!R.isZero()) {
      if (R.greaterThan(0)) sinteticaAcumD = R;
      else sinteticaAcumC = R.negated();
      hasSintetica = true;
      temAberturaImplicita = true;
    }
  }

  // --- 6. Filtrar e construir linhas de contas (só folhas com algum valor) ---
  const linhas: LinhaBV[] = [];

  for (const [contaId, e] of mapa.entries()) {
    if (e.movD.isZero() && e.movC.isZero() && e.acumD.isZero() && e.acumC.isZero()) continue;

    const conta = contasPorId.get(contaId)!;
    const saldoLiquido = e.acumD.minus(e.acumC);
    const saldoDevedor = saldoLiquido.greaterThan(0) ? saldoLiquido : zero();
    const saldoCredor = saldoLiquido.lessThan(0) ? saldoLiquido.negated() : zero();

    const contraNatureza =
      (conta.natureza === 'DEVEDORA' && saldoCredor.greaterThan(0)) ||
      (conta.natureza === 'CREDORA' && saldoDevedor.greaterThan(0));

    linhas.push({
      conta,
      implicita: false,
      movD: e.movD,
      movC: e.movC,
      acumD: e.acumD,
      acumC: e.acumC,
      saldoDevedor,
      saldoCredor,
      contraNatureza,
    });
  }

  // --- 7. Ordenar por código (texto, como localeCompare do montarLinhasBalancete) ---
  linhas.sort((a, b) => a.conta!.codigo.localeCompare(b.conta!.codigo));

  // --- 8. Linha sintética ao fim (ADR-0040 §4) ---
  if (hasSintetica) {
    const saldoLiquido = sinteticaAcumD.minus(sinteticaAcumC);
    const saldoDevedor = saldoLiquido.greaterThan(0) ? saldoLiquido : zero();
    const saldoCredor = saldoLiquido.lessThan(0) ? saldoLiquido.negated() : zero();

    linhas.push({
      conta: null,
      implicita: true,
      movD: zero(),
      movC: zero(),
      acumD: sinteticaAcumD,
      acumC: sinteticaAcumC,
      saldoDevedor,
      saldoCredor,
      contraNatureza: false,
    });
  }

  // --- 9. Totais (folhas + sintética) ---
  const totais: TotaisBV = {
    movD: zero(),
    movC: zero(),
    acumD: zero(),
    acumC: zero(),
    saldoDevedor: zero(),
    saldoCredor: zero(),
  };
  for (const l of linhas) {
    totais.movD = totais.movD.plus(l.movD);
    totais.movC = totais.movC.plus(l.movC);
    totais.acumD = totais.acumD.plus(l.acumD);
    totais.acumC = totais.acumC.plus(l.acumC);
    totais.saldoDevedor = totais.saldoDevedor.plus(l.saldoDevedor);
    totais.saldoCredor = totais.saldoCredor.plus(l.saldoCredor);
  }

  // --- 10. Equilíbrio ---
  const equilibrio = {
    movimento: totais.movD.equals(totais.movC),
    acumulado: totais.acumD.equals(totais.acumC),
    saldo: totais.saldoDevedor.equals(totais.saldoCredor),
  };

  return {
    linhas,
    totais,
    equilibrio,
    temAberturaImplicita,
    temResultadosAnterioresPorEncerrar: hasSintetica,
  };
}

// ---------------------------------------------------------------------------
// S2: Hierarquia com roll-up e subtotais por classe (ADR-0040 §5)
// ---------------------------------------------------------------------------

export type TipoLinhaHierarquica = 'CONTA' | 'SINTETICA' | 'SUBTOTAL_CLASSE';

export interface LinhaHierarquica extends LinhaBV {
  tipo: TipoLinhaHierarquica;
  /** nível da conta (1..7); SINTETICA = 2; SUBTOTAL_CLASSE = 1 */
  nivel: number;
  /** conta com filhas visíveis no balancete (negrito) */
  agregadora: boolean;
  classe: ClassePGC;
  /**
   * S3: id da conta mostrada imediatamente acima na árvore efectiva (antepassado
   * visível mais próximo depois de nivelMaximo/apenasRazao); null nas raízes,
   * SUBTOTAL_CLASSE e SINTETICA.
   */
  maeMostradaId: string | null;
  /** S3: 0 nas raízes do bloco, +1 por cada mãe mostrada; SUBTOTAL_CLASSE 0, SINTETICA 1. */
  profundidade: number;
  /** S3: linha mantida por `filtrarBalancete` só como antepassada de uma que passa os filtros. */
  contexto?: boolean;
}


const CLASSES_ORDEM: ClassePGC[] = [
  'CLASSE_1', 'CLASSE_2', 'CLASSE_3', 'CLASSE_4',
  'CLASSE_5', 'CLASSE_6', 'CLASSE_7', 'CLASSE_8',
];

type Valores = { movD: Decimal; movC: Decimal; acumD: Decimal; acumC: Decimal };

const valoresZero = (): Valores => ({
  movD: new Prisma.Decimal(0),
  movC: new Prisma.Decimal(0),
  acumD: new Prisma.Decimal(0),
  acumC: new Prisma.Decimal(0),
});

function somarEm(alvo: Valores, v: Valores): void {
  alvo.movD = alvo.movD.plus(v.movD);
  alvo.movC = alvo.movC.plus(v.movC);
  alvo.acumD = alvo.acumD.plus(v.acumD);
  alvo.acumC = alvo.acumC.plus(v.acumC);
}

function saldosDe(v: Valores): { saldoDevedor: Decimal; saldoCredor: Decimal } {
  const s = v.acumD.minus(v.acumC);
  return {
    saldoDevedor: s.greaterThan(0) ? s : new Prisma.Decimal(0),
    saldoCredor: s.lessThan(0) ? s.negated() : new Prisma.Decimal(0),
  };
}

const porCodigo = (a: ContaBV, b: ContaBV): number =>
  a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * Mãe EFECTIVA de cada conta — um mapa acíclico (floresta), calculado uma vez.
 *
 * 1. A mãe declarada vale se estiver no plano, não for a própria conta e a conta
 *    não estiver num ciclo de `contaMaeId` (as contas de um ciclo perdem a aresta
 *    declarada; quem só ENTRA num ciclo mantém a sua).
 * 2. Cadeia partida (mãe fora do plano, a própria, ou ciclo): uma conta de nível 1
 *    é raiz; as outras penduram-se na conta de nível 1 da sua classe (a de menor
 *    código), se existir e não fechar um ciclo com as arestas já decididas; senão
 *    são raiz.
 * `contaMaeId` null = raiz. Tudo iterativo: nada de recursão sobre o plano.
 */
function maesEfectivas(contaPorId: Map<string, ContaBV>): Map<string, string | null> {
  // Lê contaMaeId uma única vez por conta.
  const declarada = new Map<string, string | null>();
  for (const [id, c] of contaPorId) declarada.set(id, c.contaMaeId);

  // Contas em ciclo no grafo declarado (grafo funcional: cada conta tem ≤ 1 mãe).
  const emCiclo = new Set<string>();
  const estado = new Map<string, 'em-curso' | 'feito'>();
  for (const inicio of contaPorId.keys()) {
    const caminho: string[] = [];
    let cur: string | null | undefined = inicio;
    while (cur != null && contaPorId.has(cur) && !estado.has(cur)) {
      estado.set(cur, 'em-curso');
      caminho.push(cur);
      cur = declarada.get(cur);
    }
    if (cur != null && estado.get(cur) === 'em-curso') {
      for (let i = caminho.indexOf(cur); i < caminho.length; i++) emCiclo.add(caminho[i]!);
    }
    for (const id of caminho) estado.set(id, 'feito');
  }

  const nivel1PorClasse = new Map<ClassePGC, ContaBV>();
  for (const c of contaPorId.values()) {
    const actual = nivel1PorClasse.get(c.classe);
    if (c.nivel === 1 && (!actual || porCodigo(c, actual) < 0)) nivel1PorClasse.set(c.classe, c);
  }

  const mae = new Map<string, string | null>();
  const partidas: ContaBV[] = [];
  for (const [id, c] of contaPorId) {
    const m = declarada.get(id) ?? null;
    if (m === null) mae.set(id, null);
    else if (m !== id && contaPorId.has(m) && !emCiclo.has(id)) mae.set(id, m);
    else { mae.set(id, null); partidas.push(c); }
  }

  // Arestas de recurso, uma a uma, recusando as que fechariam um ciclo.
  const chegaA = (de: string, alvo: string): boolean => {
    for (let cur: string | null | undefined = de; cur != null; cur = mae.get(cur)) {
      if (cur === alvo) return true;
    }
    return false;
  };
  for (const c of partidas.sort(porCodigo)) {
    if (c.nivel === 1) continue; // nível 1 com cadeia partida é raiz do seu bloco
    const n1 = nivel1PorClasse.get(c.classe);
    if (n1 && n1.id !== c.id && !chegaA(n1.id, c.id)) mae.set(c.id, n1.id);
  }
  return mae;
}

/**
 * Transforma o núcleo + todas as contas numa lista hierárquica com roll-up.
 * Função pura: não altera o núcleo nem as contas.
 *
 * Tudo deriva da floresta de mães efectivas (`maesEfectivas`):
 * - presença: linhas do núcleo + os seus antepassados efectivos;
 * - roll-up: valores próprios do núcleo + os dos descendentes efectivos;
 * - filtros (nível PRÓPRIO da conta): uma linha visível pendura-se no antepassado
 *   visível mais próximo; os valores escondidos continuam nas mães;
 * - bloco = classe da raiz efectiva; ordem em pré-ordem, irmãs por código (texto);
 * - SUBTOTAL_CLASSE = Σ das linhas do núcleo da classe PRÓPRIA (+ sintética na 8).
 *
 * @param nucleo  - resultado de montarBalanceteVerificacao (não é modificado)
 * @param contas  - TODAS as contas do tenant (mães e folhas)
 * @param opcoes  - nivelMaximo: oculta CONTA com nivel > N; apenasRazao: só nivel 2 (ganha);
 *                  incluirSemMovimento: todas as contas do plano, as sem valores a zeros
 */
export function hierarquizarBalancete(
  nucleo: BalanceteVerificacaoNucleo,
  contas: ContaBV[],
  opcoes?: { nivelMaximo?: number; apenasRazao?: boolean; incluirSemMovimento?: boolean },
): LinhaHierarquica[] {
  const passaFiltro = (nivel: number): boolean =>
    opcoes?.apenasRazao ? nivel === 2 : nivel <= (opcoes?.nivelMaximo ?? Infinity);

  // --- Entradas ---
  const contaPorId = new Map<string, ContaBV>();
  for (const c of contas) if (!contaPorId.has(c.id)) contaPorId.set(c.id, c);
  const linhaDoNucleo = new Map<string, LinhaBV>();
  let sintetica: LinhaBV | undefined;
  for (const l of nucleo.linhas) {
    if (l.conta === null) { sintetica = l; continue; }
    linhaDoNucleo.set(l.conta.id, l);
    if (!contaPorId.has(l.conta.id)) contaPorId.set(l.conta.id, l.conta);
  }

  const mae = maesEfectivas(contaPorId);

  // --- Presença e roll-up: cada linha do núcleo sobe a sua cadeia efectiva ---
  const valores = new Map<string, Valores>();
  for (const [id, linha] of linhaDoNucleo) {
    for (let cur: string | null = id; cur !== null; cur = mae.get(cur) ?? null) {
      let v = valores.get(cur);
      if (!v) { v = valoresZero(); valores.set(cur, v); }
      somarEm(v, linha);
    }
  }
  // S3: com incluirSemMovimento, as restantes contas do plano entram a zeros.
  if (opcoes?.incluirSemMovimento) {
    for (const id of contaPorId.keys()) if (!valores.has(id)) valores.set(id, valoresZero());
  }
  // `valores` tem exactamente as contas presentes.

  // --- Mãe mostrada (antepassado visível mais próximo) e bloco (classe da raiz) ---
  const filhas = new Map<string | null, ContaBV[]>(); // null = raízes mostradas
  const maeMostrada = new Map<string, string | null>();
  const blocoDe = new Map<string, ClassePGC>();
  for (const id of valores.keys()) {
    const conta = contaPorId.get(id)!;
    if (!passaFiltro(conta.nivel)) continue;
    let mostrada: string | null = null;
    let raiz = id;
    for (let cur = mae.get(id) ?? null; cur !== null; cur = mae.get(cur) ?? null) {
      if (mostrada === null && passaFiltro(contaPorId.get(cur)!.nivel)) mostrada = cur;
      raiz = cur;
    }
    blocoDe.set(id, contaPorId.get(raiz)!.classe);
    maeMostrada.set(id, mostrada);
    const lista = filhas.get(mostrada) ?? [];
    lista.push(conta);
    filhas.set(mostrada, lista);
  }
  for (const lista of filhas.values()) lista.sort(porCodigo);

  // --- Subtotais pela classe PRÓPRIA da linha do núcleo ---
  const subtotais = new Map<ClassePGC, Valores>();
  for (const linha of linhaDoNucleo.values()) {
    const classe = linha.conta!.classe;
    const v = subtotais.get(classe) ?? valoresZero();
    somarEm(v, linha);
    subtotais.set(classe, v);
  }
  if (sintetica) {
    const v = subtotais.get('CLASSE_8') ?? valoresZero();
    somarEm(v, sintetica);
    subtotais.set('CLASSE_8', v);
  }

  // --- Emissão: por classe, o bloco em pré-ordem, a sintética (8) e o subtotal ---
  const linhaConta = (conta: ContaBV, profundidade: number): LinhaHierarquica => {
    const v = valores.get(conta.id)!;
    const agregadora = (filhas.get(conta.id)?.length ?? 0) > 0;
    const saldos = saldosDe(v);
    // contraNatureza pelo saldo MOSTRADO (roll-up); nunca numa agregadora.
    const contraNatureza = !agregadora && (
      (conta.natureza === 'DEVEDORA' && saldos.saldoCredor.greaterThan(0)) ||
      (conta.natureza === 'CREDORA' && saldos.saldoDevedor.greaterThan(0)));
    return {
      conta,
      implicita: false,
      movD: v.movD,
      movC: v.movC,
      acumD: v.acumD,
      acumC: v.acumC,
      ...saldos,
      contraNatureza,
      tipo: 'CONTA',
      nivel: conta.nivel,
      agregadora,
      classe: conta.classe,
      maeMostradaId: maeMostrada.get(conta.id) ?? null,
      profundidade,
    };
  };

  const resultado: LinhaHierarquica[] = [];
  for (const classe of CLASSES_ORDEM) {
    const raizes = (filhas.get(null) ?? []).filter((c) => blocoDe.get(c.id) === classe);
    const pilha = [...raizes].reverse().map((conta) => ({ conta, profundidade: 0 }));
    while (pilha.length > 0) {
      const { conta, profundidade } = pilha.pop()!;
      resultado.push(linhaConta(conta, profundidade));
      const fs = filhas.get(conta.id) ?? [];
      for (let i = fs.length - 1; i >= 0; i--) pilha.push({ conta: fs[i]!, profundidade: profundidade + 1 });
    }

    if (classe === 'CLASSE_8' && sintetica) {
      resultado.push({
        conta: null,
        implicita: true,
        movD: sintetica.movD,
        movC: sintetica.movC,
        acumD: sintetica.acumD,
        acumC: sintetica.acumC,
        ...saldosDe(sintetica),
        contraNatureza: false,
        tipo: 'SINTETICA',
        nivel: 2,
        agregadora: false,
        classe: 'CLASSE_8',
        maeMostradaId: null,
        profundidade: 1,
      });
    }

    const sub = subtotais.get(classe);
    if (sub) {
      resultado.push({
        conta: null,
        implicita: false,
        movD: sub.movD,
        movC: sub.movC,
        acumD: sub.acumD,
        acumC: sub.acumC,
        ...saldosDe(sub),
        contraNatureza: false,
        tipo: 'SUBTOTAL_CLASSE',
        nivel: 1,
        agregadora: false,
        classe,
        maeMostradaId: null,
        profundidade: 0,
      });
    }
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// S3: Filtros de apresentação (ADR-0040 §5 — nunca alteram totais nem subtotais)
// ---------------------------------------------------------------------------

export interface FiltrosBalancete {
  /** codigo >= contaInicial (texto). */
  contaInicial?: string;
  /** codigo <= contaFinal, ou começa por contaFinal (inclui as subcontas da final). */
  contaFinal?: string;
  /** Só linhas desta classe (CONTA, SINTETICA e SUBTOTAL). */
  classe?: ClassePGC;
  /** Códigos a esconder, com todas as linhas mostradas por baixo deles. */
  excluir?: string[];
  /** Só CONTA com saldo não nulo. */
  apenasComSaldo?: boolean;
  /** Código começa por / nome contém (sem maiúsculas nem acentos). */
  pesquisa?: string;
}

const normalizarTexto = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const temSaldo = (l: LinhaHierarquica): boolean => !l.saldoDevedor.isZero() || !l.saldoCredor.isZero();

/**
 * Filtra as linhas de `hierarquizarBalancete` para apresentação. Pura; a saída é
 * uma subsequência da entrada, com os mesmos valores.
 *
 * - CONTA fica se passa todos os filtros activos, ou como contexto (`contexto: true`)
 *   se é antepassada de uma que fica. Antepassada = a mãe mostrada (`maeMostradaId`),
 *   e a mãe dela, e assim por diante — nunca deduzida do `nivel`.
 * - `excluir` tira a conta e tudo o que se mostra por baixo dela (nem como contexto).
 * - SINTETICA segue `classe` e `apenasComSaldo`; sai com pesquisa ou intervalo de contas.
 * - SUBTOTAL_CLASSE fica se o seu bloco ficou com alguma linha (e é da classe filtrada).
 * - Sem filtros activos devolve as linhas tal como vieram.
 */
export function filtrarBalancete(linhas: LinhaHierarquica[], filtros: FiltrosBalancete): LinhaHierarquica[] {
  const { contaInicial, contaFinal, classe, apenasComSaldo, pesquisa } = filtros;
  const excluir = new Set(filtros.excluir ?? []);
  const q = pesquisa ? normalizarTexto(pesquisa) : '';
  const activos = !!contaInicial || !!contaFinal || classe !== undefined || excluir.size > 0 || apenasComSaldo === true || !!q;
  if (!activos) return [...linhas];

  const passa = (l: LinhaHierarquica): boolean => {
    const c = l.conta!;
    if (contaInicial && c.codigo < contaInicial) return false;
    if (contaFinal && c.codigo > contaFinal && !c.codigo.startsWith(contaFinal)) return false;
    if (classe !== undefined && l.classe !== classe) return false;
    if (apenasComSaldo && !temSaldo(l)) return false;
    if (q && !normalizarTexto(c.codigo).startsWith(q) && !normalizarTexto(c.nome).includes(q)) return false;
    return true;
  };

  // 1.ª passagem: mãe mostrada (índice de uma linha CONTA anterior), raiz e exclusão.
  // A mãe vem sempre antes da filha (pré-ordem), por isso uma passagem chega.
  const indicePorId = new Map<string, number>();
  const mae: (number | null)[] = linhas.map(() => null);
  const raiz: number[] = linhas.map((_, i) => i);
  const excluida: boolean[] = linhas.map(() => false);
  const fica: ('P' | 'ctx' | null)[] = linhas.map(() => null);
  linhas.forEach((l, i) => {
    if (l.tipo !== 'CONTA') return;
    const m = l.maeMostradaId === null ? null : (indicePorId.get(l.maeMostradaId) ?? null);
    mae[i] = m;
    raiz[i] = m === null ? i : raiz[m]!;
    excluida[i] = excluir.has(l.conta!.codigo) || (m !== null && excluida[m]!);
    if (!excluida[i] && passa(l)) fica[i] = 'P';
    indicePorId.set(l.conta!.id, i);
  });
  // Antepassadas de quem fica: contexto (as não excluídas; a exclusão herda-se, logo nunca o são).
  linhas.forEach((_, i) => {
    if (fica[i] !== 'P') return;
    for (let m = mae[i]!; m !== null && fica[m] === null; m = mae[m]!) fica[m] = 'ctx';
  });

  const sinteticaFica = (l: LinhaHierarquica): boolean =>
    !q && !contaInicial && !contaFinal &&
    (classe === undefined || classe === 'CLASSE_8') &&
    (!apenasComSaldo || temSaldo(l));

  // 2.ª passagem: emissão. O bloco de uma linha é a classe da sua raiz mostrada
  // (a sintética é da 8); o subtotal fica se o seu bloco ficou com alguma linha.
  const saida: LinhaHierarquica[] = [];
  let blocosComLinhas = new Set<ClassePGC>();
  linhas.forEach((l, i) => {
    if (l.tipo === 'SUBTOTAL_CLASSE') {
      if (blocosComLinhas.has(l.classe) && (classe === undefined || classe === l.classe)) saida.push(l);
      blocosComLinhas = new Set();
    } else if (l.tipo === 'SINTETICA') {
      if (sinteticaFica(l)) { saida.push(l); blocosComLinhas.add('CLASSE_8'); }
    } else if (fica[i] !== null) {
      saida.push(fica[i] === 'ctx' ? { ...l, contexto: true } : l);
      blocosComLinhas.add(linhas[raiz[i]!]!.classe);
    }
  });
  return saida;
}
