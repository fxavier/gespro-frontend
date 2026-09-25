import 'server-only';
import { Prisma } from '@prisma/client';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import {
  AtividadeFluxoEnum,
  AtividadeSeccaoEnum,
  type AtividadeFluxo,
  type AtividadeSeccao,
} from '@/lib/validations/fluxo-caixa';
import type { ContaBalancete } from './contabilidade.interface';
import {
  ERROS_DFC,
  type AvisoConfiguracao,
  type ClassificarVariacoesFn,
  type CoerenciaContasCaixaFn,
  type LinhaRubricaDFC,
  type MontarSeccoesDFCFn,
  type PeriodoHomologoFn,
  type RubricaResumo,
  type SeccaoDFC,
  type VariacaoClassificada,
  type VerificarArticulacaoFn,
  type VerificarMesmoExercicioFn,
} from './dfc.interface';

/**
 * Núcleo puro da Demonstração de Fluxos de Caixa — método indirecto
 * (spec 22 · WS-2 · ADR-0037 com a emenda de 2026-09-25; nó `nucleo` do
 * grafo `dfc`, ticket 3.1).
 *
 * Sem Prisma client, sem I/O, sem `Date.now()`: tudo entra por parâmetro e
 * sai por retorno. É aqui que vivem I6 (articulação), I8 (aditividade), V4
 * (mesmo exercício) e as regras E2/E3 da emenda; é o que os property tests
 * do nó `oraculos` exercitam em milissegundos. Precedente: `montarLinhasBalancete`
 * e `calcularLinhasDRE` em `contabilidade.service.ts`.
 *
 * A aritmética que garante I6, para quem vier mexer nisto:
 *   Seja Δ(c) a variação do saldo «em termos de débito» (débitos − créditos)
 *   da conta c entre o início e o fim do intervalo. Por partida dobrada,
 *   Σ_c Δ(c) = 0 sobre TODAS as contas com movimento.
 *   - Conta de caixa: `efeitoCaixa = +Δ(c)` — é a própria variação de caixa.
 *   - Conta de resultado (`tipo` GASTO/RENDIMENTO): representada pelo
 *     `resultadoLiquido` = −Σ Δ(c) sobre elas (I9). NÃO se soma outra vez
 *     numa secção — seria contar o resultado duas vezes.
 *   - Qualquer outra conta: `efeitoCaixa = −Δ(c)` (o aumento de um activo
 *     consome caixa; o aumento de um passivo liberta-a).
 *   Logo `resultadoLiquido + Σ_outras efeitoCaixa = Σ_caixa Δ(c) = Δcaixa`.
 *   O sinal traduz-se pela NATUREZA da conta, porque `saldoAtual` do
 *   balancete já vem assinado por ela: numa DEVEDORA `variacao = Δ(c)`, numa
 *   CREDORA `variacao = −Δ(c)`. É conta a conta (421 e 44331 são DEVEDORAS no
 *   seed; 3281 é ATIVO e CREDORA) — nunca por `tipo`, nunca por prefixo.
 */

const ZERO = new Prisma.Decimal(0);

const TIPOS_RESULTADO: ReadonlySet<ContaBalancete['conta']['tipo']> = new Set(['GASTO', 'RENDIMENTO']);

const ATIVIDADES: ReadonlySet<string> = new Set(AtividadeFluxoEnum.options);
const SECCOES: readonly AtividadeSeccao[] = AtividadeSeccaoEnum.options;

/** Ordenação por código, por ponto de código: determinista e independente da locale. */
function porCodigo(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * A regra do sinal, e só ela: um valor assinado pela natureza (como
 * `saldoAtual` do balancete, ou a sua variação) traduzido para «termos de
 * débito» (débitos − créditos). DEVEDORA: o valor; CREDORA: o simétrico.
 * `efeitoCaixaDe` e `saldoCaixaDe` derivam daqui — uma só fonte.
 */
function emTermosDeDebito(natureza: ContaBalancete['conta']['natureza'], valor: Prisma.Decimal): Prisma.Decimal {
  return natureza === 'DEVEDORA' ? valor : valor.negated();
}

/**
 * `efeitoCaixa` a partir da variação (pela natureza) — ver a aritmética no
 * cabeçalho. Numa conta `CAIXA` é a própria variação de caixa (+Δ em débito);
 * nas outras é o simétrico. A UI e os testes não reimplementam isto.
 */
function efeitoCaixaDe(
  natureza: ContaBalancete['conta']['natureza'],
  atividade: AtividadeFluxo,
  variacao: Prisma.Decimal,
): Prisma.Decimal {
  const deltaDebito = emTermosDeDebito(natureza, variacao);
  return atividade === 'CAIXA' ? deltaDebito : deltaDebito.negated();
}

/**
 * Saldo de caixa de um balancete, em TERMOS DE DÉBITO, sobre as contas
 * `contasCaixa` (ids das contas mapeadas a rubricas `CAIXA`). É o que o
 * serviço usa para `ColunaDFC.caixaInicial`/`caixaFinal` — e é o lado
 * direito de I6: `saldoCaixaDe(fim) − saldoCaixaDe(inicio)` é, por
 * construção, a Σ dos `efeitoCaixa` das variações `CAIXA`.
 *
 * NÃO é Σ `saldoAtual`: esse vem assinado pela natureza, e numa conta de
 * caixa CREDORA (129 Descobertos) o sinal fica trocado — um descoberto de
 * 100 e um depósito de 100 dariam +200 em vez de 0, e `DFC_NAO_ARTICULA`
 * em produção sem nenhum erro de classificação. O seed não tem nenhuma
 * conta `CAIXA` CREDORA, por isso a golden não o apanharia.
 */
export function saldoCaixaDe(balancete: ContaBalancete[], contasCaixa: ReadonlySet<string>): Prisma.Decimal {
  let saldo = ZERO;
  for (const linha of balancete) {
    if (!contasCaixa.has(linha.conta.id)) continue;
    saldo = saldo.plus(emTermosDeDebito(linha.conta.natureza, linha.saldoAtual));
  }
  return saldo;
}

// ---------------------------------------------------------------------------
// classificarVariacoes
// ---------------------------------------------------------------------------

export const classificarVariacoes: ClassificarVariacoesFn = (balanceteInicio, balanceteFim, mapa) => {
  // Uma conta com movimento em qualquer dos dois balancetes conta uma vez só.
  const contas = new Map<
    string,
    { conta: ContaBalancete['conta']; saldoInicial: Prisma.Decimal; saldoFinal: Prisma.Decimal }
  >();
  for (const linha of balanceteInicio) {
    const e = contas.get(linha.conta.id) ?? { conta: linha.conta, saldoInicial: ZERO, saldoFinal: ZERO };
    e.saldoInicial = linha.saldoAtual;
    contas.set(linha.conta.id, e);
  }
  for (const linha of balanceteFim) {
    const e = contas.get(linha.conta.id) ?? { conta: linha.conta, saldoInicial: ZERO, saldoFinal: ZERO };
    e.saldoFinal = linha.saldoAtual;
    contas.set(linha.conta.id, e);
  }

  const variacoes: VariacaoClassificada[] = [];
  const naoMapeadas: ContaBalancete['conta'][] = [];

  const ordenadas = Array.from(contas.values()).sort((a, b) => porCodigo(a.conta.codigo, b.conta.codigo));
  for (const { conta, saldoInicial, saldoFinal } of ordenadas) {
    const rubrica = mapa.get(conta.id);
    if (!rubrica) {
      // I7 na parte pura: não se silencia nem se lança — devolve-se, para que o
      // serviço a converta em impedimento, todas de uma vez.
      naoMapeadas.push(conta);
      continue;
    }
    const variacao = saldoFinal.minus(saldoInicial);
    variacoes.push({
      conta,
      rubricaId: rubrica.id,
      atividade: rubrica.atividade,
      saldoInicial,
      saldoFinal,
      variacao,
      efeitoCaixa: efeitoCaixaDe(conta.natureza, rubrica.atividade, variacao),
    });
  }

  return { variacoes, naoMapeadas };
};

// ---------------------------------------------------------------------------
// montarSeccoesDFC
// ---------------------------------------------------------------------------

export const montarSeccoesDFC: MontarSeccoesDFCFn = (resultadoLiquido, variacoes, rubricas) => {
  const rubricaPorId = new Map(rubricas.map((r) => [r.id, r]));

  // rubricaId → contas que pesam nela. Total sobre o enum: uma actividade
  // desconhecida lança, nunca cai num `default` silencioso (dinheiro que
  // desapareceria ANTES da articulação, que depois acusaria a conta errada).
  const contasPorRubrica = new Map<string, VariacaoClassificada[]>();
  for (const v of variacoes) {
    if (!ATIVIDADES.has(v.atividade)) {
      throw new ValidationError(`Actividade desconhecida na variação da conta ${v.conta.codigo}: ${String(v.atividade)}.`, {
        contaId: v.conta.id,
        atividade: v.atividade,
      });
    }
    const rubrica = rubricaPorId.get(v.rubricaId);
    if (!rubrica) {
      throw new ValidationError(`Rubrica ${v.rubricaId} da conta ${v.conta.codigo} não consta da lista de rubricas.`, {
        contaId: v.conta.id,
        rubricaId: v.rubricaId,
      });
    }
    if (rubrica.atividade !== v.atividade) {
      throw new ValidationError(
        `A conta ${v.conta.codigo} chega com actividade ${v.atividade} mas a rubrica ${rubrica.codigo} é ${rubrica.atividade}.`,
        { contaId: v.conta.id, rubricaId: v.rubricaId, atividade: v.atividade, atividadeRubrica: rubrica.atividade },
      );
    }
    // E2: uma conta de caixa tem uma só rubrica, logo fica fora das três actividades.
    if (v.atividade === 'CAIXA') continue;
    // I9: as contas de resultado estão representadas pelo `resultadoLiquido`.
    if (TIPOS_RESULTADO.has(v.conta.tipo)) continue;

    const lista = contasPorRubrica.get(v.rubricaId) ?? [];
    lista.push(v);
    contasPorRubrica.set(v.rubricaId, lista);
  }

  // A ordem de apresentação vem de `rubricas` (`atividade`, `ordem`, `codigo`);
  // rubricas sem contas com movimento não aparecem.
  const rubricasOrdenadas = [...rubricas].sort((a, b) => a.ordem - b.ordem || porCodigo(a.codigo, b.codigo));

  function seccao(atividade: AtividadeSeccao, abertura: Prisma.Decimal): SeccaoDFC {
    const linhas: LinhaRubricaDFC[] = [];
    let total = abertura;
    for (const rubrica of rubricasOrdenadas) {
      if (rubrica.atividade !== atividade) continue;
      const contas = contasPorRubrica.get(rubrica.id);
      if (!contas || contas.length === 0) continue;
      const ordenadas = [...contas].sort((a, b) => porCodigo(a.conta.codigo, b.conta.codigo));
      const valor = ordenadas.reduce((acc, c) => acc.plus(c.efeitoCaixa), ZERO);
      linhas.push({ rubrica: resumo(rubrica), valor, contas: ordenadas });
      total = total.plus(valor);
    }
    return { atividade, rubricas: linhas, total };
  }

  const [operacional, investimento, financiamento] = SECCOES.map((a) =>
    seccao(a, a === 'OPERACIONAL' ? resultadoLiquido : ZERO),
  );

  return {
    resultadoLiquido,
    operacional,
    investimento,
    financiamento,
    somaAtividades: operacional.total.plus(investimento.total).plus(financiamento.total),
  };
};

function resumo(r: RubricaResumo): RubricaResumo {
  return { id: r.id, codigo: r.codigo, designacao: r.designacao, atividade: r.atividade, sinal: r.sinal, ordem: r.ordem };
}

// ---------------------------------------------------------------------------
// verificarArticulacao (I6) — corre SEMPRE, em produção
// ---------------------------------------------------------------------------

export const verificarArticulacao: VerificarArticulacaoFn = (seccoes, variacaoCaixa) => {
  const somaAtividades = seccoes.somaAtividades;
  // `Decimal.equals`, sem tolerância: um `toFixed(2)` antes de comparar seria
  // uma tolerância, e uma asserção monetária com tolerância não asserta.
  if (somaAtividades.equals(variacaoCaixa)) return;
  const delta = somaAtividades.minus(variacaoCaixa);
  throw new BusinessRuleError(
    ERROS_DFC.DFC_NAO_ARTICULA,
    `A DFC não articula: a soma das actividades (${somaAtividades.toFixed()}) difere da variação de caixa (${variacaoCaixa.toFixed()}) em ${delta.toFixed()}.`,
    {
      // `toFixed()` sem argumento: notação posicional completa, sem expoente —
      // `toString()` passa a exponencial a partir de 1e21.
      delta: delta.toFixed(),
      somaAtividades: somaAtividades.toFixed(),
      variacaoCaixa: variacaoCaixa.toFixed(),
    },
  );
};

// ---------------------------------------------------------------------------
// verificarMesmoExercicio (V4) e periodoHomologo (E3)
// ---------------------------------------------------------------------------

export const verificarMesmoExercicio: VerificarMesmoExercicioFn = (inicio, fim) => {
  // O exercício decide antes da ordem: Dezembro de 2025 → Janeiro de 2026 é
  // «entre exercícios», e é isso que o utilizador tem de ler.
  if (inicio.exercicioId !== fim.exercicioId) {
    throw new BusinessRuleError(
      ERROS_DFC.DFC_ENTRE_EXERCICIOS,
      `O intervalo ${inicio.codigo} → ${fim.codigo} atravessa dois exercícios: a DFC é por exercício.`,
      { inicio: inicio.codigo, fim: fim.codigo },
    );
  }
  if (fim.ordem < inicio.ordem) {
    throw new BusinessRuleError(
      ERROS_DFC.DFC_INTERVALO_INVERTIDO,
      `O período final ${fim.codigo} é anterior ao inicial ${inicio.codigo}.`,
      { inicio: inicio.codigo, fim: fim.codigo },
    );
  }
};

export const periodoHomologo: PeriodoHomologoFn = (inicio, fim, periodosAnterior) => {
  if (!periodosAnterior || periodosAnterior.length === 0) return null;
  const homologoInicio = periodosAnterior.find((p) => p.ordem === inicio.ordem);
  const homologoFim = periodosAnterior.find((p) => p.ordem === fim.ordem);
  // Nunca um parcial: falta um dos dois, não há comparativo.
  if (!homologoInicio || !homologoFim) return null;
  return { inicio: homologoInicio, fim: homologoFim };
};

// ---------------------------------------------------------------------------
// coerenciaContasCaixa (E2)
// ---------------------------------------------------------------------------

export const coerenciaContasCaixa: CoerenciaContasCaixaFn = (contasCaixa) => {
  // A mesma conta duas vezes não é configuração: é um estado que o
  // `@@unique([tenantId, contaId])` proíbe e que, somado, contaria a caixa a
  // dobrar. Input fora do domínio — lança, não se normaliza em silêncio.
  const vistas = new Set<string>();
  for (const c of contasCaixa) {
    if (vistas.has(c.id)) {
      throw new ValidationError(`A conta ${c.codigo} aparece duas vezes nas contas de caixa.`, { contaId: c.id });
    }
    vistas.add(c.id);
  }

  if (contasCaixa.length === 0) {
    return {
      impedimentos: [
        'Nenhuma conta está mapeada à rubrica de caixa: sem contas de caixa não há variação de caixa nem articulação. Defina as contas de caixa em Fluxo de caixa › Rubricas.',
      ],
      avisos: [],
    };
  }

  const avisos: AvisoConfiguracao[] = [];
  for (const c of contasCaixa) {
    const conta = { id: c.id, codigo: c.codigo, nome: c.nome };
    if (c.classe !== 'CLASSE_1') {
      avisos.push({ codigo: 'CAIXA_FORA_CLASSE_1', conta, mensagem: `A conta ${c.codigo} ${c.nome} está fora da classe 1.` });
    }
    if (!c.aceitaLancamento) {
      avisos.push({
        codigo: 'CAIXA_CONTA_AGREGADORA',
        conta,
        mensagem: `A conta ${c.codigo} ${c.nome} é de agregação: não aceita lançamentos.`,
      });
    }
    if (!c.ativo) {
      avisos.push({ codigo: 'CAIXA_CONTA_INATIVA', conta, mensagem: `A conta ${c.codigo} ${c.nome} está inactiva.` });
    }
  }
  return { impedimentos: [], avisos };
};
