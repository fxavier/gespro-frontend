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
