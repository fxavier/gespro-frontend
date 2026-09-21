import 'server-only'; // A5: serviços são server-only

import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors';
import { prisma } from '@/server/db/client';
import type { Cenario, Granularidade } from '@/lib/validations/tesouraria';
import {
  diaCivilEmMaputo,
  FILTRO_LANCAMENTO_MAPA,
} from './contabilidade.service';
import type {
  Bucket,
  CompromissoBase,
  Ctx,
  Ocorrencia,
  PerfilAtraso,
} from './projecao.interface';

/**
 * Projecção de Tesouraria (spec 22 · WS-1).
 *
 * O ficheiro tem duas metades, por esta ordem:
 *
 *  1. NÚCLEO PURO (nó L2 + task 3.2-bis): funções puras exportadas, sem
 *     Prisma client, sem `Date.now()` — a data de referência é sempre
 *     parâmetro. É onde vivem os invariantes I2 (conservação), I3 (monotonia
 *     de cenário) e I5 (idempotência de recorrência), verificados pelo
 *     oráculo `__tests__/projecao.property.test.ts` (escrito por outro
 *     agente; ver doutrina 00 §2).
 *  2. CASCA DE I/O (nó L3): `saldoTesourariaAte` e `perfilAtraso`, que vão à
 *     base e delegam toda a aritmética no núcleo. Oráculo:
 *     `__tests__/projecao.integracao.test.ts`.
 *
 * Regras vinculativas: ADR-0036 §Decisão-2, -6, §9, §10 e §11; design §4.1-bis.
 * Precedente da casa: `montarLinhasBalancete`, `calcularLinhasDRE`.
 */

// ---------------------------------------------------------------------------
// Calendário — dias civis em Africa/Maputo
// ---------------------------------------------------------------------------

const DIA_MS = 86_400_000;

/**
 * Número de série do dia civil de `data` em Africa/Maputo (dias desde a época,
 * sobre o calendário proléptico — só serve para aritmética de dias inteiros).
 * Toda a comparação de datas neste módulo passa por aqui: o servidor corre em
 * UTC e um `getDate()` cru mudaria o dia de âncora (design §4.1-bis).
 */
function serialCivil(data: Date): number {
  const { ano, mes, dia } = diaCivilEmMaputo(data);
  return Date.UTC(ano, mes - 1, dia) / DIA_MS;
}

/** Componentes civis (ano, mês 1-based, dia) de um número de série. */
function civilDoSerial(serial: number): { ano: number; mes: number; dia: number } {
  const utc = new Date(serial * DIA_MS);
  return {
    ano: utc.getUTCFullYear(),
    mes: utc.getUTCMonth() + 1,
    dia: utc.getUTCDate(),
  };
}

/**
 * Materializa um dia civil como `Date`, pela convenção da casa para dias sem
 * hora: `new Date(ano, mes-1, dia, 12)` — nunca `new Date('aaaa-mm-dd')`, que
 * lê como UTC e a leste de Greenwich cai no dia anterior.
 */
function dataDoSerial(serial: number): Date {
  const { ano, mes, dia } = civilDoSerial(serial);
  return new Date(ano, mes - 1, dia, 12);
}

/** Último dia do mês (mês 1-based). Comprimentos de mês não dependem de fuso. */
function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0, 12).getDate();
}

const ZERO = new Prisma.Decimal(0);

// ---------------------------------------------------------------------------
// montarBuckets (task 2.1)
// ---------------------------------------------------------------------------

/**
 * Constrói a sequência de buckets vazios de `inicio` até
 * `inicio + horizonteDias` (dias civis em Africa/Maputo, extremos INCLUSIVE —
 * o exemplo canónico do design §4.1-bis exige que `2026-01-31 + 150 dias`
 * alcance `2026-06-30`). Horizonte zero produz um único bucket do próprio dia.
 *
 * Granularidades:
 *  - DIARIA: um bucket por dia civil;
 *  - SEMANAL: janelas de 7 dias a partir de `inicio`, última truncada;
 *  - MENSAL: meses civis (primeiro e último truncados ao horizonte) — é o que
 *    um tesoureiro espera ler numa linha «Setembro».
 *
 * Horizonte negativo (ou não-inteiro) LANÇA: o Zod trava `min(0)` na
 * fronteira, mas o núcleo não confia em quem o chama — devolver `[]` em
 * silêncio seria indistinguível de «não há compromissos» (oráculo I2).
 */
export function montarBuckets(
  inicio: Date,
  horizonteDias: number,
  granularidade: Granularidade,
): Bucket[] {
  if (!Number.isInteger(horizonteDias) || horizonteDias < 0) {
    throw new BusinessRuleError(
      'HORIZONTE_INVALIDO',
      `Horizonte de projecção inválido: ${String(horizonteDias)} dias.`,
    );
  }

  const s0 = serialCivil(inicio);
  const sFim = s0 + horizonteDias;
  const intervalos: Array<{ inicioS: number; fimS: number }> = [];

  switch (granularidade) {
    case 'DIARIA':
      for (let s = s0; s <= sFim; s++) {
        intervalos.push({ inicioS: s, fimS: s });
      }
      break;
    case 'SEMANAL':
      for (let s = s0; s <= sFim; s += 7) {
        intervalos.push({ inicioS: s, fimS: Math.min(s + 6, sFim) });
      }
      break;
    case 'MENSAL': {
      let s = s0;
      while (s <= sFim) {
        const { ano, mes } = civilDoSerial(s);
        const fimDoMesS =
          Date.UTC(ano, mes - 1, ultimoDiaDoMes(ano, mes)) / DIA_MS;
        const fimS = Math.min(fimDoMesS, sFim);
        intervalos.push({ inicioS: s, fimS });
        s = fimS + 1;
      }
      break;
    }
    default:
      // Totalidade sobre o enum: um `default` silencioso trataria uma
      // granularidade nova como vazio, sem erro — «mente baixo».
      throw new BusinessRuleError(
        'GRANULARIDADE_DESCONHECIDA',
        `Granularidade desconhecida: ${String(granularidade)}.`,
      );
  }

  return intervalos.map(({ inicioS, fimS }) => ({
    inicio: dataDoSerial(inicioS),
    fim: dataDoSerial(fimS),
    entradas: ZERO,
    saidas: ZERO,
    saldoInicial: ZERO,
    saldoFinal: ZERO,
    ocorrencias: [],
  }));
}

// ---------------------------------------------------------------------------
// distribuirCompromissos (task 2.3)
// ---------------------------------------------------------------------------

/**
 * Deslocamento (em dias) a aplicar às ENTRADAS não vencidas, por cenário
 * (ADR-0036 §Decisão-6). As SAÍDAS nunca se deslocam — o fornecedor não
 * atrasa o recebimento dele por simpatia. Total sobre o enum: um cenário
 * desconhecido LANÇA em vez de degradar para OTIMISTA em silêncio.
 *
 * O perfil chega já não-negativo: o truncamento `max(0, atraso)` é feito POR
 * OBSERVAÇÃO em `perfilAtraso` (L3, ADR-0036 §10). Um perfil negativo aqui é
 * defeito de quem chama — lança, porque aplicá-lo anteciparia as entradas do
 * BASE face ao OTIMISTA e inverteria o invariante I3.
 */
function deslocamentoEntradaDias(cenario: Cenario, perfil: PerfilAtraso): number {
  switch (cenario) {
    case 'OTIMISTA':
      return 0;
    case 'BASE':
      // R5.3: amostra insuficiente ⇒ BASE degrada para OTIMISTA (a UI di-lo).
      return perfil.amostraInsuficiente ? 0 : Math.round(perfil.atrasoMedioDias);
    case 'PESSIMISTA':
      return Math.round(perfil.atrasoMedioDias + perfil.desvioPadraoDias);
    default:
      throw new BusinessRuleError(
        'CENARIO_DESCONHECIDO',
        `Cenário de projecção desconhecido: ${String(cenario)}.`,
      );
  }
}

/** Vencidas há mais de este nº de dias saem do PESSIMISTA (ADR-0036 §6). */
const DIAS_EXCLUSAO_VENCIDAS_PESSIMISTA = 90;

/**
 * Distribui as ocorrências pelos buckets, aplicando o cenário às ENTRADAS.
 * Não muta os buckets nem as ocorrências recebidos.
 *
 *  - Vencidas (R2.4): entram no PRIMEIRO bucket, assinaladas, sem re-aplicar
 *    atraso (o atraso já aconteceu). Nunca omitidas — excepto, no PESSIMISTA,
 *    as ENTRADAS vencidas há mais de 90 dias (ADR-0036 §6).
 *  - Não vencidas: caem no bucket do seu dia civil (+ deslocamento de cenário
 *    quando ENTRADA); o que fica além do último bucket sai do horizonte.
 *
 * A marcação de `vencida` é de quem constrói a ocorrência (L3, contra a data
 * de referência) — este módulo confia na bandeira.
 */
export function distribuirCompromissos(
  buckets: Bucket[],
  ocorrencias: Ocorrencia[],
  cenario: Cenario,
  atraso: PerfilAtraso,
): Bucket[] {
  if (atraso.atrasoMedioDias < 0 || atraso.desvioPadraoDias < 0) {
    throw new BusinessRuleError(
      'PERFIL_ATRASO_INVALIDO',
      'Perfil de atraso com dias negativos: o truncamento em zero, por observação, é de quem apura o perfil (ADR-0036 §10).',
    );
  }
  // Valida o cenário mesmo sem ocorrências — a totalidade não depende do input.
  const deslocamento = deslocamentoEntradaDias(cenario, atraso);

  const novos: Bucket[] = buckets.map((b) => ({
    ...b,
    ocorrencias: [...b.ocorrencias],
  }));
  if (novos.length === 0) {
    return novos;
  }

  const fimS = novos.map((b) => serialCivil(b.fim));
  const referenciaS = serialCivil(novos[0].inicio);

  for (const ocorrencia of ocorrencias) {
    const sData = serialCivil(ocorrencia.data);

    if (
      ocorrencia.vencida &&
      cenario === 'PESSIMISTA' &&
      ocorrencia.tipo === 'ENTRADA' &&
      referenciaS - sData > DIAS_EXCLUSAO_VENCIDAS_PESSIMISTA
    ) {
      continue;
    }

    const desloca = !ocorrencia.vencida && ocorrencia.tipo === 'ENTRADA';
    const sDestino = desloca ? sData + deslocamento : sData;

    // Buckets contíguos e ascendentes: o primeiro cujo fim alcança o destino
    // é o que o contém — e as datas anteriores ao horizonte (vencidas) caem,
    // pelo mesmo critério, no primeiro bucket.
    const indice = fimS.findIndex((f) => sDestino <= f);
    if (indice === -1) {
      continue; // além do último bucket — fora do horizonte
    }

    const alvo = novos[indice];
    if (ocorrencia.tipo === 'ENTRADA') {
      alvo.entradas = alvo.entradas.plus(ocorrencia.valor);
    } else {
      alvo.saidas = alvo.saidas.plus(ocorrencia.valor);
    }
    alvo.ocorrencias.push(ocorrencia);
  }

  return novos;
}

// ---------------------------------------------------------------------------
// acumularSaldos (task 2.4)
// ---------------------------------------------------------------------------

/**
 * Preenche `saldoInicial`/`saldoFinal` em cadeia a partir do saldo de
 * abertura, em `Prisma.Decimal` exacto (invariante I2 — conservação):
 * `saldoFinal(n) == saldoInicial(n) + entradas(n) − saidas(n)` e o fecho de
 * um bucket é a abertura do seguinte. Não muta os buckets recebidos.
 */
export function acumularSaldos(
  buckets: Bucket[],
  saldoAbertura: Prisma.Decimal,
): Bucket[] {
  let saldo = saldoAbertura;
  return buckets.map((b) => {
    const saldoFinal = saldo.plus(b.entradas).minus(b.saidas);
    const novo: Bucket = { ...b, saldoInicial: saldo, saldoFinal };
    saldo = saldoFinal;
    return novo;
  });
}

// ---------------------------------------------------------------------------
// expandirRecorrencia (task 2.2)
// ---------------------------------------------------------------------------

/** Passo em meses de cada recorrência; `null` = ocorrência única. */
function passoEmMeses(recorrencia: CompromissoBase['recorrencia']): number | null {
  switch (recorrencia) {
    case 'UNICA':
      return null;
    case 'MENSAL':
      return 1;
    case 'TRIMESTRAL':
      return 3;
    case 'ANUAL':
      return 12;
    default:
      // Totalidade sobre o enum (oráculo I5): um `default` silencioso faria
      // uma futura SEMANAL desaparecer da projecção sem erro nenhum.
      throw new BusinessRuleError(
        'RECORRENCIA_DESCONHECIDA',
        `Recorrência desconhecida: ${String(recorrencia)}.`,
      );
  }
}

/**
 * Expande um compromisso manual nas suas ocorrências dentro de
 * `[dataPrevista, min(ate, dataFimRecorrencia)]`, em dias civis Africa/Maputo.
 *
 * Regra de calendário (ADR-0036 §9, design §4.1-bis): cada ocorrência cai em
 * `min(diaÂncora, últimoDiaDoMês)`, com o `diaÂncora` derivado SEMPRE da
 * `dataPrevista`, nunca da ocorrência anterior — mensal de 31 de Janeiro dá
 * 31 Jan · 28 Fev · 31 Mar · 30 Abr (sem drift, sem mês a dobrar). Dia civil,
 * não dia útil: não se desloca por fim-de-semana nem feriado.
 *
 * `dataFimRecorrencia` anterior à `dataPrevista` LANÇA
 * `BusinessRuleError('RECORRENCIA_INVALIDA')` (ADR-0036 §11): devolver vazio
 * seria indistinguível de «a recorrência terminou legitimamente».
 *
 * As ocorrências saem com `vencida: false` — a marcação contra a data de
 * referência é de quem chama (L3), que é quem a conhece.
 * Invariante I5: a expansão é determinista e idempotente.
 */
export function expandirRecorrencia(
  compromisso: CompromissoBase,
  ate: Date,
): Ocorrencia[] {
  const passo = passoEmMeses(compromisso.recorrencia);

  const sPrevista = serialCivil(compromisso.dataPrevista);
  const sFimRecorrencia =
    compromisso.dataFimRecorrencia === null
      ? null
      : serialCivil(compromisso.dataFimRecorrencia);
  if (sFimRecorrencia !== null && sFimRecorrencia < sPrevista) {
    throw new BusinessRuleError(
      'RECORRENCIA_INVALIDA',
      'Data de fim da recorrência anterior à data prevista (ADR-0036 §11).',
    );
  }

  const sLimite =
    sFimRecorrencia === null
      ? serialCivil(ate)
      : Math.min(serialCivil(ate), sFimRecorrencia);

  const ocorrencias: Ocorrencia[] = [];
  const emitir = (serial: number): void => {
    ocorrencias.push({
      origem: 'COMPROMISSO_MANUAL',
      origemId: compromisso.id,
      descricao: compromisso.descricao,
      tipo: compromisso.tipo,
      valor: compromisso.valor,
      data: dataDoSerial(serial),
      vencida: false,
    });
  };

  if (passo === null) {
    if (sPrevista <= sLimite) {
      emitir(sPrevista);
    }
    return ocorrencias;
  }

  const ancora = diaCivilEmMaputo(compromisso.dataPrevista);
  for (let k = 0; ; k++) {
    const mesesTotais = ancora.mes - 1 + k * passo;
    const ano = ancora.ano + Math.floor(mesesTotais / 12);
    const mes = (mesesTotais % 12) + 1;
    const dia = Math.min(ancora.dia, ultimoDiaDoMes(ano, mes));
    const serial = Date.UTC(ano, mes - 1, dia) / DIA_MS;
    if (serial > sLimite) {
      break;
    }
    emitir(serial);
  }
  return ocorrencias;
}

// ---------------------------------------------------------------------------
// marcarVencidas (task 3.2-bis) — puro
// ---------------------------------------------------------------------------

/**
 * Re-marca a bandeira `vencida` contra a data de referência (R2.4).
 *
 * «Anterior» é ESTRITO em dias civis de Africa/Maputo: uma ocorrência no
 * próprio dia da referência NÃO é vencida — está por liquidar hoje, não em
 * atraso. Marca ENTRADAS e SAÍDAS por igual (a bandeira depende da data, não
 * do tipo) e recalcula sempre a partir da data: um `vencida` pré-existente
 * não sobrevive à re-marcação. Pura: devolve ocorrências novas, sem mutar o
 * array nem os objectos recebidos.
 *
 * Existe porque `expandirRecorrencia` devolve sempre `vencida: false` — a
 * assinatura pura não recebe data de referência; a marcação é de quem a
 * conhece (a casca de I/O, contra o dia civil do pedido).
 */
export function marcarVencidas(
  ocorrencias: Ocorrencia[],
  dataReferencia: Date,
): Ocorrencia[] {
  const sReferencia = serialCivil(dataReferencia);
  return ocorrencias.map((o) => ({
    ...o,
    vencida: serialCivil(o.data) < sReferencia,
  }));
}

// ---------------------------------------------------------------------------
// calcularPerfilAtraso (task 3.2-bis) — puro
// ---------------------------------------------------------------------------

/** R5.3: abaixo disto a amostra é insuficiente e o BASE degrada para OTIMISTA. */
const AMOSTRA_MINIMA_PERFIL = 20;

/**
 * Perfil de atraso a partir dos atrasos CRUS em dias — possivelmente
 * negativos quando o cliente pagou adiantado.
 *
 * ADR-0036 §10, design §4.1-bis (regras arbitradas, não rediscutíveis):
 *  - O truncamento em zero é POR OBSERVAÇÃO: `max(0, atraso)` em CADA factura
 *    da amostra, ANTES de média e desvio. Truncar só a média daria a mesma
 *    média em muitos casos e um σ inflado por pagamentos adiantados — e um
 *    cliente que pagou adiantado uma vez não antecipa o próximo recebimento.
 *  - O desvio é AMOSTRAL (divisor `n − 1`): os 180 dias são uma amostra de
 *    que se infere o futuro, não a população; o σ maior dá um PESSIMISTA mais
 *    conservador, que é o lado certo para onde errar.
 *  - `n < 2` ⇒ σ = 0 por definição, nunca `NaN` — o `n − 1` dividiria por
 *    zero e um `NaN` propagado por `Decimal` rebenta longe da causa.
 *  - Amostra vazia ⇒ média 0, σ 0, `amostraInsuficiente: true`.
 *
 * Dias de atraso são `number` de propósito: são contagens de dias, não
 * dinheiro — o `Decimal` de ponta a ponta aplica-se aos valores.
 */
export function calcularPerfilAtraso(
  atrasosBrutosDias: number[],
): PerfilAtraso {
  const truncados = atrasosBrutosDias.map((a) => Math.max(0, a));
  const n = truncados.length;

  const media = n === 0 ? 0 : truncados.reduce((s, a) => s + a, 0) / n;
  const variancia =
    n < 2
      ? 0
      : truncados.reduce((s, a) => s + (a - media) ** 2, 0) / (n - 1);

  return {
    atrasoMedioDias: media,
    desvioPadraoDias: Math.sqrt(variancia),
    amostra: n,
    amostraInsuficiente: n < AMOSTRA_MINIMA_PERFIL,
  };
}

// ---------------------------------------------------------------------------
// Casca de I/O (nó L3) — saldoTesourariaAte e perfilAtraso
// ---------------------------------------------------------------------------

/**
 * Saldo de tesouraria até `data`, inclusive (ADR-0036 §Decisão-2):
 *
 *   Σ saldo do razão da conta contabilística  ∀ ContaBancaria com ativo = true
 * + Σ (fundoInicial + totalEntradas − totalSaidas)  ∀ SessaoCaixa ABERTA
 *
 * Responde «quanto dinheiro há», não «quanto há a receber» — contas a receber
 * são compromissos, não tesouraria.
 *
 * O saldo bancário vem SEMPRE do razão (partidas de lançamentos filtrados por
 * `FILTRO_LANCAMENTO_MAPA`, como o balancete — nunca um literal local, que
 * foi como quatro cópias divergiram; o par original+estorno soma zero). A
 * soma é por CONTA BANCÁRIA, não por conta PGC: duas contas bancárias
 * ancoradas na mesma conta contam-na duas vezes — letra do §Decisão-2.
 *
 * A agregação é um único `groupBy` para todas as contas (o orçamento do
 * §Decisão-5 é p95 < 400 ms e a correcção de um estouro seria a query, nunca
 * cache). Classe 1 é DEVEDORA: saldo = Σ débitos − Σ créditos.
 */
export async function saldoTesourariaAte(
  data: Date,
  ctx: Ctx,
): Promise<Prisma.Decimal> {
  let total = ZERO;

  const contasAtivas = await prisma.contaBancaria.findMany({
    where: { tenantId: ctx.tenantId, ativo: true },
    select: { contaContabilId: true },
  });

  if (contasAtivas.length > 0) {
    const contaIds = [...new Set(contasAtivas.map((c) => c.contaContabilId))];
    const agregados = await prisma.partidaLancamento.groupBy({
      by: ['contaId', 'tipo'],
      where: {
        tenantId: ctx.tenantId,
        contaId: { in: contaIds },
        lancamento: {
          status: FILTRO_LANCAMENTO_MAPA,
          data: { lte: data },
        },
      },
      _sum: { valor: true },
    });

    const saldoPorConta = new Map<string, Prisma.Decimal>();
    for (const a of agregados) {
      const acumulado = saldoPorConta.get(a.contaId) ?? ZERO;
      const valor = a._sum.valor ?? ZERO;
      saldoPorConta.set(
        a.contaId,
        a.tipo === 'DEBITO' ? acumulado.plus(valor) : acumulado.minus(valor),
      );
    }

    for (const cb of contasAtivas) {
      total = total.plus(saldoPorConta.get(cb.contaContabilId) ?? ZERO);
    }
  }

  const sessoesAbertas = await prisma.sessaoCaixa.findMany({
    where: { tenantId: ctx.tenantId, status: 'ABERTA' },
    select: { fundoInicial: true, totalEntradas: true, totalSaidas: true },
  });
  for (const s of sessoesAbertas) {
    total = total
      .plus(s.fundoInicial)
      .plus(s.totalEntradas)
      .minus(s.totalSaidas);
  }

  return total;
}

/** Janela da amostra do perfil de atraso (ADR-0036 §Decisão-6). */
const JANELA_PERFIL_DIAS = 180;

/**
 * Perfil de atraso de cobrança do tenant (R5.2-3): média e desvio padrão do
 * atraso sobre `Fatura` com status PAGA cujo `dataPagamento` cai nos últimos
 * 180 dias. Esta casca só vai à base buscar os atrasos CRUS — a aritmética
 * (truncamento por observação, desvio amostral, amostra insuficiente) vive
 * toda em `calcularPerfilAtraso`, onde é testável sem base de dados.
 *
 * Os dias de atraso são diferenças de DIAS CIVIS em Africa/Maputo
 * (`serialCivil`), nunca uma divisão de milissegundos: o servidor corre em
 * UTC e uma factura vencida às 23h de Maputo pagou-se «no dia seguinte» ou
 * «no próprio dia» consoante o fuso de quem dividir.
 */
export async function perfilAtraso(ctx: Ctx): Promise<PerfilAtraso> {
  const limite = new Date(Date.now() - JANELA_PERFIL_DIAS * DIA_MS);

  const pagas = await prisma.fatura.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: 'PAGA',
      dataPagamento: { gte: limite },
    },
    select: { dataPagamento: true, dataVencimento: true },
  });

  const atrasosBrutosDias: number[] = [];
  for (const f of pagas) {
    // O filtro `gte` já exclui nulos; o guard é para o sistema de tipos.
    if (f.dataPagamento === null) continue;
    atrasosBrutosDias.push(
      serialCivil(f.dataPagamento) - serialCivil(f.dataVencimento),
    );
  }

  return calcularPerfilAtraso(atrasosBrutosDias);
}
